import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import "dotenv/config";

const prisma = new PrismaClient();

async function syncClerkUsers() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("Missing CLERK_SECRET_KEY in environment variables.");
    return;
  }

  try {
    console.log("Fetching users from Clerk API...");
    const response = await fetch('https://api.clerk.com/v1/users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Clerk API returned ${response.status}: ${await response.text()}`);
    }

    const users = await response.json();
    console.log(`Found ${users.length} users in Clerk.`);

    for (const user of users) {
      const email = user.email_addresses?.[0]?.email_address;
      const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
      const image = user.image_url ?? "";

      console.log(`Syncing user: ${user.id} (${email})`);

      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          email,
          name,
          image,
        },
        create: {
          id: user.id,
          email,
          name,
          image,
        },
      });
    }

    console.log("Sync complete!");
  } catch (error) {
    console.error("Error syncing users:", error);
  } finally {
    await prisma.$disconnect();
  }
}

syncClerkUsers();
