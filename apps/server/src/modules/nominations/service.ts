// Owner: Ojas (handed to Riley for #218) — nominate and majority-vote a new person into an event.
import { votingOpen } from "../voting/resolution";
import { chatAccess, chatAudience, eventParticipants, keepsAccess, type InvitedParticipant } from "../events/invitations";
import { publicUserSelect, toPublicUser } from "../auth/helpers";
import { prisma } from "../../lib/prisma";
import { emitToUsers } from "../../realtime";
import { nominationStore, type StoredNomination } from "./store";

export const MAX_EVENT_CAPACITY = 6;

export function isSquadSourced(
  participant: { userId: string; inviteSource?: any; sourceGroupIds?: readonly string[] },
  event: { createdById: string | null; sourceGroupId: string | null; sourceGroupIds?: readonly string[] }
): boolean {
  if (participant.userId === event.createdById) {
    return Boolean(
      event.sourceGroupId ||
      (event.sourceGroupIds && event.sourceGroupIds.length > 0) ||
      (participant.sourceGroupIds && participant.sourceGroupIds.length > 0)
    );
  }
  if (participant.inviteSource === "squad") return true;
  if (!participant.inviteSource) {
    return Boolean(event.sourceGroupId && (!event.sourceGroupIds || event.sourceGroupIds.length === 0));
  }
  return false;
}

export function getEligibleSquadVoters(
  event: { createdById: string | null; sourceGroupId: string | null; sourceGroupIds?: readonly string[]; status: any; endsAt: Date },
  participants: readonly InvitedParticipant[]
): string[] {
  const eligible = participants.filter((p) => isSquadSourced(p, event) && keepsAccess(p, false));
  return eligible.map((p) => p.userId);
}

export function computeApprovalThreshold(eligibleCount: number): number {
  // Approval requires more than half of all eligible squad-sourced participants, not merely a majority of votes cast.
  return Math.floor(eligibleCount / 2) + 1;
}

export async function createNomination(
  callerId: string,
  eventId: string,
  nomineeId: string
): Promise<{ nomination?: StoredNomination; error?: string; status: number }> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { error: "not_found", status: 404 };

  const participants = await eventParticipants(eventId);
  const eligibleVoters = getEligibleSquadVoters(event, participants);

  // Must have chat access and be an eligible squad voter
  if (!eligibleVoters.includes(callerId)) {
    return { error: "forbidden", status: 403 };
  }

  // Target cannot be a current participant
  if (participants.some((p) => p.userId === nomineeId)) {
    return { error: "already_participant", status: 400 };
  }

  // Cannot create duplicate pending/approved nominations
  if (nominationStore.findActiveForNominee(eventId, nomineeId)) {
    return { error: "already_nominated", status: 409 };
  }

  // Exceeding capacity check (2–6 person capacity)
  const activeNominationCount = nominationStore.countActiveForEvent(eventId);
  if (participants.length + activeNominationCount >= MAX_EVENT_CAPACITY) {
    return { error: "capacity_exceeded", status: 400 };
  }

  // Nominee must exist
  const nominee = await prisma.user.findUnique({
    where: { id: nomineeId },
    select: publicUserSelect,
  });
  if (!nominee) return { error: "user_not_found", status: 404 };

  const eligibleCount = eligibleVoters.length;
  const threshold = computeApprovalThreshold(eligibleCount);

  // Nominator's vote is included by default
  const votes = [callerId];
  const isApproved = votes.length >= threshold;
  const nominationStatus = isApproved ? "approved" : "pending";

  const nomination = nominationStore.create({
    eventId,
    nomineeId,
    nominatedById: callerId,
    status: nominationStatus,
    votes,
    threshold,
    eligibleCount,
  });

  // Post proposal system message into chat if approved or pending
  const caller = await prisma.user.findUnique({ where: { id: callerId }, select: publicUserSelect });
  const callerName = caller?.displayName || caller?.username || "Someone";
  const nomineeName = nominee.displayName || nominee.username;
  const body = isApproved
    ? `${callerName} nominated ${nomineeName} to join (approved!)`
    : `${callerName} nominated ${nomineeName} to join (${votes.length}/${threshold} votes)`;

  await prisma.chatMessage.create({
    data: {
      eventId,
      userId: callerId,
      body,
    },
  });

  const otherChatters = eligibleVoters.filter((id) => id !== callerId);
  if (otherChatters.length > 0) {
    emitToUsers(otherChatters, "event:message", { event_id: eventId });
  }

  return { nomination, status: 201 };
}

