// Owner: Ojas — called by Riley's matcher after it writes the event row.
// openVoting emits event:created to every participant; the 15 s sweep
// closes/resolves events (plan §9–§10).
export async function openVoting(_eventId: string): Promise<void> {
  // TODO(Ojas)
}

export async function sweepVoting(): Promise<void> {
  // TODO(Ojas): close due events, resolve → confirmed | chatted | expired
}
