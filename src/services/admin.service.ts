// Admin stats — platform-wide counts + escrow totals for the admin dashboard
import { prisma } from "../lib/prisma.js";
import { platformFeePercent } from "./escrow.service.js";

export async function getAdminStatsService() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [users, clients, freelancers, banned, jobs, openJobs, proposals, pendingProposals, contracts, completedContracts, reviews, recentActivity] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "client" } }),
      prisma.user.count({ where: { role: "freelancer" } }),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.jobPosting.count(),
      prisma.jobPosting.count({ where: { isOpen: true } }),
      prisma.proposal.count(),
      prisma.proposal.count({ where: { status: "pending" } }),
      prisma.contract.count(),
      prisma.contract.count({ where: { isCompleted: true } }),
      prisma.review.count(),
      prisma.activityLog.count({ where: { createdAt: { gte: dayAgo } } }),
    ]);

  const [released, held, disputed] = await Promise.all([
    prisma.milestone.aggregate({ _sum: { amount: true }, where: { status: "released" } }),
    prisma.milestone.aggregate({ _sum: { amount: true }, where: { status: { in: ["funded", "submitted", "approved"] } } }),
    prisma.milestone.count({ where: { status: "disputed" } }),
  ]);

  return {
    users: { total: users, clients, freelancers, banned },
    jobs: { total: jobs, open: openJobs },
    proposals: { total: proposals, pending: pendingProposals },
    contracts: { total: contracts, completed: completedContracts },
    reviews: { total: reviews },
    escrow: {
      released: released._sum.amount ?? 0,
      held: held._sum.amount ?? 0,
      disputed,
      feePercent: platformFeePercent(),
    },
    activity: { last24h: recentActivity },
  };
}
