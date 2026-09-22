import prisma from "../configs/prisma.js";
import { clerkClient } from "@clerk/express";

// Get all workspaces for user
export const getUserWorkspaces = async (req, res) => {
  try {
    const { userId } = await req.auth();
    console.log("getUserWorkspaces called for userId:", userId);

    // Auto-sync with Clerk if user memberships exist in Clerk
    try {
      const clerkMems = await clerkClient.users.getOrganizationMembershipList({ userId });
      if (clerkMems?.data?.length > 0) {
        // Ensure user exists in prisma DB
        const clerkUser = await clerkClient.users.getUser(userId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress;
        const name = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || email;
        const image = clerkUser.imageUrl ?? "";

        await prisma.user.upsert({
          where: { id: userId },
          update: { email, name, image },
          create: { id: userId, email, name, image },
        });

        for (const m of clerkMems.data) {
          const org = m.organization;
          const role = m.role?.toLowerCase()?.includes("admin") ? "ADMIN" : "MEMBER";
          const ownerId = org.createdBy || userId;

          // Ensure owner exists
          const existingOwner = await prisma.user.findUnique({ where: { id: ownerId } });
          if (!existingOwner) {
            try {
              const clerkOwner = await clerkClient.users.getUser(ownerId);
              await prisma.user.upsert({
                where: { id: ownerId },
                update: {},
                create: {
                  id: ownerId,
                  email: clerkOwner.emailAddresses?.[0]?.emailAddress,
                  name: `${clerkOwner.firstName ?? ""} ${clerkOwner.lastName ?? ""}`.trim() || "Owner",
                  image: clerkOwner.imageUrl ?? "",
                },
              });
            } catch (err) {
              console.warn("Could not fetch org owner from Clerk:", err.message);
            }
          }

          // Ensure workspace exists
          await prisma.workspace.upsert({
            where: { id: org.id },
            update: { name: org.name, slug: org.slug, image_url: org.imageUrl ?? "" },
            create: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              ownerId,
              image_url: org.imageUrl ?? "",
            },
          });

          // Ensure membership exists
          await prisma.workspaceMember.upsert({
            where: { userId_workspaceId: { userId, workspaceId: org.id } },
            update: { role },
            create: {
              userId,
              workspaceId: org.id,
              role,
            },
          });
        }
      }
    } catch (syncErr) {
      console.warn("Clerk auto-sync warning:", syncErr.message);
    }

    const workspaces = await prisma.workspace.findMany({
      where: {
        members: { some: { userId: userId } },
      },
      include: {
        members: { include: { user: true } },
        projects: {
          include: {
            tasks: {
              include: {
                assignee: true,
                comments: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            members: { include: { user: true } },
          },
        },
        owner: true,
      },
    });

    console.log("Workspaces found:", workspaces.length);

    res.json({ workspaces });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.code || error.message });
  }
};

// Add member to workspace
export const addMember = async (req, res) => {
  try {
    const { userId } = await req.auth();
    const { email, role, workspaceId, message } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if no missing parameters
    if (!workspaceId || !role) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    // Check if role is valid
    if (!["ADMIN", "MEMBER"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // fetch workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: true },
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    // Check creator has admin role
    if (
      !workspace.members.find(
        (member) => member.userId === userId && member.role === "ADMIN"
      )
    ) {
      return res
        .status(403)
        .json({ message: "You do not have admin privileges" });
    }

    // Check if user is already a member
    const existingMember = workspace.members.find(
      (member) => member.userId === user.id
    );

    if (existingMember) {
      return res.status(400).json({ message: "User is already a member" });
    }

    const member = await prisma.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId,
        role,
        message,
      },
    });

    return res.json({ member, message: "Member added successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.code || error.message });
  }
};
