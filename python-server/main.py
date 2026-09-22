import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from sprint_planner import sprint_planner_graph

# Load environment variables (from python-server/.env or server/.env)
load_dotenv()
if not os.getenv("GROQ_API_KEY"):
    server_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", ".env"))
    if os.path.exists(server_env):
        load_dotenv(server_env, override=True)

app = FastAPI()

# Request model
class ChatRequest(BaseModel):
    context: str
    question: str
    system_prompt: str | None = None  # Optional override from Express (includes action schema)

# Request model for AI Sprint Planner
class SprintPlanRequest(BaseModel):
    feature_description: str
    team_members: list[dict]  # [{id, name, email, openTaskCount}]

# Default system prompt (fallback if Express doesn't send one)
# NOTE: The Express server sends a full system_prompt with action schema support.
# This fallback is used only when calling the Python service directly.
DEFAULT_SYSTEM_PROMPT = """You are Kinetic Copilot, an intelligent AI assistant for a multi-tenant project management tool called Kinetic.

You have two modes:

## MODE 1 — Answer Questions (Read-Only)
Answer questions about the workspace data below using markdown formatting:
- Use **bold** for task names, project names, and people's names
- Use bullet points for lists
- Use emojis sparingly (✅ done, ⚠️ overdue, 🔥 high priority)
- Keep answers concise and actionable
- If the answer is not in the context, say so clearly

## MODE 2 — Take Action
If the user wants to CREATE a new project, respond with ONLY the following JSON:

```json
{{
  "action": "create_project",
  "params": {{
    "name": "<project name>",
    "description": "<description or empty string>",
    "status": "<PLANNING|IN_PROGRESS|ON_HOLD|COMPLETED>",
    "priority": "<LOW|MEDIUM|HIGH>"
  }},
  "confirmationMessage": "<A friendly confirmation message to show the user, using markdown>"
}}
```

Rules for MODE 2:
- Use MODE 2 ONLY when the user explicitly asks to create a project
- If status or priority not specified, default to PLANNING and MEDIUM
- Do NOT use MODE 2 for any other action

WORKSPACE CONTEXT:
---
{context}
---"""

@app.post("/generate")
async def generate_response(request: ChatRequest):
    try:
        # 1. Initialize Groq Model via LangChain
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise HTTPException(
                status_code=500,
                detail="GROQ_API_KEY is not set in python-server/.env"
            )

        model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        llm = ChatGroq(
            model=model_name,
            api_key=groq_api_key,
            temperature=0.3
        )

        # 2. Use system_prompt from Express if provided, otherwise use default
        # The Express server sends a richer prompt that includes the action schema
        if request.system_prompt:
            # Direct messages approach — use the full system prompt from Express
            from langchain_core.messages import SystemMessage, HumanMessage
            answer = await llm.ainvoke([
                SystemMessage(content=request.system_prompt),
                HumanMessage(content=request.question)
            ])
            answer = answer.content
        else:
            # Fallback: use the template-based default prompt
            prompt = ChatPromptTemplate.from_messages([
                ("system", DEFAULT_SYSTEM_PROMPT),
                ("human", "{question}")
            ])
            chain = prompt | llm | StrOutputParser()
            answer = await chain.ainvoke({
                "context": request.context,
                "question": request.question
            })

        return {"answer": answer}

    except Exception as e:
        print(f"Error during generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/plan-sprint")
async def plan_sprint(request: SprintPlanRequest):
    """
    AI Sprint Planner endpoint — powered by LangGraph StateGraph.

    Receives a feature description and live team member workload data from Express,
    runs the 3-node agent (Decompose → Assign → Validate with retry loop),
    and returns a structured list of ready-to-create tasks.
    """
    try:
        if not os.getenv("GROQ_API_KEY"):
            raise HTTPException(
                status_code=500,
                detail="GROQ_API_KEY is not set in python-server/.env"
            )

        if not request.feature_description.strip():
            raise HTTPException(status_code=400, detail="feature_description cannot be empty")

        # Invoke the LangGraph agent
        initial_state = {
            "feature_description": request.feature_description,
            "team_members": request.team_members,
            "raw_tasks": [],
            "assigned_tasks": [],
            "validation_errors": [],
            "retry_count": 0,
            "final_tasks": [],
        }

        result = await sprint_planner_graph.ainvoke(initial_state)

        final_tasks = result.get("final_tasks", [])

        if not final_tasks:
            raise HTTPException(
                status_code=500,
                detail="Agent could not generate valid tasks. Please try again with a clearer feature description."
            )

        return {"tasks": final_tasks}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Sprint planner error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

