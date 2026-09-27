import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { EventsListResponse, MyAvailabilityResponse, routes, EventCardPayload } from "@web/contract";
import { Badge, Card, Txt, useTheme } from "../../ui";
import { api } from "../../lib/api";
import { ScheduleDayGroup, transformScheduleItems } from "./scheduleTransform";

export function UnifiedCalendarView() {
  const theme = useTheme();
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleDayGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api(routes.myAvailability, MyAvailabilityResponse).catch(() => ({ windows: [] })),
      api(routes.events, EventsListResponse).catch(() => ({ events: [] })),
    ])
      .then(([availRes, eventsRes]) => {
        if (!cancelled) {
          const grouped = transformScheduleItems(availRes.windows, eventsRes.events);
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

  if (loading) {
    return (
      <View style={{ padding: theme.spacing.lg, alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: theme.spacing.md }}>
        <Txt color="danger">Failed to load schedule.</Txt>
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
          paddingBottom: theme.spacing.xs,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Txt variant="title">Upcoming Schedule</Txt>
        <View style={{ flexDirection: "row", gap: theme.spacing.xs, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.textMuted }} />
            <Txt variant="small" color="textMuted">Busy</Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.link }} />
            <Txt variant="small" color="link">Hangout</Txt>
          </View>
        </View>
      </View>

      {!schedule || schedule.length === 0 ? (
        <Txt color="textMuted">No upcoming busy blocks or hangouts scheduled.</Txt>
      ) : (
        schedule.map((group) => (
          <View key={group.dateKey} style={{ gap: theme.spacing.xs }}>
            <Txt variant="label" color="textMuted">
              {group.dateLabel}
            </Txt>
            {group.items.map((item) => {
              if (item.type === "busy") {
                return (
                  <View
                    key={item.id}
                    style={{
                      padding: theme.spacing.sm,
                      borderRadius: theme.radii.sm,
                      backgroundColor: theme.colors.cardBackground,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: 0.75,
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

              // Prominently highlighted Web Hangout Block
              const isConfirmed = item.status === "confirmed";
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (item.eventId) {
                      router.push(`/(main)/?eventId=${item.eventId}`);
                    }
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.9 : 1.0,
                  })}
                >
                  <Card
                    style={{
                      borderColor: theme.colors.link,
                      borderWidth: 1.5,
                      backgroundColor: isConfirmed ? theme.colors.violetSoft || "#2D1F47" : theme.colors.cardBackground,
                      padding: theme.spacing.md,
                      gap: theme.spacing.xs,
                      shadowColor: theme.colors.link,
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Txt variant="title" color="text">
                        ✨ {item.title}
                      </Txt>
                      {item.status ? (
                        <Badge label={item.status.toUpperCase()} variant={isConfirmed ? "success" : "primary"} />
                      ) : null}
                    </View>
                    <Txt variant="body" numeric color="link">
                      {item.subtitle}
                    </Txt>
                    <View style={{ marginTop: theme.spacing.xs, flexDirection: "row", justifyContent: "flex-end" }}>
                      <Txt variant="small" color="link">
                        View Event Card →
                      </Txt>
                    </View>
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