export async function voteOnNomination(
  callerId: string,
  eventId: string,
  nominationId: string
): Promise<{ nomination?: StoredNomination; error?: string; status: number }> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { error: "not_found", status: 404 };

  const participants = await eventParticipants(eventId);
  const eligibleVoters = getEligibleSquadVoters(event, participants);

  if (!eligibleVoters.includes(callerId)) {
    return { error: "forbidden", status: 403 };
  }

  const nomination = nominationStore.get(nominationId);
  if (!nomination || nomination.eventId !== eventId) {
    return { error: "not_found", status: 404 };
  }

  if (nomination.status !== "pending") {
    return { error: "nomination_closed", status: 400 };
  }

  if (nomination.votes.includes(callerId)) {
    return { error: "already_voted", status: 400 };
  }

  const updated = nominationStore.addVote(nominationId, callerId);
  if (!updated) return { error: "vote_failed", status: 500 };

  if (updated.status === "approved") {
    const caller = await prisma.user.findUnique({ where: { id: callerId }, select: publicUserSelect });
    const callerName = caller?.displayName || caller?.username || "Someone";
    const nominee = await prisma.user.findUnique({ where: { id: nomination.nomineeId }, select: publicUserSelect });
    const nomineeName = nominee?.displayName || nominee?.username || "Guest";

    await prisma.chatMessage.create({
      data: {
        eventId,
        userId: callerId,
        body: `${callerName} voted to invite ${nomineeName} (approved!)`,
      },
    });

    const otherChatters = eligibleVoters.filter((id) => id !== callerId);
    if (otherChatters.length > 0) {
      emitToUsers(otherChatters, "event:message", { event_id: eventId });
    }
  }

  return { nomination: updated, status: 200 };
}

export async function respondToNomination(
  callerId: string,
  eventId: string,
  nominationId: string,
  accept: boolean
): Promise<{ error?: string; status: number; nomination?: StoredNomination }> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { error: "not_found", status: 404 };

  const nomination = nominationStore.get(nominationId);
  if (!nomination || nomination.eventId !== eventId) {
    return { error: "not_found", status: 404 };
  }

  // Must be the nominee
  if (nomination.nomineeId !== callerId) {
    return { error: "forbidden", status: 403 };
  }

  if (nomination.status !== "approved") {
    return { error: "not_approved", status: 400 };
  }

  if (!accept) {
    const declined = nominationStore.updateStatus(nominationId, "declined");
    return { status: 200, nomination: declined };
  }

  // Re-check capacity before joining
  const participants = await eventParticipants(eventId);
  if (participants.length >= MAX_EVENT_CAPACITY) {
    return { error: "capacity_exceeded", status: 409 };
  }

  // If venue voting is open, voteStatus is invited; if closed, settled as confirmed
  const isOpen = votingOpen(event, new Date());
  const initialVoteStatus = isOpen ? "invited" : "confirmed";

  await prisma.eventParticipant.create({
    data: {
      eventId,
      userId: callerId,
      voteStatus: initialVoteStatus,
      inviteSource: "direct",
      sourceGroupIds: [],
    },
  });

  const accepted = nominationStore.updateStatus(nominationId, "accepted");

  // Emit event:created to the accepted invitee so their client picks up the event card
  emitToUsers([callerId], "event:created", { event_id: eventId });

  return { status: 200, nomination: accepted };
}
