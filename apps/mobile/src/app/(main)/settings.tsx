// Owner: Andy — Settings redirect screen: routes seamlessly to You tab (#293).
import { Redirect } from "expo-router";

export default function Settings() {
  return <Redirect href="/(main)/you" />;
}

