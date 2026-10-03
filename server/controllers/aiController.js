import prisma from "../configs/prisma.js";

// Format workspace data into a readable context string for the LLM
function formatWorkspaceContext(workspace) {
  let context = `WORKSPACE: "${workspace.name}"\n`;
  context += `Total Projects: ${workspace.projects.length}\n\n`;

  for (const project of workspace.projects) {
    context += `=== PROJECT: "${project.name}" (id: ${project.id}) ===\n`;
    context += `Description: ${project.description || "No description"}\n`;
    context += `Total Tasks: ${project.tasks.length}\n`;

    if (project.tasks.length === 0) {
      context += `  (No tasks yet)\n\n`;
      continue;
    }

    for (const task of project.tasks) {
      const assignee = task.assignee?.name || "Unassigned";
      const dueDate = task.dueDate
        ? new Date(task.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        : "No due date";
      const now = new Date();
      const isOverdue = task.dueDate && new Date(task.dueDate) < now && task.status !== "DONE";

      context += `\n  TASK: "${task.title}"\n`;
      context += `    Status: ${task.status}${isOverdue ? " ⚠️ OVERDUE" : ""}\n`;
      context += `    Priority: ${task.priority || "Normal"}\n`;
      context += `    Assigned to: ${assignee}\n`;
      context += `    Due Date: ${dueDate}\n`;
      context += `    Description: ${task.description || "No description"}\n`;

      if (task.comments && task.comments.length > 0) {
        context += `    Comments (${task.comments.length}):\n`;
        // Include last 5 comments to avoid token bloat
        const recentComments = task.comments.slice(-5);
        for (const comment of recentComments) {
          const author = comment.user?.name || "Unknown";
          context += `      - ${author}: "${comment.content}"\n`;
        }
      }
    }
    context += `\n`;
  }

  // Team summary
  context += `=== TEAM MEMBERS ===\n`;
  for (const member of workspace.members) {
    context += `  - ${member.user?.name || "Unknown"} (${member.user?.email}) — Role: ${member.role}\n`;
  }

  return context;
}

// Build the system prompt — supports both read-only Q&A and agentic actions
function buildSystemPrompt(contextString) {
  return `You are Kinetic Copilot, an intelligent AI assistant for a multi-tenant project management tool called Kinetic.

You have two modes:

## MODE 1 — Answer Questions (Read-Only)
Answer questions about the workspace data below using markdown formatting:
- Use **bold** for task names, project names, and people's names
- Use bullet points for lists
- Use emojis sparingly (✅ done, ⚠️ overdue, 🔥 high priority)
- Keep answers concise and actionable
- If the answer is not in the context, say so clearly

## MODE 2 — Take Action
If the user wants to CREATE a new project, respond with ONLY the following JSON (no other text, no markdown, no explanation):

\`\`\`json
{
  "action": "create_project",
  "params": {
    "name": "<project name>",
    "description": "<description or empty string>",
    "status": "<PLANNING|IN_PROGRESS|ON_HOLD|COMPLETED>",
    "priority": "<LOW|MEDIUM|HIGH>"
  },
  "confirmationMessage": "<A friendly confirmation message to show the user, using markdown>"
}
\`\`\`

Rules for MODE 2:
- Use MODE 2 ONLY when the user explicitly asks to create a project
- If the user doesn't specify status or priority, default to "PLANNING" and "MEDIUM"
- If the user doesn't provide a description, use an empty string
- The confirmationMessage should confirm what was created and suggest next steps
- Do NOT use MODE 2 for any other actions (updating, deleting, creating tasks, etc.)

WORKSPACE CONTEXT:
---
${contextString}
---`;
}

// Try to extract an action JSON block from the LLM response
function extractAction(rawText) {
  try {
    // Match a JSON block (with or without markdown code fences)
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      rawText.match(/(\{[\s\S]*"action"\s*:[\s\S]*\})/);
    if (!jsonMatch) return null;

    const jsonStr = jsonMatch[1];
    const parsed = JSON.parse(jsonStr);

    if (parsed.action && parsed.params) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// Execute a "create_project" action using Prisma
async function executeCreateProject(params, workspaceId, userId) {
  // Verify the user is an ADMIN of this workspace
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { members: true },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const isAdmin = workspace.members.some(
    (m) => m.userId === userId && m.role === "ADMIN"
  );

  if (!isAdmin) {
    throw new Error(
      "You need to be a workspace Admin to create projects. Please ask your workspace admin for help."
    );
  }

  const project = await prisma.project.create({
    data: {
      workspaceId,
      name: params.name,
      description: params.description || "",
      status: params.status || "PLANNING",
      priority: params.priority || "MEDIUM",
      progress: 0,
      team_lead: userId,
    },
  });

  const projectWithDetails = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      members: { include: { user: true } },
      tasks: {
        include: { assignee: true, comments: { include: { user: true } } },
      },
      owner: true,
    },
  });

  return projectWithDetails;
}

