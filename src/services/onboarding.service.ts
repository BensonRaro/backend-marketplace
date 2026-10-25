// Onboarding service — business logic + DB for client/freelancer (admin bypassed)
import { prisma } from "../lib/prisma.js";
import type { ClientOnboardingInput, FreelancerOnboardingInput } from "../validators/onboarding.validator.js";

function apiError(msg: string, status: number, code: string) {
  const e = new Error(msg) as Error & { status?: number; code?: string };
  e.status = status;
  e.code = code;
  return e;
}

export async function getOnboardingStatusService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, image: true, role: true, onboardingCompleted: true, onboardingCompletedAt: true, email: true },
  });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role === "admin") return { ...user, onboardingCompleted: true, profile: null };

  let profile = null;
  if (user.role === "client") {
    profile = await prisma.clientProfile.findUnique({ where: { userId } });
  } else if (user.role === "freelancer") {
    profile = await prisma.freelancerProfile.findUnique({ where: { userId } });
  }
  return { ...user, profile };
}

export async function completeClientOnboardingService(userId: string, input: ClientOnboardingInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role !== "client") throw apiError("Only clients can use this onboarding", 403, "FORBIDDEN");

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      image: input.image || undefined,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
    },
    select: { id: true, name: true, image: true, role: true, onboardingCompleted: true },
  });

  const profile = await prisma.clientProfile.upsert({
    where: { userId },
    create: { userId, company: input.company || null, bio: input.bio, location: input.location || null, website: input.website || null },
    update: { company: input.company || null, bio: input.bio, location: input.location || null, website: input.website || null },
  });

  return { user: updatedUser, profile };
}

export async function completeFreelancerOnboardingService(userId: string, input: FreelancerOnboardingInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role !== "freelancer") throw apiError("Only freelancers can use this onboarding", 403, "FORBIDDEN");

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      image: input.image || undefined,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
    },
    select: { id: true, name: true, image: true, role: true, onboardingCompleted: true },
  });

  const profile = await prisma.freelancerProfile.upsert({
    where: { userId },
    create: {
      userId,
      title: input.title,
      bio: input.bio,
      skills: input.skills,
      hourlyRate: Math.round(input.hourlyRate * 100),
      location: input.location || null,
      website: input.website || null,
      portfolio: input.portfolio || null,
    },
    update: {
      title: input.title,
      bio: input.bio,
      skills: input.skills,
      hourlyRate: Math.round(input.hourlyRate * 100),
      location: input.location || null,
      website: input.website || null,
      portfolio: input.portfolio || null,
    },
  });

  return { user: updatedUser, profile };
}
