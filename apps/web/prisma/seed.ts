import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// SEED DATA
// ============================================================
// Single static account, used for both admin and mentor duties —
// ADMIN already has access to every mentor route and sees all groups
// (not just self-created ones), so one account covers both.

async function main() {
  console.log("🌱 Seeding database...\n");

  const email = process.env.ADMIN_EMAIL || "official@thebotcompany.in";
  const password = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Bot@2026", 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: process.env.ADMIN_NAME || "The Bot Company",
      email,
      password,
      role: "ADMIN",
      emailVerified: true,
      status: "OFFLINE",
    },
  });
  console.log(`  ✓ Admin created: ${admin.email}`);

  console.log("\n✅ Database seeded successfully!\n");
  console.log("  Account:");
  console.log(`    ${email} / ${process.env.ADMIN_PASSWORD || "Bot@2026"}`);
  console.log("");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
