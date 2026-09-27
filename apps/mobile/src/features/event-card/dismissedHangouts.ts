// Owner: Andy / Riley — persistence for dismissed expired hangout cards.
let secureStoreModule: typeof import("expo-secure-store") | null = null;

function getSecureStore() {
  if (!secureStoreModule) {
    try {
      secureStoreModule = require("expo-secure-store");
    } catch {
      secureStoreModule = null;
    }
  }
  return secureStoreModule;
}

const DISMISSED_KEY = "web_dismissed_hangout_ids";
let memoryDismissed: string[] = [];

export async function loadDismissedHangouts(): Promise<string[]> {
  const store = getSecureStore();
  if (!store?.getItemAsync) return memoryDismissed;
  try {
    const raw = await store.getItemAsync(DISMISSED_KEY);
    if (!raw) return memoryDismissed;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryDismissed = parsed;
      return parsed;
    }
  } catch {
    // fallback to in-memory
  }
  return memoryDismissed;
}

export async function saveDismissedHangouts(ids: string[]): Promise<void> {
  memoryDismissed = ids;
  const store = getSecureStore();
  if (!store?.setItemAsync) return;
  try {
    await store.setItemAsync(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // ignore secure store write failures
  }
}
