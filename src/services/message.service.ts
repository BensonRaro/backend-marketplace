// Message service — contract thread chat (parties only, SSE + inbox notify on send)
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";
import type { SendMessageInput } from "../validators/message.validator.js";

const SENDER_SELECT = { id: true, name: true, image: true } as const;

// Party check shared by list + send — outsiders read as NOT_FOUND (no existence leak)
async function loadPartyContract(contractId: string, userId: string, role: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, clientId: true, freelancerId: true, job: { select: { title: true } } },
  });
  if (!contract) throw apiError("Conversation not found", 404, "NOT_FOUND");
  if (contract.clientId !== userId && contract.freelancerId !== userId && role !== "admin") {
    throw apiError("Conversation not found", 404, "NOT_FOUND");
  }
  return contract;
}

// Thread history, oldest first for chat rendering (capped — chat pages backfill via polling)
export async function listMessagesService(userId: string, role: string, contractId: string) {
  await loadPartyContract(contractId, userId, role);
  return prisma.message.findMany({
    where: { contractId },
    include: { sender: { select: SENDER_SELECT } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

// Party sends text and/or files — recipient gets inbox row + live message.created event
export async function sendMessageService(userId: string, role: string, contractId: string, input: SendMessageInput) {
  const contract = await loadPartyContract(contractId, userId, role);
  const body = (input.body ?? "").trim();
  const attachments = input.attachments ?? [];
  if (!body && attachments.length === 0) throw apiError("Write a message or attach a file", 400, "EMPTY_MESSAGE");
  const message = await prisma.message.create({
    data: { contractId, senderId: userId, body, attachments },
    include: { sender: { select: SENDER_SELECT } },
  });
  const recipientId = userId === contract.clientId ? contract.freelancerId : contract.clientId;
  await notifyUser(recipientId, {
    type: "message.created",
    title: "New message",
    message: body ? body.slice(0, 80) : `Sent you ${attachments.length > 1 ? `${attachments.length} files` : "a file"}`,
    entity: "Message",
    entityId: message.id,
    data: { messageId: message.id, contractId, senderId: userId },
  });
  return message;
}
