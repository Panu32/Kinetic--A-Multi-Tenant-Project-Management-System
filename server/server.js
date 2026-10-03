
import express from "express";
import "dotenv/config";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js";
import workspaceRouter from "./routes/workspaceRoutes.js";
import { protect } from "./middlewares/authMiddleware.js";
import projectRouter from "./routes/projectRoutes.js";
import taskRouter from "./routes/taskRoutes.js";
import commentRouter from "./routes/commentRoutes.js";
import aiRouter from "./routes/aiRoutes.js";
import prisma from "./configs/prisma.js";


const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(clerkMiddleware());

app.get("/", (req, res) => res.send("Server is live!⌛"));

// Set up the "/api/inngest" (recommended) routes with the serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

// Clerk Webhook Handler — syncs Clerk events directly to the database
app.post("/api/webhooks/clerk", async (req, res) => {
  try {
    const { type, data } = req.body;
    console.log("Clerk webhook received:", type);

    if (type === "user.created") {
      await prisma.user.upsert({
        where: { id: data.id },
        update: {
          email: data?.email_addresses?.[0]?.email_address,
          name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
          image: data?.image_url ?? "",
        },
        create: {
          id: data.id,
          email: data?.email_addresses?.[0]?.email_address,
          name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
          image: data?.image_url ?? "",
        },
      });
    }

    if (type === "user.updated") {
      await prisma.user.update({
        where: { id: data.id },
        data: {
          email: data?.email_addresses?.[0]?.email_address,
          name: `${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim(),
          image: data?.image_url ?? "",
        },
      });
    }

    if (type === "user.deleted") {
      await prisma.user.delete({ where: { id: data.id } });
    }

    if (type === "organization.created") {
      console.log("Creating organization with ownerId:", data.created_by, "for organization id:", data.id);
      await prisma.workspace.upsert({
        where: { id: data.id },
        update: { name: data.name, slug: data.slug, image_url: data.image_url ?? "" },
        create: {
          id: data.id,
          name: data.name,
          slug: data.slug,
          ownerId: data.created_by,
          image_url: data.image_url ?? "",
        },
      });

      // Add creator as ADMIN
      await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: data.created_by, workspaceId: data.id } },
        update: {},
        create: {
          userId: data.created_by,
          workspaceId: data.id,
          role: "ADMIN",
        },
      });
    }

    if (type === "organization.updated") {
      await prisma.workspace.update({
        where: { id: data.id },
        data: { name: data.name, slug: data.slug, image_url: data.image_url ?? "" },
      });
    }

    if (type === "organization.deleted") {
      await prisma.workspace.delete({ where: { id: data.id } });
    }

    if (type === "organizationMembership.created") {
      const userId = data.public_user_data?.user_id;
      const email = data.public_user_data?.identifier;
      const name = `${data.public_user_data?.first_name ?? ""} ${data.public_user_data?.last_name ?? ""}`.trim() || email;
      const image = data.public_user_data?.image_url ?? "";
      const role = data.role?.toLowerCase()?.includes("admin") ? "ADMIN" : "MEMBER";

      console.log("Adding member via webhook:", { userId, email, orgId: data.organization?.id, role });

      if (userId) {
        await prisma.user.upsert({
          where: { id: userId },
          update: { email, name, image },
          create: { id: userId, email, name, image },
        });

        await prisma.workspaceMember.upsert({
          where: {
            userId_workspaceId: {
              userId: userId,
              workspaceId: data.organization?.id,
            },
          },
          update: { role },
          create: {
            userId: userId,
            workspaceId: data.organization?.id,
            role,
          },
        });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Routes
app.use("/api/workspaces", protect, workspaceRouter);
app.use("/api/projects", protect, projectRouter);
app.use("/api/tasks", protect, taskRouter);
app.use("/api/comments", protect, commentRouter);
app.use("/api/ai", protect, aiRouter);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () =>
  console.log(
    `Server is running on port ${PORT} => http://localhost:${PORT} 🚀`
  )
);
