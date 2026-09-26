// Owner: Andy — entry: restore the stored token, then go to (main) or start onboarding.
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { session } from "../lib/secureSession";

export default function Index() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    session
      .restore()
      .then(setToken)
      .catch(() => setToken(null));
  }, []);

  if (token === undefined) return null; // still reading secure storage
  return <Redirect href={token ? "/(main)" : "/(onboarding)"} />;
}
