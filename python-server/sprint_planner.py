"""
AI Sprint Planner — LangGraph StateGraph
----------------------------------------
A 3-node agentic pipeline that:
  1. Decompose: Breaks a feature description into atomic, typed tasks using Groq LLM
     with structured output (Pydantic schema — no raw markdown parsing).
  2. Assign:    Picks the least-busy team member for each task using workload data
     passed from Express (live Prisma query — no hallucinated names).
  3. Validate:  Checks every task has all required fields.
     - If invalid AND retry_count < 2 → loops back to Decompose (cyclic graph).
     - If valid OR max retries reached → outputs final task list.

The graph is cyclic (Validate → Decompose on retry), which is the key
architectural property that makes this an *agent* vs a simple LangChain chain.
"""

import os
import json
from datetime import datetime, timedelta
from typing import Literal
from typing_extensions import TypedDict

from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schema for a single planned task
# Express maps these fields directly to Prisma's Task model
# ─────────────────────────────────────────────────────────────────────────────
class PlannedTask(BaseModel):
    title: str = Field(description="Short, imperative task title (e.g. 'Build Stripe checkout API')")
    description: str = Field(description="1-2 sentence technical description of what needs to be done")
    type: Literal["TASK", "FEATURE", "BUG", "IMPROVEMENT"] = Field(
        description="Task type: FEATURE for new functionality, TASK for setup/config, BUG for fixes, IMPROVEMENT for refactoring"
    )
    priority: Literal["LOW", "MEDIUM", "HIGH"] = Field(
        description="Priority based on technical dependency and user impact"
    )
    category: str = Field(
        description="Technical category: Frontend, Backend, Database, QA, or DevOps"
    )


class TaskList(BaseModel):
    tasks: list[PlannedTask] = Field(
        description="List of 3 to 6 atomic, implementable tasks that together deliver the feature"
    )


# ─────────────────────────────────────────────────────────────────────────────
# LangGraph State — passed between every node
# ─────────────────────────────────────────────────────────────────────────────
class SprintPlannerState(TypedDict):
    feature_description: str      # user input from the frontend
    team_members: list[dict]      # [{id, name, email, openTaskCount}] — from Prisma via Express
    raw_tasks: list[dict]         # output of decompose_node
    assigned_tasks: list[dict]    # output of assign_node (with assigneeId + assigneeName)
    validation_errors: list[str]  # list of field errors from validate_node
    retry_count: int              # how many times we have retried (max 2)
    final_tasks: list[dict]       # validated, ready-to-create tasks returned to Express


# ─────────────────────────────────────────────────────────────────────────────
# Node 1: Decompose
# Asks the LLM to break the feature into typed tasks using structured output.
# On retry, includes previous validation errors so the LLM can fix them.
# ─────────────────────────────────────────────────────────────────────────────
def decompose_node(state: SprintPlannerState) -> dict:
    groq_api_key = os.getenv("GROQ_API_KEY")
    model_name = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

    llm = ChatGroq(model=model_name, api_key=groq_api_key, temperature=0.3)

    # Use structured output — LangChain forces the model to return valid JSON
    # matching the TaskList Pydantic schema. No manual JSON parsing needed.
    structured_llm = llm.with_structured_output(TaskList)

    retry_note = ""
    if state.get("validation_errors"):
        retry_note = f"\n\nPrevious attempt failed validation. Fix these issues:\n" + \
                     "\n".join(f"- {e}" for e in state["validation_errors"])

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a senior software architect helping a team plan a sprint.
Given a feature description, decompose it into 3-6 atomic, implementable tasks.

