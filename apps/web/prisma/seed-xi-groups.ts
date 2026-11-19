import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function promoteBootstrapSuperAdmin() {
  const hasSuperAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (hasSuperAdmin) return;
  const oldestAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!oldestAdmin) return;
  await prisma.user.update({ where: { id: oldestAdmin.id }, data: { role: "SUPER_ADMIN" } });
  console.log(`Promoted ${oldestAdmin.email ?? oldestAdmin.id} to SUPER_ADMIN`);
}

async function ensureWorkshopGroups() {
  const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!superAdmin) return;
  for (const name of ["XI Workshop · Day 1", "XI Workshop · Day 2"]) {
    const existing = await prisma.group.findFirst({ where: { name } });
    if (existing) continue;
    await prisma.group.create({
      data: { name, description: "X Intelligence workshop participants", createdById: superAdmin.id },
    });
  }
}

async function main() {
  await promoteBootstrapSuperAdmin();
  await ensureWorkshopGroups();
}

main().finally(() => prisma.$disconnect());
