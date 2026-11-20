import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Creates the two workshop chat groups participants are onboarded into on
// payment approval, if they don't already exist. Does not touch any
// user's role — ADMIN is already this app's top-authority role.
async function ensureWorkshopGroups() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    console.log("No ADMIN user exists yet — re-run this script after creating one.");
    return;
  }
  for (const name of ["XI Workshop · Day 1", "XI Workshop · Day 2"]) {
    const existing = await prisma.group.findFirst({ where: { name } });
    if (existing) continue;
    await prisma.group.create({
      data: { name, description: "X Intelligence workshop participants", createdById: admin.id },
    });
    console.log(`Created group: ${name}`);
  }
}

ensureWorkshopGroups().finally(() => prisma.$disconnect());
