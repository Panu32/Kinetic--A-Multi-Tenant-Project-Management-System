import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkData() {
  const members = await prisma.workspaceMember.findMany();
  console.log("Workspace Members in DB:", members.length, members);
}

checkData().finally(() => prisma.$disconnect());
