// Owner: Riley — the matcher pipeline (plan §2–§7), behind ONE in-process mutex.
// Every trigger (cron, handshake, busy-block PUT, /internal/run-matcher)
// calls triggerMatcher(); never call the pipeline around it.

let running: Promise<void> | null = null;
let rerunRequested = false;

async function runPipeline(): Promise<void> {
  // TODO(Riley): candidate groups → free windows → vibe/slot → rank →
  // venues → route matrix → curateVenues() → write event → openVoting().
}

export function triggerMatcher(): Promise<void> {
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerunRequested = false;
        await runPipeline();
      } while (rerunRequested);
    } finally {
      running = null;
    }
  })();
  return running;
}
