import prisma from "../configs/prisma.js";

/**
 * POST /api/ai/sprint-plan
 *
 * Bridge between the React frontend and the Python LangGraph agent.
 *
 * 1. Fetches all project members with their live open task count from Prisma.
 * 2. Calls the Python /plan-sprint endpoint with the feature description + team workload.
 * 3. Returns the agent's structured task plan to the frontend — nothing is saved to DB yet.
 *    Task creation only happens when the user clicks "Apply to Board" in the UI
 *    (human-in-the-loop pattern).
 */
export const sprintPlan = async (req, res) => {
  try {
    const { userId } = await req.auth();
    const { featureDescription, projectId } = req.body;

    if (!featureDescription || !projectId) {
      return res
        .status(400)
        .json({ message: "featureDescription and projectId are required" });
    }

    // ── Fetch project members with their open task count ───────────────────
    // This gives the LangGraph agent real workload data so it can assign
    // tasks to the least-busy team member — not random guesses.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          include: {
            user: true,
          },
        },
        tasks: {
          where: {
            status: { not: "DONE" }, // only count open (non-completed) tasks
          },
          select: { assigneeId: true },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Verify the requesting user is the project team lead (only they can plan sprints)
    if (project.team_lead !== userId) {
      return res
        .status(403)
        .json({ message: "Only the team lead can use the Sprint Planner" });
    }

    // Build workload map: userId → count of open tasks
    const openTaskCountByUser = {};
    for (const task of project.tasks) {
      openTaskCountByUser[task.assigneeId] =
        (openTaskCountByUser[task.assigneeId] || 0) + 1;
    }

    // Build the team_members array for the Python agent
    const teamMembers = project.members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      openTaskCount: openTaskCountByUser[member.user.id] || 0,
    }));

    if (teamMembers.length === 0) {
      return res.status(400).json({
        message:
          "No team members found in this project. Add members before using Sprint Planner.",
      });
    }

    // ── Call Python LangGraph microservice ────────────────────────────────
    const pyResponse = await fetch("http://127.0.0.1:8000/plan-sprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature_description: featureDescription,
        team_members: teamMembers,
      }),
      signal: AbortSignal.timeout(60000), // 60s timeout — LangGraph agent can take time
    });

    if (!pyResponse.ok) {
      const errorData = await pyResponse.json().catch(() => ({}));
      return res.status(pyResponse.status).json({
        message:
          errorData?.detail ||
          "Sprint Planner agent failed. Make sure the Python server is running.",
      });
    }

    const { tasks } = await pyResponse.json();

    return res.json({ tasks });
  } catch (error) {
    console.error("Sprint planner controller error:", error.message);

    if (error.name === "TimeoutError") {
      return res.status(504).json({
        message:
          "Sprint Planner timed out. Make sure the Python server (python-server/) is running on port 8000.",
      });
    }

    return res.status(500).json({ message: error.message });
  }
};
