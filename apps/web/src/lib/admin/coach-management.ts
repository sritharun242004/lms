import { securePasswordSchema } from "@cms/shared";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

type AdminActor = { id: string; role: string };

export const coachAccountUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().min(1, "Email is required").email("Invalid email address").toLowerCase(),
});

export const coachPasswordSchema = z.object({ password: securePasswordSchema });

export type CoachAccount = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  disabledAt: Date | null;
  createdAt: Date;
};

const COACH_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  disabledAt: true,
  createdAt: true,
} as const;

export class CoachManagementError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "CoachManagementError";
  }
}

function requireAdmin(actor: AdminActor) {
  if (actor.role !== "ADMIN") {
    throw new CoachManagementError("Super Admin access required", "FORBIDDEN", 403);
  }
}

function safeCoach(value: CoachAccount & { role?: string }): CoachAccount {
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    isActive: value.isActive,
    disabledAt: value.disabledAt,
    createdAt: value.createdAt,
  };
}

async function findCoachTarget(actor: AdminActor, coachId: string) {
  requireAdmin(actor);
  if (actor.id === coachId) {
    throw new CoachManagementError(
      "A Super Admin account cannot be managed as a coach",
      "INVALID_COACH_TARGET",
      400
    );
  }

  const coach = await prisma.user.findFirst({
    where: { id: coachId, role: "MENTOR" },
    select: COACH_SELECT,
  });
  if (!coach || coach.role !== "MENTOR") {
    throw new CoachManagementError("Coach account not found", "COACH_NOT_FOUND", 404);
  }
  return coach;
}

function rethrowUniqueConstraint(error: unknown): never {
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    throw new CoachManagementError("This email is already in use", "EMAIL_IN_USE", 409);
  }
  throw error;
}

export async function listCoachAccounts(actor: AdminActor): Promise<CoachAccount[]> {
  requireAdmin(actor);
  const coaches = await prisma.user.findMany({
    where: { role: "MENTOR" },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: COACH_SELECT,
  });
  return coaches.map(safeCoach);
}

export async function updateCoachAccount(
  actor: AdminActor,
  coachId: string,
  input: z.infer<typeof coachAccountUpdateSchema>
): Promise<CoachAccount> {
  const parsed = coachAccountUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new CoachManagementError("Invalid coach account details", "VALIDATION_ERROR", 400);
  }

  const coach = await findCoachTarget(actor, coachId);
  const email = parsed.data.email;

  const [userCollision, approvalCollision] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: { not: coachId },
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    }),
    prisma.coachEmailApproval.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        NOT: { claimedById: coachId },
      },
      select: { id: true },
    }),
  ]);
  if (userCollision || approvalCollision) {
    throw new CoachManagementError("This email is already in use", "EMAIL_IN_USE", 409);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: coach.id },
        data: { name: parsed.data.name, email },
        select: COACH_SELECT,
      });
      if (email !== coach.email) {
        await tx.coachEmailApproval.updateMany({
          where: { claimedById: coach.id },
          data: { email },
        });
      }
      return user;
    });
    return safeCoach(updated);
  } catch (error) {
    rethrowUniqueConstraint(error);
  }
}

export async function setCoachPassword(
  actor: AdminActor,
  coachId: string,
  password: string
): Promise<CoachAccount> {
  const parsed = coachPasswordSchema.safeParse({ password });
  if (!parsed.success) {
    throw new CoachManagementError("Password does not meet the security policy", "VALIDATION_ERROR", 400);
  }

  const coach = await findCoachTarget(actor, coachId);
  const passwordHash = await hashPassword(parsed.data.password);
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: coach.id },
      data: { password: passwordHash },
      select: COACH_SELECT,
    });
    await tx.refreshToken.deleteMany({ where: { userId: coach.id } });
    await tx.session.updateMany({
      where: { userId: coach.id, isActive: true },
      data: { isActive: false },
    });
    return user;
  });
  return safeCoach(updated);
}

export async function deactivateCoachAccount(
  actor: AdminActor,
  coachId: string
): Promise<CoachAccount> {
  const coach = await findCoachTarget(actor, coachId);
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: coach.id },
      data: { isActive: false, disabledAt: new Date(), status: "OFFLINE" },
      select: COACH_SELECT,
    });
    await tx.refreshToken.deleteMany({ where: { userId: coach.id } });
    await tx.session.updateMany({
      where: { userId: coach.id, isActive: true },
      data: { isActive: false },
    });
    return user;
  });
  return safeCoach(updated);
}

export async function reactivateCoachAccount(
  actor: AdminActor,
  coachId: string
): Promise<CoachAccount> {
  const coach = await findCoachTarget(actor, coachId);
  const updated = await prisma.$transaction(async (tx) =>
    tx.user.update({
      where: { id: coach.id },
      data: { isActive: true, disabledAt: null },
      select: COACH_SELECT,
    })
  );
  return safeCoach(updated);
}
