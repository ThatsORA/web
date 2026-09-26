// Owner: Ojas — one friendships row per pair (low id < high id); each side owns one flag.
export interface FlagRow {
  lowAddedHigh: boolean;
  highAddedLow: boolean;
}

/** The unique key for a pair, plus which flag belongs to `me`. */
export function pair(me: string, other: string) {
  const iAmLow = me < other;
  return {
    userLowId: iAmLow ? me : other,
    userHighId: iAmLow ? other : me,
    myFlag: iAmLow ? ("lowAddedHigh" as const) : ("highAddedLow" as const),
  };
}

export const isMutual = (row: FlagRow) => row.lowAddedHigh && row.highAddedLow;
