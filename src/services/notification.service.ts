// Notification service — per-user inbox (list, unread count, mark read)
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/stripe-verify.js";

// Own newest-first inbox — dropdown reads this (limit caps the payload)
export async function listNotificationsService(userId: string, opts?: { limit?: number; unreadOnly?: boolean }) {
  const limit = Math.min(Math.max(Number(opts?.limit) || 20, 1), 50);
  return prisma.notification.findMany({
    where: { userId, ...(opts?.unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// Badge count for the header bell
export async function unreadCountService(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

// Mark one as read — ownership checked, missing/foreign reads as NOT_FOUND
export async function markReadService(userId: string, id: string) {
  const row = await prisma.notification.findUnique({ where: { id } });
  if (!row || row.userId !== userId) throw apiError("Notification not found", 404, "NOT_FOUND");
  if (row.read) return row;
  return prisma.notification.update({ where: { id }, data: { read: true, readAt: new Date() } });
}

// Mark the whole inbox read — returns count for the badge reset
export async function markAllReadService(userId: string) {
  return prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true, readAt: new Date() } });
}
