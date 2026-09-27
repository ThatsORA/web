// Owner: Ojas — requests inbox showing incoming (Accept / Decline) and outgoing (Cancel) requests.
// Entry point displays a badge count of incoming requests.
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Badge, Button, Callout, Card, Txt, useTheme } from "../../ui";
import {
  acceptFriendRequest,
  deleteFriendRequest,
  type FriendRequestsResponse,
} from "./friendsApi";
import { PersonLink } from "./PersonLink";
import { useBusyAction } from "./useBusyAction";

export type RequestsInboxProps = {
  requests: FriendRequestsResponse;
  onRefresh: () => void;
  defaultExpanded?: boolean;
};

export function RequestsInbox({ requests, onRefresh, defaultExpanded = false }: RequestsInboxProps) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { isBusy, error, runAction } = useBusyAction();

  const incomingCount = requests.incoming.length;
  const outgoingCount = requests.outgoing.length;
  const totalCount = incomingCount + outgoingCount;

  function handleAccept(id: string) {
    void runAction(id, async () => {
      await acceptFriendRequest(id);
      onRefresh();
    });
  }

  function handleDelete(id: string) {
    void runAction(id, async () => {
      await deleteFriendRequest(id);
      onRefresh();
    });
  }

  return (
    <Card tint>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle friend requests"
        onPress={() => setExpanded(!expanded)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: t.touch,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing.sm }}>
          <Txt variant="section">Requests</Txt>
          {incomingCount > 0 ? (
            <Badge tone="new" label={String(incomingCount)} />
          ) : totalCount > 0 ? (
            <Badge tone="neutral" label={String(totalCount)} />
          ) : null}
        </View>
        <Txt variant="small" color="link">
          {expanded ? "Hide" : "View"}
        </Txt>
      </Pressable>

      {error ? (
        <Callout tone="danger" title="Something went wrong">
          {error}
        </Callout>
      ) : null}

      {expanded ? (
        <View style={{ gap: t.spacing.md, marginTop: t.spacing.sm }}>
          {/* Incoming section */}
          <View style={{ gap: t.spacing.xs }}>
            <Txt variant="eyebrow">Incoming</Txt>
            {requests.incoming.length === 0 ? (
              <Txt variant="small" color="textMuted">
                No incoming requests
              </Txt>
            ) : (
              <View style={{ gap: t.spacing.xs }}>
                {requests.incoming.map((req) => (
                  <View
                    key={req.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: t.spacing.sm,
                      paddingVertical: t.spacing.xs,
                    }}
                  >
                    <PersonLink user={req.user} />
                    <View style={{ flexDirection: "row", gap: t.spacing.xs }}>
                      <Button
                        label="Accept"
                        variant="primary"
                        onPress={() => void handleAccept(req.id)}
                        loading={isBusy(req.id)}
                      />
                      <Button
                        label="Decline"
                        variant="ghost"
                        onPress={() => void handleDelete(req.id)}
                        loading={isBusy(req.id)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Outgoing section */}
          <View style={{ gap: t.spacing.xs }}>
            <Txt variant="eyebrow">Outgoing</Txt>
            {requests.outgoing.length === 0 ? (
              <Txt variant="small" color="textMuted">
                No outgoing requests
              </Txt>
            ) : (
              <View style={{ gap: t.spacing.xs }}>
                {requests.outgoing.map((req) => (
                  <View
                    key={req.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: t.spacing.sm,
                      paddingVertical: t.spacing.xs,
                    }}
                  >
                    <PersonLink user={req.user} />
                    <Button
                      label="Cancel"
                      variant="ghost"
                      onPress={() => void handleDelete(req.id)}
                      loading={isBusy(req.id)}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      ) : null}
    </Card>
  );
}
