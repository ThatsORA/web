// Owner: Andy — how every card button runs: call the server, then always refetch the card (plan: thin payloads).

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs a card action and refetches the card whether it worked or not. Returns the notice to show, if any. */
export async function runCardAction(
  call: () => Promise<unknown>,
  refetch: () => Promise<unknown>,
  noticeFor: (e: unknown) => string = errorMessage,
): Promise<string | undefined> {
  try {
    await call();
    return undefined;
  } catch (e) {
    return noticeFor(e);
  } finally {
    await refetch().catch(() => {});
  }
}
