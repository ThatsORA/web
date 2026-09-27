import React from "react";
import { Pressable, View } from "react-native";
import { Txt, useTheme } from "../../ui";
import { HangoutTab } from "./feedTabs";

interface Props {
  activeTab: HangoutTab;
  onSelectTab: (tab: HangoutTab) => void;
  hasNotification?: boolean;
  pendingCount?: number;
}

const TABS: { key: HangoutTab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "past", label: "Past" },
];

export function HangoutSubTabs({ activeTab, onSelectTab, hasNotification, pendingCount }: Props) {
  const t = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: t.colors.surfaceMuted,
        borderRadius: t.radius.md,
        padding: 3,
        marginBottom: t.spacing.sm,
      }}
    >
      {TABS.map((tab) => {
        const selected = activeTab === tab.key;
        const isPendingTab = tab.key === "pending";
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelectTab(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: t.spacing.sm,
              borderRadius: t.radius.sm,
              backgroundColor: selected ? t.colors.surface : "transparent",
              opacity: pressed ? 0.75 : 1.0,
              flexDirection: "row",
              gap: 6,
            })}
          >
            <Txt
              variant="label"
              style={{
                color: selected ? t.colors.heading : t.colors.textMuted,
                fontWeight: selected ? "600" : "400",
              }}
            >
              {tab.label}
            </Txt>
            {isPendingTab && hasNotification ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.colors.lime,
                  borderWidth: 1,
                  borderColor: t.colors.background,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