// POST /api/ai/chat
export const workspaceCopilot = async (req, res) => {
  try {
    const { userId } = await req.auth();
    const { question, workspaceId } = req.body;

    if (!question || !workspaceId) {
      return res.status(400).json({ message: "question and workspaceId are required" });
    }

    // --- RETRIEVAL: Fetch this workspace's full data from DB ---
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        members: { some: { userId } }, // Multi-tenant guard: user MUST be a member
      },
      include: {
        members: { include: { user: true } },
        projects: {
          include: {
            tasks: {
              include: {
                assignee: true,
                comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!workspace) {
      return res.status(403).json({ message: "Workspace not found or access denied" });
    }

    // --- AUGMENTATION: Format DB records into structured LangChain context ---
    const contextString = formatWorkspaceContext(workspace);
    const systemPrompt = buildSystemPrompt(contextString);

    // --- GENERATION: Groq API (Direct or via Python Microservice) ---
    const groqApiKey = process.env.GROQ_API_KEY;
    let rawAnswer = null;

    // 1. Try Python LangChain Microservice first
    // Falls back to direct Groq API if not reachable.
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    try {
      const pyResponse = await fetch(`${pythonServiceUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: contextString, question, system_prompt: systemPrompt }),
        signal: AbortSignal.timeout(2000),
      });

      if (pyResponse.ok) {
        const pyData = await pyResponse.json();
        if (pyData?.answer) {
          rawAnswer = pyData.answer;
        }
      }
    } catch {
      // Python microservice not running, proceed to direct Groq API
    }

    // 2. Direct Groq API call
    if (!rawAnswer) {
      if (!groqApiKey) {
        return res.status(500).json({
          message: "GROQ_API_KEY is not configured in server/.env. Please add your Groq API key to use AI Copilot.",
        });
      }

      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: question,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (!groqResponse.ok) {
        const errorData = await groqResponse.json().catch(() => ({}));
        const errDetail = errorData?.error?.message || `Groq API responded with status ${groqResponse.status}`;
        console.error("Groq API error:", errDetail);
        return res.status(groqResponse.status).json({ message: errDetail });
      }

      const groqData = await groqResponse.json();
      rawAnswer = groqData.choices?.[0]?.message?.content || "No response received from Groq.";
    }

    // --- ACTION EXECUTION: Parse and execute any action the LLM returned ---
    const actionPayload = extractAction(rawAnswer);

    if (actionPayload) {
      const { action, params, confirmationMessage } = actionPayload;

      if (action === "create_project") {
        try {
          const createdProject = await executeCreateProject(params, workspaceId, userId);
          return res.json({
            answer: confirmationMessage || `✅ Project **${createdProject.name}** has been created successfully!`,
            actionResult: {
              type: "project_created",
              project: createdProject,
            },
          });
        } catch (actionError) {
          // Permission or validation error — return it as a friendly AI message
          return res.json({
            answer: `⚠️ I couldn't create the project: ${actionError.message}`,
            actionResult: null,
          });
        }
      }
    }

    // --- Standard Q&A response ---
    res.json({ answer: rawAnswer, actionResult: null });

  } catch (error) {
    console.error("AI Copilot error:", error.message);
    res.status(500).json({ message: error.message });
  }
};
