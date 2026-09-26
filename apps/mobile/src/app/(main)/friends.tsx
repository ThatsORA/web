// Owner: Andy (route) — Friends tab. Hosts Ojas's friends screen.
// TODO(#74): swap to FriendsScreen once it lands in features/friends.
// Until then it reuses the onboarding close-friends step (search + Add, real API); its Done/Skip goes back to Hangouts.
import { router } from "expo-router";
import { FriendsStep } from "../../features/friends";

export default function Friends() {
  return <FriendsStep onDone={() => router.navigate("/(main)")} />;
}
