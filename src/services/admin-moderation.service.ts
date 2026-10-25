// Moderation service — admin ban/unban with cleanup + notifications for affected contracts
import { prisma } from "../lib/prisma.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";

const USER_SELECT = { id: true, name: true, role: true, isBanned: true, banReason: true } as const;

// Admin suspends a client/freelancer — pending bids die, open jobs close, counterparts are told
export async function banUserService(adminId: string, userId: string, reason: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role === "admin") throw apiError("Admin accounts cannot be banned", 403, "FORBIDDEN");
  if (user.id === adminId) throw apiError("You cannot ban your own account", 403, "FORBIDDEN");
  if (user.isBanned) throw apiError("User is already banned", 409, "ALREADY_BANNED");

  // Nothing new may start: pending bids are rejected and open jobs are closed
  const [proposals, jobs] = await Promise.all([
    prisma.proposal.updateMany({ where: { freelancerId: userId, status: "pending" }, data: { status: "rejected" } }),
    prisma.jobPosting.updateMany({ where: { clientId: userId, isOpen: true }, data: { isOpen: false } }),
  ]);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: true, banReason: reason, bannedAt: new Date(), bannedBy: adminId },
    select: USER_SELECT,
  });

  // Live contracts keep their escrow — only the suspended side is frozen out
  const active = await prisma.contract.findMany({
    where: { isCompleted: false, OR: [{ clientId: userId }, { freelancerId: userId }] },
    select: { id: true, clientId: true, freelancerId: true, job: { select: { title: true } } },
  });

  await notifyUser(userId, {
    type: "account.banned",
    title: "Account suspended",
    message: reason,
    entity: "User",
    entityId: userId,
    data: { reason },
  });
  for (const c of active) {
    const counterpartId = c.clientId === userId ? c.freelancerId : c.clientId;
    await notifyUser(counterpartId, {
      type: "contract.party.suspended",
      title: "Contract counterpart suspended",
      message: `The other party on "${c.job.title}" was suspended. Escrow stays locked until support resolves it.`,
      entity: "Contract",
      entityId: c.id,
      data: { contractId: c.id, suspendedUserId: userId },
    });
  }

  await logActivity(adminId, "user.banned", "User", userId, {
    reason,
    rejectedProposals: proposals.count,
    closedJobs: jobs.count,
    activeContracts: active.length,
  });

  return {
    ...updated,
    rejectedProposals: proposals.count,
    closedJobs: jobs.count,
    activeContracts: active.length,
  };
}

// Admin lifts a suspension — the account is fully writable again
export async function unbanUserService(adminId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (!user.isBanned) throw apiError("User is not banned", 409, "NOT_BANNED");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: false, banReason: null, bannedAt: null, bannedBy: null },
    select: USER_SELECT,
  });
  await logActivity(adminId, "user.unbanned", "User", userId, { previousReason: user.banReason });
  await notifyUser(userId, {
    type: "account.unbanned",
    title: "Account restored",
    message: "Your account has been reinstated — you can use the marketplace again.",
    entity: "User",
    entityId: userId,
  });
  return updated;
}
