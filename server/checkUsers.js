import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkData() {
  const workspaces = await prisma.workspace.findMany();
  console.log("Workspaces in DB:", workspaces.length, workspaces);
}

checkData().finally(() => prisma.$disconnect());