Rules:
- Each task must be completable by ONE developer in 1-3 days
- Cover all technical layers needed: Frontend, Backend, Database, QA
- Use clear, imperative titles (e.g. "Build user login API", not "Login")
- Assign realistic priorities based on technical dependencies
{retry_note}"""),
        ("human", "Feature to implement: {feature_description}")
    ])

    chain = prompt | structured_llm

    result: TaskList = chain.invoke({
        "feature_description": state["feature_description"],
        "retry_note": retry_note,
    })

    # Convert Pydantic models to plain dicts for the state
    raw_tasks = [task.model_dump() for task in result.tasks]

    return {"raw_tasks": raw_tasks, "validation_errors": []}


# ─────────────────────────────────────────────────────────────────────────────
# Node 2: Assign
# Picks the least-busy team member for each task using live workload data.
# Uses round-robin from sorted (least open tasks → most) to spread work evenly.
# No LLM involved here — pure deterministic logic.
# ─────────────────────────────────────────────────────────────────────────────
def assign_node(state: SprintPlannerState) -> dict:
    team_members = state["team_members"]
    raw_tasks = state["raw_tasks"]

    if not team_members:
        # Fallback: leave assigneeId empty — validation will catch this
        return {"assigned_tasks": raw_tasks}

    # Sort by openTaskCount ascending (least busy first)
    sorted_members = sorted(team_members, key=lambda m: m.get("openTaskCount", 0))

    # Suggested sprint end date: 7 days from today
    sprint_end = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")

    assigned_tasks = []
    for i, task in enumerate(raw_tasks):
        member = sorted_members[i % len(sorted_members)]
        assigned_task = {
            **task,
            "assigneeId": member["id"],
            "assigneeName": member["name"],
            "due_date": sprint_end,
        }
        assigned_tasks.append(assigned_task)

    return {"assigned_tasks": assigned_tasks}


# ─────────────────────────────────────────────────────────────────────────────
# Node 3: Validate
# Checks that every task has all fields required by Prisma's Task model.
# If errors found AND retry_count < 2 → signals retry to the conditional edge.
# If valid OR max retries → outputs final_tasks.
# ─────────────────────────────────────────────────────────────────────────────
def validate_node(state: SprintPlannerState) -> dict:
    required_fields = ["title", "description", "type", "priority", "assigneeId", "due_date"]
    valid_types = {"TASK", "FEATURE", "BUG", "IMPROVEMENT"}
    valid_priorities = {"LOW", "MEDIUM", "HIGH"}

    errors = []
    valid_tasks = []

    for i, task in enumerate(state["assigned_tasks"]):
        task_errors = []

        for field in required_fields:
            if not task.get(field):
                task_errors.append(f"Task {i+1}: missing '{field}'")

        if task.get("type") and task["type"] not in valid_types:
            task_errors.append(f"Task {i+1}: invalid type '{task['type']}'")

        if task.get("priority") and task["priority"] not in valid_priorities:
            task_errors.append(f"Task {i+1}: invalid priority '{task['priority']}'")

        if not task_errors:
            valid_tasks.append(task)
        else:
            errors.extend(task_errors)

    if not errors:
        # All tasks valid → output and finish
        return {"validation_errors": [], "final_tasks": valid_tasks, "retry_count": state.get("retry_count", 0)}
    else:
        # Errors found
        retry_count = state.get("retry_count", 0) + 1
        if retry_count >= 2:
            # Max retries reached — return whatever is valid, drop the rest
            return {"validation_errors": errors, "final_tasks": valid_tasks, "retry_count": retry_count}
        else:
            # Signal retry — pass errors back so decompose_node can fix them
            return {"validation_errors": errors, "final_tasks": [], "retry_count": retry_count}


# ─────────────────────────────────────────────────────────────────────────────
# Conditional edge: should we retry decompose or finish?
# ─────────────────────────────────────────────────────────────────────────────
def should_retry(state: SprintPlannerState) -> str:
    """
    Called after validate_node.
    Returns "decompose" to loop back, or "end" to finish.
    """
    has_errors = bool(state.get("validation_errors"))
    max_retries_reached = state.get("retry_count", 0) >= 2

    if has_errors and not max_retries_reached:
        return "decompose"
    return "end"


# ─────────────────────────────────────────────────────────────────────────────
# Build the StateGraph
# ─────────────────────────────────────────────────────────────────────────────
def build_sprint_planner() -> StateGraph:
    graph = StateGraph(SprintPlannerState)

    # Register nodes
    graph.add_node("decompose", decompose_node)
    graph.add_node("assign", assign_node)
    graph.add_node("validate", validate_node)

    # Linear edges
    graph.set_entry_point("decompose")
    graph.add_edge("decompose", "assign")
    graph.add_edge("assign", "validate")

    # Cyclic conditional edge: validate → decompose (retry) OR END
    graph.add_conditional_edges(
        "validate",
        should_retry,
        {
            "decompose": "decompose",  # loop back to fix issues
            "end": END,               # done
        }
    )

    return graph.compile()


# Compiled graph — imported by main.py
sprint_planner_graph = build_sprint_planner()
