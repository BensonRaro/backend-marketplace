// notifyUser — persist a Notification row then fan out the same event over SSE
import { prisma } from "./prisma.js";
import { emitToUser } from "./events.js";

export type NotifyInput = {
  type: string;
  title: string;
  message: string;
  entity?: string;
  entityId?: string;
  data?: unknown;
};

// Writes inbox row (dropdown source of truth) + pushes live event; never throws
export async function notifyUser(userId: string | null | undefined, input: NotifyInput) {
  if (!userId) return null;
  let row = null;
  try {
    row = await prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        data: (input.data ?? {}) as never,
      },
    });
  } catch (err) {
    console.warn("[notify] persist failed", (err as Error).message);
  }
  emitToUser(userId, input.type, { ...(input.data as object ?? {}), notificationId: row?.id ?? null });
  return row;
}
