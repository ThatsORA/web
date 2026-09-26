// Owner: Ojas — friend-request rules (the visible layer). The silent close-friend flags live in handshake.ts.
export interface RequestRow {
  status: "pending" | "accepted";
  requestedById: string | null;
  declinedAt: Date | null;
}

export const MAX_PENDING_OUTGOING = 50;

/**
 * POST /friends/requests, given this pair's row (if any). If they already asked me, sending accepts it
 * (crossing requests, or me changing my mind after declining them).
 */
export function onSend(row: RequestRow | null, me: string): "create" | "accept" | "requested" | "friends" {
  if (!row) return "create";
  if (row.status === "accepted") return "friends";
  return row.requestedById === me ? "requested" : "accept";
}

/** DELETE /friends/requests/:id: the requester cancels (row deleted); the recipient declines (soft, see requestView). */
export const onDelete = (row: RequestRow, me: string): "cancel" | "decline" => (row.requestedById === me ? "cancel" : "decline");

/** Only the recipient accepts. */
export const canAccept = (row: RequestRow, me: string) => row.status === "pending" && row.requestedById !== me;

/**
 * Where a row shows up for me. A declined request leaves the recipient's inbox but stays "outgoing" to the
 * requester, so a decline is never announced; they only lose it by cancelling.
 */
export function requestView(row: RequestRow, me: string): "incoming" | "outgoing" | null {
  if (row.status !== "pending") return null;
  if (row.requestedById === me) return "outgoing";
  return row.declinedAt ? null : "incoming";
}
