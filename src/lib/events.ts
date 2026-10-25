// SSE event bus — in-process fan-out to authenticated streams (single instance; use Redis pub/sub if scaled)
export type StreamPayload = { id: number; type: string; at: string; data: unknown };
export type StreamSink = (payload: StreamPayload) => void;

const subs = new Map<string, Set<StreamSink>>();
let seq = 0;

// Subscribe a stream sink — returns unsubscribe (route calls it on close)
export function subscribe(userId: string, sink: StreamSink) {
  let set = subs.get(userId);
  if (!set) {
    set = new Set();
    subs.set(userId, set);
  }
  set.add(sink);
  return () => {
    set.delete(sink);
    if (!set.size) subs.delete(userId);
  };
}

// Push to one user's streams — no-op when offline (Query polling covers catch-up)
export function emitToUser(userId: string | null | undefined, type: string, data?: unknown) {
  if (!userId) return;
  const sinks = subs.get(userId);
  if (!sinks?.size) return;
  const payload: StreamPayload = { id: ++seq, type, at: new Date().toISOString(), data: data ?? {} };
  for (const sink of [...sinks]) {
    try {
      sink(payload);
    } catch {
      subs.get(userId)?.delete(sink);
    }
  }
}
