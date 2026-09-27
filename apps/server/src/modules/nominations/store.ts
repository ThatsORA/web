// Owner: Ojas (handed to Riley for #218) — in-memory store for nominations
// pending Prisma schema change (#263).
import { randomUUID } from "node:crypto";
import type { NominationStatus } from "@web/contract";

export interface StoredNomination {
  id: string;
  eventId: string;
  nomineeId: string;
  nominatedById: string;
  status: NominationStatus;
  votes: string[]; // user IDs of squad-sourced participants who voted yes
  threshold: number; // votes needed (> eligibleCount / 2)
  eligibleCount: number;
  createdAt: Date;
  resolvedAt: Date | null;
}

export class NominationStore {
  private nominations = new Map<string, StoredNomination>();

  create(data: Omit<StoredNomination, "id" | "createdAt" | "resolvedAt">): StoredNomination {
    const id = randomUUID();
    const nomination: StoredNomination = {
      ...data,
      id,
      createdAt: new Date(),
      resolvedAt: data.status === "approved" ? new Date() : null,
    };
    this.nominations.set(id, nomination);
    return nomination;
  }

  get(id: string): StoredNomination | undefined {
    return this.nominations.get(id);
  }

  getByEvent(eventId: string): StoredNomination[] {
    return Array.from(this.nominations.values())
      .filter((n) => n.eventId === eventId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  findActiveForNominee(eventId: string, nomineeId: string): StoredNomination | undefined {
    return Array.from(this.nominations.values()).find(
      (n) => n.eventId === eventId && n.nomineeId === nomineeId && (n.status === "pending" || n.status === "approved")
    );
  }

  countActiveForEvent(eventId: string): number {
    return Array.from(this.nominations.values()).filter(
      (n) => n.eventId === eventId && (n.status === "pending" || n.status === "approved")
    ).length;
  }

  addVote(id: string, voterId: string): StoredNomination | undefined {
    const nom = this.nominations.get(id);
    if (!nom || nom.status !== "pending") return undefined;
    if (!nom.votes.includes(voterId)) {
      nom.votes.push(voterId);
      if (nom.votes.length >= nom.threshold) {
        nom.status = "approved";
        nom.resolvedAt = new Date();
      }
    }
    return nom;
  }

  updateStatus(id: string, status: NominationStatus): StoredNomination | undefined {
    const nom = this.nominations.get(id);
    if (!nom) return undefined;
    nom.status = status;
    if (status !== "pending") {
      nom.resolvedAt = new Date();
    }
    return nom;
  }

  clear(): void {
    this.nominations.clear();
  }
}

export const nominationStore = new NominationStore();
