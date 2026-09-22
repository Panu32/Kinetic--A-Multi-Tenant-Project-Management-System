import { useState } from "react";
import {
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  ChevronDown,
  Zap,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "@clerk/clerk-react";
import api from "../configs/api";
import toast from "react-hot-toast";
import { addTask } from "../features/workspaceSlice";

// Maps task category to a colour class for the badge
const CATEGORY_COLORS = {
  Frontend: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Backend: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Database: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  QA: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  DevOps: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

const PRIORITY_COLORS = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// The step-by-step progress shown while the LangGraph agent is running
const AGENT_STEPS = [
  { id: 1, label: "Analyzing feature requirements..." },
  { id: 2, label: "Decomposing into atomic tasks..." },
  { id: 3, label: "Checking team workload..." },
  { id: 4, label: "Assigning tasks to members..." },
  { id: 5, label: "Validating plan integrity..." },
];

export default function SprintPlannerModal({ projectId, onClose }) {
  const { getToken } = useAuth();
  const dispatch = useDispatch();

  const currentWorkspace = useSelector(
    (state) => state.workspace?.currentWorkspace || null
  );
  const project = currentWorkspace?.projects?.find((p) => p.id === projectId);
  const teamMembers = project?.members || [];

  const [featureDescription, setFeatureDescription] = useState("");
  const [plannedTasks, setPlannedTasks] = useState([]);
  const [agentStep, setAgentStep] = useState(0);   // 0 = idle, 1-5 = steps, 6 = done
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  // Allow the user to change the assignee of a planned task before applying
  const handleAssigneeChange = (taskIndex, newAssigneeId) => {
    const member = teamMembers.find((m) => m.user.id === newAssigneeId);
    setPlannedTasks((prev) =>
      prev.map((task, i) =>
        i === taskIndex
          ? {
              ...task,
              assigneeId: newAssigneeId,
              assigneeName: member?.user?.name || task.assigneeName,
            }
          : task
      )
    );
  };

  // Run the LangGraph agent via Express → Python
  const handleGenerate = async () => {
    if (!featureDescription.trim()) return;
    setIsGenerating(true);
    setPlannedTasks([]);
    setAgentStep(0);

    // Animate through agent steps while the real API call runs in the background
    let stepIndex = 1;
    const stepTimer = setInterval(() => {
      if (stepIndex <= AGENT_STEPS.length) {
        setAgentStep(stepIndex);
        stepIndex++;
      } else {
        clearInterval(stepTimer);
      }
    }, 1200);

    try {
      const token = await getToken();
      const { data } = await api.post(
        "/api/ai/sprint-plan",
        { featureDescription: featureDescription.trim(), projectId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      clearInterval(stepTimer);
      setAgentStep(6); // done
      setPlannedTasks(data.tasks || []);
    } catch (err) {
      clearInterval(stepTimer);
      setAgentStep(0);
      const msg =
        err?.response?.data?.message ||
        "Sprint Planner failed. Make sure the Python server is running.";
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Apply all planned tasks to the board via the existing POST /api/tasks endpoint
  const handleApply = async () => {
    if (plannedTasks.length === 0) return;
    setIsApplying(true);
    setAppliedCount(0);

    const token = await getToken();
    let created = 0;

    for (const task of plannedTasks) {
      try {
        const { data } = await api.post(
          "/api/tasks",
          {
            projectId,
            title: task.title,
            description: task.description,
            type: task.type,
            priority: task.priority,
            assigneeId: task.assigneeId,
            due_date: task.due_date,
            status: "TODO",
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Add to local Redux store immediately (Socket.io will also broadcast to others)
        dispatch(addTask(data.task));
        created++;
        setAppliedCount(created);
      } catch (err) {
        console.error(`Failed to create task "${task.title}":`, err?.response?.data?.message || err.message);
        toast.error(`Failed: "${task.title}" — ${err?.response?.data?.message || "Unknown error"}`);
      }
    }

    setIsApplying(false);

    if (created > 0) {
      toast.success(`${created} task${created > 1 ? "s" : ""} added to the board!`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-white/20 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">AI Sprint Planner</h2>
              <p className="text-white/70 text-xs">
                Powered by LangGraph &middot; {project?.name || "Project"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Feature Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Describe the feature to plan
            </label>
            <textarea
              value={featureDescription}
              onChange={(e) => setFeatureDescription(e.target.value)}
              placeholder='e.g. "Build a Stripe subscription billing system with monthly and annual plans, webhook handling, and invoice emails."'
              disabled={isGenerating || isApplying}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none disabled:opacity-50 transition"
            />
          </div>

          {/* Generate Button */}
          {!isGenerating && plannedTasks.length === 0 && (
            <button
              onClick={handleGenerate}
              disabled={!featureDescription.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={14} />
              Generate Sprint Plan with AI
            </button>
          )}

          {/* Agent Progress Steps */}
          {isGenerating && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Agent is working...
              </p>
              <div className="space-y-1.5">
                {AGENT_STEPS.map((step) => {
                  const isDone = agentStep > step.id;
                  const isActive = agentStep === step.id;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 text-sm px-3 py-2 rounded-lg transition-all ${
                        isDone
                          ? "text-emerald-600 dark:text-emerald-400"
                          : isActive
                          ? "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/10"
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 size={15} />
                      ) : isActive ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <div className="size-[15px] rounded-full border border-zinc-300 dark:border-zinc-700" />
                      )}
                      {step.label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview Table */}
          {plannedTasks.length > 0 && !isGenerating && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Planned Tasks ({plannedTasks.length})
                </p>
                <button
                  onClick={() => { setPlannedTasks([]); setAgentStep(0); }}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Re-generate
                </button>
              </div>

              <div className="space-y-2">
                {plannedTasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-2 bg-zinc-50 dark:bg-zinc-900/60"
                  >
                    {/* Task Title */}
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            CATEGORY_COLORS[task.category] ||
                            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {task.category}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            PRIORITY_COLORS[task.priority]
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {task.description}
                    </p>

                    {/* Assignee selector + type + due date */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">Assignee:</span>
                        <div className="relative">
                          <select
                            value={task.assigneeId}
                            onChange={(e) => handleAssigneeChange(idx, e.target.value)}
                            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 pr-6 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer"
                          >
                            {teamMembers.map((m) => (
                              <option key={m.user.id} value={m.user.id}>
                                {m.user.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                        </div>
                      </div>

                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        Type: <span className="text-zinc-600 dark:text-zinc-300">{task.type}</span>
                      </span>

                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        Due: <span className="text-zinc-600 dark:text-zinc-300">{task.due_date}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {plannedTasks.length > 0 && !isGenerating && (
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-white dark:bg-zinc-950">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Review and edit assignees above, then click Apply.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:from-violet-500 hover:to-indigo-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isApplying ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Applying {appliedCount}/{plannedTasks.length}...
                  </>
                ) : (
                  <>
                    <Zap size={13} />
                    Apply to Board
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
