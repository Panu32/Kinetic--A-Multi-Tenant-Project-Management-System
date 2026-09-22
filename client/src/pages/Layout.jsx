import { useState, useEffect, useRef } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loadTheme } from "../features/themeSlice";
import { Loader2Icon } from "lucide-react";
import {
  useUser,
  SignIn,
  useAuth,
  CreateOrganization,
} from "@clerk/clerk-react";
import {
  fetchWorkspaces,
  addTask,
  updateTask,
  deleteTask,
} from "../features/workspaceSlice";
import {
  connectSocket,
  disconnectSocket,
  joinWorkspace,
  getSocket,
} from "../socket/socket";

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { loading, workspaces, currentWorkspace } = useSelector(
    (state) => state.workspace
  );
  const dispatch = useDispatch();

  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();

  // Track which workspace the socket is currently joined to so we can
  // re-join whenever the user switches workspaces.
  const joinedWorkspaceRef = useRef(null);

  // ── Initial load of theme ──────────────────────────────────────────────────
  useEffect(() => {
    dispatch(loadTheme());
  }, []);

  // ── Initial load of workspaces ─────────────────────────────────────────────
  useEffect(() => {
    if (isLoaded && user && workspaces.length === 0) {
      dispatch(fetchWorkspaces({ getToken }));
    }
  }, [user, isLoaded]);

  // ── Socket lifecycle: connect once, wire event handlers ───────────────────
  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();

    // ── Real-time event handlers ──
    // These handlers dispatch into the *existing* Redux reducers — no new
    // Redux code is needed. The store already knows how to handle these.

    const onTaskCreated = (task) => {
      dispatch(addTask(task));
    };

    const onTaskUpdated = (task) => {
      dispatch(updateTask(task));
    };

    const onTaskDeleted = ({ tasksIds }) => {
      dispatch(deleteTask(tasksIds));
    };

    socket.on("task:created", onTaskCreated);
    socket.on("task:updated", onTaskUpdated);
    socket.on("task:deleted", onTaskDeleted);

    // Cleanup: remove listeners when component unmounts
    return () => {
      socket.off("task:created", onTaskCreated);
      socket.off("task:updated", onTaskUpdated);
      socket.off("task:deleted", onTaskDeleted);
      disconnectSocket();
    };
  }, [user]);

  // ── Join/re-join workspace room whenever currentWorkspace changes ──────────
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    if (joinedWorkspaceRef.current === currentWorkspace.id) return; // already in this room

    joinWorkspace(currentWorkspace.id);
    joinedWorkspaceRef.current = currentWorkspace.id;
  }, [currentWorkspace?.id]);

  // ── Auth & loading guards ─────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen bg-white dark:bg-zinc-950">
        <SignIn />
      </div>
    );
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-zinc-950">
        <Loader2Icon className="size-7 text-blue-500 animate-spin" />
      </div>
    );

  if (user && workspaces.length === 0) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-white dark:bg-zinc-950">
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </div>
    );
  }

  return (
    <div className="flex bg-white dark:bg-zinc-950 text-gray-900 dark:text-slate-100">
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />
      <div className="flex-1 flex flex-col h-screen">
        <Navbar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
        />
        <div className="flex-1 h-full p-6 xl:p-10 xl:px-16 overflow-y-scroll">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
