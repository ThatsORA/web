import React, { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { EventsListResponse, MyAvailabilityResponse, routes } from "@web/contract";
import { z } from "zod";
import { Badge, Button, Card, Txt, useTheme } from "../../ui";
import { api } from "../../lib/api";
import { ScheduleDayGroup, transformScheduleItems } from "./scheduleTransform";

export type UnifiedScheduleViewProps = {
  schedule: ScheduleDayGroup[] | null;
  loading?: boolean;
  error?: boolean;
  onSelectEvent?: (eventId: string) => void;
  onDeleteBusyBlock?: (blockId: string) => void;
  deletingBlockId?: string | null;
  /** Buttons shown right-aligned under the header divider (sync, add busy time). */
  actions?: ReactNode;
};

export function UnifiedScheduleView({
  schedule,
  loading = false,
  error = false,
  onSelectEvent,
  onDeleteBusyBlock,
  deletingBlockId,
  actions,
}: UnifiedScheduleViewProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={{ padding: theme.spacing.lg, alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
        <Txt color="danger">Failed to load schedule.</Txt>
        {actions ? <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: theme.spacing.sm }}>{actions}</View> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {/* Legend Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: theme.spacing.xs,
          paddingBottom: theme.spacing.xs,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Txt variant="section">Schedule</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primarySofter,
                borderWidth: 1,
                borderColor: theme.colors.primarySoft,
              }}
            />
            <Txt variant="small" color="textMuted">Free</Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.surfaceMuted,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: 0.6,
              }}
            />
            <Txt variant="small" color="textMuted">Busy</Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primary,
              }}
            />
            <Txt variant="small" color="link">Hangout</Txt>
          </View>
        </View>
      </View>

      {actions ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {actions}
        </View>
      ) : null}

      {!schedule || schedule.length === 0 ? (
        <Txt color="textMuted">No upcoming free windows, busy blocks or hangouts scheduled.</Txt>
      ) : (
        schedule.map((group) => (
          <View key={group.dateKey} style={{ gap: theme.spacing.xs }}>
            <Txt variant="label" color="textMuted">
              {group.dateLabel}
            </Txt>
            {group.items.map((item) => {
              if (item.type === "free") {
                return (
                  <View
                    key={item.id}
                    style={{
                      padding: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                      backgroundColor: theme.colors.primarySofter,
                      borderWidth: 1,
                      borderColor: theme.colors.primarySoft,
                    }}
                  >
                    <Txt variant="body" color="textMuted">
                      {item.title}
                    </Txt>
                    <Txt variant="small" color="textMuted" numeric>
                      {item.subtitle}
                    </Txt>
                  </View>
                );
              }

              if (item.type === "busy") {
                return (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                      backgroundColor: theme.colors.surfaceMuted,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: 0.6,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" color="textMuted">
                        {item.title}
                      </Txt>
                      <Txt variant="small" color="textMuted" numeric>
                        {item.subtitle}
                      </Txt>
                    </View>
                    {item.blockId && onDeleteBusyBlock ? (
                      <Button
                        label="Delete"
                        variant="ghost"
                        size="sm"
                        onPress={() => onDeleteBusyBlock(item.blockId!)}
                        loading={deletingBlockId === item.blockId}
                      />
                    ) : null}
                  </View>
                );
              }

              // Prominently highlighted Web Hangout Block
              const isConfirmed = item.status === "confirmed";
              const badgeTone = isConfirmed ? "success" : item.status === "voting" ? "info" : "neutral";
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (item.eventId && onSelectEvent) {
                      onSelectEvent(item.eventId);
                    }
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.8 : 1.0,
                  })}
                >
                  <Card tint={!isConfirmed} brand={isConfirmed}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: theme.spacing.xs,
                      }}
                    >
                      <Txt
                        variant="label"
                        style={{
                          color: isConfirmed ? theme.colors.onPrimary : theme.colors.heading,
                          flexShrink: 1,
                        }}
                      >
                        ✨ {item.title}
                      </Txt>
                      {item.status ? (
                        <Badge label={item.status.toUpperCase()} tone={isConfirmed ? "new" : badgeTone} />
                      ) : null}
                    </View>
                    <Txt
                      variant="body"
                      numeric
                      style={{
                        color: isConfirmed ? theme.colors.onPrimary : theme.colors.primary,
                        flexShrink: 1,
                      }}
                    >
                      {item.subtitle}
                    </Txt>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

export function UnifiedCalendarView({ onScheduleChanged, actions }: { onScheduleChanged?: () => void; actions?: ReactNode }) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleDayGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);

  const fetchSchedule = () => {
    return Promise.all([
      api(routes.myAvailability, MyAvailabilityResponse).catch(() => ({ windows: [], busy_blocks: [] })),
      api(routes.events, EventsListResponse).catch(() => ({ events: [] })),
    ])
      .then(([availRes, eventsRes]) => {
        const grouped = transformScheduleItems(availRes.windows, eventsRes.events, availRes.busy_blocks);
        setSchedule(grouped);
        setLoading(false);
      })
      .catch((e) => {
        console.error("UnifiedCalendarView load error:", e);
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api(routes.myAvailability, MyAvailabilityResponse).catch(() => ({ windows: [], busy_blocks: [] })),
      api(routes.events, EventsListResponse).catch(() => ({ events: [] })),
    ])
      .then(([availRes, eventsRes]) => {
        if (!cancelled) {
          const grouped = transformScheduleItems(availRes.windows, eventsRes.events, availRes.busy_blocks);
          setSchedule(grouped);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("UnifiedCalendarView load error:", e);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDeleteBusyBlock = async (blockId: string) => {
    setDeletingBlockId(blockId);
    try {
      await api(routes.manualBusyBlock(blockId), z.unknown(), {
        method: "DELETE",
      });
      await fetchSchedule();
      onScheduleChanged?.();
    } catch (e) {
      console.error("Failed to delete busy block", e);
    } finally {
      setDeletingBlockId(null);
    }
  };

  return (
    <UnifiedScheduleView
      schedule={schedule}
      loading={loading}
      error={error}
      onSelectEvent={(eventId) => {
        router.push({ pathname: "/", params: { eventId } });
      }}
      onDeleteBusyBlock={handleDeleteBusyBlock}
      deletingBlockId={deletingBlockId}
      actions={actions}
    />
  );
}
