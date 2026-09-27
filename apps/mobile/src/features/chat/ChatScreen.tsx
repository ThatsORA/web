// Owner: Ojas — event group chat: squad hangouts from creation (#212), other events as the chatted fallback.
// Thin socket payload rule: event:message triggers refetch of GET /events/:id/messages.
// Read-only after ends_at.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatMessage, ChatSuggestionKind } from "@web/contract";
import { useToken } from "../../lib/api";
import { displayName } from "../../lib/displayName";
import { userIdFromToken } from "../../lib/session";
import { Button, Callout, Txt, useTheme } from "../../ui";
import { useChatSuggestions, useEventSocket } from "../event-card/useEventSocket";
import { getEventMessages, runSuggestion, sendChatMessage, SUGGESTION_LABEL } from "./chatApi";

type Props = {
  eventId: string;
  /** Header: the venue ("Cafe Bea"), or the vibe before one is picked. */
  title?: string;
  /** Small line under the title: "Thu · 6:30–8:30pm". */
  when?: string;
  isEnded?: boolean;
  onBack?: () => void;
};

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "";
  }
}

export function ChatScreen({ eventId, title, when, isEnded = false, onBack }: Props) {
  const t = useTheme();
  const token = useToken();
  const currentUserId = userIdFromToken(token);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  // #325: a suggested action per own message id, from `chat:suggestion` (sent only to me, never stored).
  const [suggestions, setSuggestions] = useState<Record<string, ChatSuggestionKind | undefined>>({});
  const dismiss = (messageId: string) => setSuggestions((s) => ({ ...s, [messageId]: undefined }));
  const actOn = async (messageId: string, kind: ChatSuggestionKind) => {
    dismiss(messageId);
    const notice = await runSuggestion(eventId, kind);
    if (notice) setError(notice);
  };

  useChatSuggestions((p) => {
    if (p.event_id === eventId) setSuggestions((s) => ({ ...s, [p.message_id]: p.kind }));
  });

  const scrollRef = useRef<ScrollView>(null);

  const loadInitial = useCallback(async () => {
    try {
      setError(null);
      const res = await getEventMessages(eventId);
      setMessages(res.messages);
      setNextCursor(res.next_cursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load chat messages");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    void Promise.resolve().then(loadInitial);
  }, [loadInitial]);

  // Thin socket listener: refetch latest messages on event:message
  useEventSocket((updatedEventId) => {
    if (updatedEventId === eventId) {
      void getEventMessages(eventId)
        .then((res) => {
          setMessages(res.messages);
          setNextCursor(res.next_cursor);
        })
        .catch(() => {});
    }
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitial();
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getEventMessages(eventId, nextCursor);
      setMessages((prev) => [...res.messages, ...prev]);
      setNextCursor(res.next_cursor);
    } catch {
      // ignore cursor pagination failure
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || isEnded) return;
    setSending(true);
    setError(null);
    try {
      const created = await sendChatMessage(eventId, text);
      setMessages((prev) => [...prev, created]);
      setInput("");
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.md,
            paddingBottom: t.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: t.colors.border,
            gap: t.spacing.xs,
          }}
        >
          {onBack ? (
            <View style={{ alignSelf: "flex-start", marginBottom: t.spacing.xs }}>
              <Button label="← Back to card" variant="ghost" onPress={onBack} />
            </View>
          ) : null}
          <Txt variant="display" accessibilityRole="header">
            {title ?? "Chat"}
          </Txt>
          {when ? (
            <Txt variant="small" color="textMuted" numeric>
              {when}
            </Txt>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            padding: t.spacing.lg,
            gap: t.spacing.md,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {nextCursor ? (
            <View style={{ alignItems: "center", marginBottom: t.spacing.xs }}>
              <Button
                label={loadingMore ? "Loading..." : "Load earlier messages"}
                variant="outline"
                disabled={loadingMore}
                loading={loadingMore}
                onPress={handleLoadMore}
              />
            </View>
          ) : null}

          {loading && messages.length === 0 ? (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                minHeight: 120,
              }}
            >
              <ActivityIndicator color={t.colors.primary} />
            </View>
          ) : null}

          {error ? (
            <Callout tone="danger" title="Chat Error">
              {error}
            </Callout>
          ) : null}

          {!loading && messages.length === 0 && !error ? (
            <Callout tone="info" title="No messages yet" />
          ) : null}

          {messages.map((m) => {
            const isMe = currentUserId ? m.user_id === currentUserId : false;
            const suggestion = isMe ? suggestions[m.id] : undefined;
            return (
              <View
                key={m.id}
                style={{
                  alignSelf: isMe ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  gap: t.spacing.xs,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: isMe ? "flex-end" : "flex-start",
                    gap: t.spacing.xs,
                    alignItems: "baseline",
                  }}
                >
                  <Txt variant="label" color={isMe ? "primary" : "heading"}>
                    {isMe ? "You" : displayName(m)}
                  </Txt>
                  <Txt variant="small" color="textMuted">
                    {formatMessageTime(m.created_at)}
                  </Txt>
                </View>
                <View
                  style={{
                    backgroundColor: isMe ? t.colors.primarySofter : t.colors.surfaceCard,
                    borderColor: isMe ? t.colors.primarySoft : t.colors.border,
                    borderWidth: 1,
                    borderRadius: t.radius.md,
                    paddingHorizontal: t.spacing.md,
                    paddingVertical: t.spacing.sm,
                  }}
                >
                  <Txt variant="body" color="text">
                    {m.body}
                  </Txt>
                </View>
                {suggestion ? (
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: t.spacing.xs }}>
                    <Button
                      label={SUGGESTION_LABEL[suggestion]}
                      variant="outline"
                      size="sm"
                      onPress={() => void actOn(m.id, suggestion)}
                    />
                    <Button label="Dismiss" variant="ghost" size="sm" onPress={() => dismiss(m.id)} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        {isEnded ? (
          <View
            style={{
              padding: t.spacing.md,
              borderTopWidth: 1,
              borderTopColor: t.colors.border,
              backgroundColor: t.colors.surface,
            }}
          >
            <Callout tone="info" title="Read-only">
              This event has ended. The chat is archived and read-only.
            </Callout>
          </View>
        ) : (
          <View
            style={{
              padding: t.spacing.md,
              borderTopWidth: 1,
              borderTopColor: t.colors.border,
              backgroundColor: t.colors.background,
              flexDirection: "row",
              alignItems: "flex-end",
              gap: t.spacing.sm,
            }}
          >
            <TextInput
              accessibilityLabel="Message input"
              placeholder="Type a message..."
              placeholderTextColor={t.colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={1000}
              editable={!sending}
              style={{
                flex: 1,
                ...t.type.body,
                minHeight: t.touch,
                maxHeight: 120,
                color: t.colors.heading,
                backgroundColor: t.colors.surface,
                borderColor: t.colors.borderStrong,
                borderWidth: 1,
                borderRadius: t.radius.md,
                paddingHorizontal: t.spacing.md,
                paddingVertical: t.spacing.sm,
              }}
            />
            <Button
              label="Send"
              variant="primary"
              disabled={!input.trim() || sending}
              loading={sending}
              onPress={handleSend}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
