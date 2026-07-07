import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ============================================================
// SEED DATA
// ============================================================

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── 1. Create Admin ──────────────────────────────────────
  const adminPassword = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || "Admin@123456",
    12
  );

  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || "admin@mentorconnect.dev" },
    update: {},
    create: {
      name: process.env.ADMIN_NAME || "System Admin",
      email: process.env.ADMIN_EMAIL || "admin@mentorconnect.dev",
      password: adminPassword,
      role: "ADMIN",
      bio: "System Administrator for Mentor Connect LMS",
      emailVerified: true,
      status: "OFFLINE",
    },
  });
  console.log(`  ✓ Admin created: ${admin.email}`);

  // ── 2. Create Demo Mentors ────────────────────────────────
  const mentorPassword = await bcrypt.hash("Mentor@123456", 12);

  const mentor1 = await prisma.user.upsert({
    where: { email: "sarah.chen@mentorconnect.dev" },
    update: {},
    create: {
      name: "Sarah Chen",
      email: "sarah.chen@mentorconnect.dev",
      password: mentorPassword,
      role: "MENTOR",
      bio: "Senior Software Engineer with 10+ years of experience. Specializing in React, Node.js, and system design.",
      emailVerified: true,
      status: "OFFLINE",
    },
  });
  console.log(`  ✓ Mentor created: ${mentor1.email}`);

  const mentor2 = await prisma.user.upsert({
    where: { email: "james.wilson@mentorconnect.dev" },
    update: {},
    create: {
      name: "James Wilson",
      email: "james.wilson@mentorconnect.dev",
      password: mentorPassword,
      role: "MENTOR",
      bio: "Full Stack Developer & DevOps Engineer. Expert in cloud architecture and CI/CD pipelines.",
      emailVerified: true,
      status: "OFFLINE",
    },
  });
  console.log(`  ✓ Mentor created: ${mentor2.email}`);

  // ── 3. Create Demo Groups ────────────────────────────────
  const group1 = await prisma.group.upsert({
    where: { id: "seed-group-react-mastery" },
    update: {},
    create: {
      id: "seed-group-react-mastery",
      name: "React Mastery 2026",
      description:
        "Advanced React patterns, Server Components, and modern frontend architecture. Weekly live sessions and code reviews.",
      createdById: mentor1.id,
    },
  });
  console.log(`  ✓ Group created: ${group1.name}`);

  const group2 = await prisma.group.upsert({
    where: { id: "seed-group-fullstack-bootcamp" },
    update: {},
    create: {
      id: "seed-group-fullstack-bootcamp",
      name: "Full Stack Bootcamp",
      description:
        "Complete full stack development course covering Node.js, PostgreSQL, Docker, and cloud deployment.",
      createdById: mentor2.id,
    },
  });
  console.log(`  ✓ Group created: ${group2.name}`);

  const group3 = await prisma.group.upsert({
    where: { id: "seed-group-system-design" },
    update: {},
    create: {
      id: "seed-group-system-design",
      name: "System Design Interview Prep",
      description:
        "Prepare for system design interviews at top tech companies. Case studies, mock interviews, and architecture discussions.",
      createdById: admin.id,
    },
  });
  console.log(`  ✓ Group created: ${group3.name}`);

  // ── 4. Add Mentors as Group Owners ────────────────────────
  const memberUpserts = [
    { userId: mentor1.id, groupId: group1.id, role: "OWNER" as const },
    { userId: mentor2.id, groupId: group2.id, role: "OWNER" as const },
    { userId: admin.id, groupId: group3.id, role: "OWNER" as const },
    { userId: admin.id, groupId: group1.id, role: "MENTOR" as const },
    { userId: admin.id, groupId: group2.id, role: "MENTOR" as const },
  ];

  for (const member of memberUpserts) {
    await prisma.groupMember.upsert({
      where: {
        userId_groupId: {
          userId: member.userId,
          groupId: member.groupId,
        },
      },
      update: {},
      create: member,
    });
  }
  console.log(`  ✓ Group members assigned`);

  // ── 5. Create Invite Codes ────────────────────────────────
  const inviteCodes = [
    {
      code: "LMS-REACT",
      groupId: group1.id,
      createdById: mentor1.id,
    },
    {
      code: "LMS-STACK",
      groupId: group2.id,
      createdById: mentor2.id,
    },
    {
      code: "LMS-SYSDN",
      groupId: group3.id,
      createdById: admin.id,
    },
  ];

  for (const invite of inviteCodes) {
    await prisma.inviteCode.upsert({
      where: { code: invite.code },
      update: {},
      create: invite,
    });
  }
  console.log(`  ✓ Invite codes created: ${inviteCodes.map((i) => i.code).join(", ")}`);

  // ── 6. Create Demo Mentees ────────────────────────────────
  const menteePassword = await bcrypt.hash("Mentee@123456", 12);

  const mentees = [
    { name: "Alex Rivera", email: "alex@example.com", phone: "+14155551001" },
    { name: "Priya Sharma", email: "priya@example.com", phone: "+919876543210" },
    { name: "Marcus Johnson", email: "marcus@example.com", phone: "+14155551003" },
    { name: "Lin Wei", email: "lin@example.com", phone: "+8613800138000" },
    { name: "Emma Thompson", email: "emma@example.com", phone: "+447911123456" },
  ];

  const createdMentees = [];
  for (const mentee of mentees) {
    const user = await prisma.user.upsert({
      where: { email: mentee.email },
      update: {},
      create: {
        ...mentee,
        password: menteePassword,
        role: "MENTEE",
        emailVerified: true,
        status: "OFFLINE",
      },
    });
    createdMentees.push(user);
  }
  console.log(`  ✓ ${createdMentees.length} mentees created`);

  // ── 7. Add Mentees to Groups ──────────────────────────────
  const menteeGroupAssignments = [
    // All mentees join React Mastery
    ...createdMentees.map((m) => ({
      userId: m.id,
      groupId: group1.id,
    })),
    // First 3 mentees join Full Stack Bootcamp
    ...createdMentees.slice(0, 3).map((m) => ({
      userId: m.id,
      groupId: group2.id,
    })),
    // Last 2 mentees join System Design
    ...createdMentees.slice(3).map((m) => ({
      userId: m.id,
      groupId: group3.id,
    })),
  ];

  for (const assignment of menteeGroupAssignments) {
    await prisma.groupMember.upsert({
      where: {
        userId_groupId: {
          userId: assignment.userId,
          groupId: assignment.groupId,
        },
      },
      update: {},
      create: {
        ...assignment,
        role: "MENTEE",
      },
    });
  }
  console.log(`  ✓ Mentees assigned to groups`);

  // ── 8. Create Sample Messages ─────────────────────────────
  const messages = [
    {
      content:
        "Welcome to React Mastery 2026! 🚀 I'm thrilled to have you all here. In this group, we'll cover advanced React patterns, Server Components, and modern frontend architecture.",
      type: "ANNOUNCEMENT" as const,
      groupId: group1.id,
      senderId: mentor1.id,
    },
    {
      content:
        "Our first session will be on **React Server Components** — how they work under the hood and when to use them vs Client Components. See you on Monday at 7 PM IST!",
      type: "TEXT" as const,
      groupId: group1.id,
      senderId: mentor1.id,
    },
    {
      content:
        "📚 Homework: Read the Next.js App Router documentation and try building a simple page with both Server and Client Components. Share your code in the group!",
      type: "TEXT" as const,
      groupId: group1.id,
      senderId: mentor1.id,
      isPinned: true,
    },
    {
      content:
        "Hey everyone! Welcome to the Full Stack Bootcamp! 👋 This is going to be an intensive 12-week journey from backend to deployment.",
      type: "ANNOUNCEMENT" as const,
      groupId: group2.id,
      senderId: mentor2.id,
    },
    {
      content:
        "Week 1 agenda: Setting up our development environment — Node.js, PostgreSQL, Docker, and VS Code extensions. I'll share the complete setup guide tomorrow.",
      type: "TEXT" as const,
      groupId: group2.id,
      senderId: mentor2.id,
    },
    {
      content:
        "Welcome to the System Design Interview Prep group! 🏗️ We'll cover distributed systems, database design, caching strategies, and more.",
      type: "ANNOUNCEMENT" as const,
      groupId: group3.id,
      senderId: admin.id,
    },
  ];

  for (const msg of messages) {
    await prisma.message.create({
      data: msg,
    });
  }
  console.log(`  ✓ ${messages.length} sample messages created`);

  // ── Done ──────────────────────────────────────────────────
  console.log("\n✅ Database seeded successfully!\n");
  console.log("  Accounts:");
  console.log(`    Admin:  admin@mentorconnect.dev / Admin@123456`);
  console.log(`    Mentor: sarah.chen@mentorconnect.dev / Mentor@123456`);
  console.log(`    Mentor: james.wilson@mentorconnect.dev / Mentor@123456`);
  console.log(`    Mentee: alex@example.com / Mentee@123456`);
  console.log(`    Mentee: priya@example.com / Mentee@123456`);
  console.log("");
  console.log("  Invite Codes:");
  console.log(`    LMS-REACT  → React Mastery 2026`);
  console.log(`    LMS-STACK  → Full Stack Bootcamp`);
  console.log(`    LMS-SYSDN  → System Design Interview Prep`);
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
