// Owner: Andy — route for a chatted event's fallback group chat (#147). The screen itself is features/chat (Ojas).
import { router, useLocalSearchParams } from "expo-router";
import { ChatScreen } from "../../../features/chat";

export default function EventChat() {
  const { eventId, ended } = useLocalSearchParams<{ eventId: string; ended?: string }>();
  return <ChatScreen key={eventId} eventId={eventId} isEnded={ended === "1"} onBack={() => router.back()} />;
}
