import { useState, useRef, useEffect } from "react";
import { SparklesIcon, X, SendHorizonal, Loader2, BotMessageSquare, FolderPlus, CheckCircle2 } from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import api from "../configs/api";
import ReactMarkdown from "react-markdown";
import { addProject } from "../features/workspaceSlice";

const SUGGESTIONS = [
  "Summarize the status of all projects",
  "Who has the most open tasks?",
  "Show me all overdue or high-priority tasks",
  'Create a project called "Marketing Campaign"',
];

const AICopilot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const { currentWorkspace } = useSelector((state) => state.workspace);
  const { getToken } = useAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async (question) => {
    if (!question.trim() || loading) return;
    if (!currentWorkspace) return;

    const userMsg = { role: "user", content: question.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = await getToken();
      const { data } = await api.post(
        "/api/ai/chat",
        { question: question.trim(), workspaceId: currentWorkspace.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Handle agentic action results (e.g., project created)
      if (data.actionResult?.type === "project_created" && data.actionResult.project) {
        dispatch(addProject(data.actionResult.project));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            actionResult: data.actionResult,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
      }
    } catch (err) {
      const errorMsg =
        err?.response?.data?.message ||
        "⚠️ Sorry, something went wrong. Please check your Groq API key in `.env` and try again.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMsg,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleViewProject = (project) => {
    setIsOpen(false);
    navigate(`/projectsDetail?id=${project.id}&tab=tasks`);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        title="Ask AI Copilot"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold shadow-md hover:shadow-lg hover:from-violet-500 hover:to-indigo-500 transition-all duration-200 hover:scale-105 active:scale-95"
      >
        <SparklesIcon size={13} className="animate-pulse" />
        <span className="hidden sm:inline">Ask AI</span>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-Over Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] z-50 flex flex-col bg-white dark:bg-zinc-900 shadow-2xl border-l border-gray-200 dark:border-zinc-800 transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gradient-to-r from-violet-600 to-indigo-600">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-white/20 flex items-center justify-center">
              <BotMessageSquare size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm leading-tight">Kinetic Copilot</h2>
              <p className="text-white/70 text-xs leading-tight">
                AI assistant for{" "}
                <span className="font-medium text-white/90">
                  {currentWorkspace?.name || "your workspace"}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="size-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
          {messages.length === 0 && (
            <div className="space-y-4 mt-2">
              <div className="flex items-start gap-3">
                <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                  <SparklesIcon size={13} className="text-white" />
                </div>
                <div className="bg-gray-100 dark:bg-zinc-800 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-gray-700 dark:text-zinc-300 max-w-[88%]">
                  <p className="font-medium text-gray-900 dark:text-white mb-1">Hi! I'm your Workspace Copilot 👋</p>
                  <p className="text-xs leading-relaxed">
                    Ask me anything about <strong>{currentWorkspace?.name || "your workspace"}</strong> — tasks, projects, team
                    workload, deadlines, or comments. I can also <strong>create projects</strong> for you!
                  </p>
                </div>
              </div>

              {/* Quick suggestions */}
              <div className="pl-10 space-y-2">
                <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">
                  Try asking:
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-left text-xs px-3 py-2 rounded-xl border border-violet-200 dark:border-violet-900/40 text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/10 hover:bg-violet-100 dark:hover:bg-violet-900/20 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* Avatar */}
              <div
                className={`size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  msg.role === "user"
                    ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
                    : "bg-gradient-to-br from-violet-500 to-indigo-600"
                }`}
              >
                {msg.role === "user" ? (
                  "U"
                ) : (
                  <SparklesIcon size={13} className="text-white" />
                )}
              </div>

              {/* Bubble + optional action card */}
              <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm w-full ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-tr-none"
                      : "bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200 rounded-tl-none"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>

                {/* Action result card — shown below the AI bubble */}
                {msg.actionResult?.type === "project_created" && msg.actionResult.project && (
                  <div className="w-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-800/50 flex items-center justify-center shrink-0">
                      <FolderPlus size={15} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Project Created
                      </p>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 truncate font-medium">
                        {msg.actionResult.project.name}
                      </p>
                    </div>
                    <button
                      onClick={() => handleViewProject(msg.actionResult.project)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition shrink-0"
                    >
                      View
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-start gap-2.5">
              <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <SparklesIcon size={13} className="text-white" />
              </div>
              <div className="bg-gray-100 dark:bg-zinc-800 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-violet-500" />
                <span className="text-xs text-gray-500 dark:text-zinc-400">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask anything or "Create a project..."'
              disabled={loading}
              className="flex-1 text-sm bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="size-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center hover:from-violet-500 hover:to-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <SendHorizonal size={15} />
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 dark:text-zinc-600 mt-2">
            Powered by Groq · Workspace-scoped RAG · Agentic Actions
          </p>
        </div>
      </div>
    </>
  );
};

export default AICopilot;
