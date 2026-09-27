// Owner: Riley — manual availability entry for users without Apple or Google Calendars (#309).
import React, { useState } from "react";
import { View } from "react-native";
import {
  ManualBusyBlockItem,
  routes,
} from "@web/contract";
import { Button, Callout, Card, TextField, Txt, useTheme } from "../../ui";
import { api } from "../../lib/api";

export const TIME_PRESETS = [
  { label: "Morning 9am-12pm", start: "09:00", end: "12:00" },
  { label: "Afternoon 12pm-5pm", start: "12:00", end: "17:00" },
  { label: "Evening 5pm-9pm", start: "17:00", end: "21:00" },
  { label: "Full Day 9am-5pm", start: "09:00", end: "17:00" },
] as const;

export function parseDateTime(dateStr: string, timeStr: string): Date | null {
  const trimmedDate = dateStr.trim();
  const trimmedTime = timeStr.trim();
  if (!trimmedDate || !trimmedTime) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedDate);
  if (!dateMatch) return null;
  const year = parseInt(dateMatch[1]!, 10);
  const month = parseInt(dateMatch[2]!, 10) - 1;
  const day = parseInt(dateMatch[3]!, 10);

  const timeMatch = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(trimmedTime);
  if (!timeMatch) return null;

  let hours = parseInt(timeMatch[1]!, 10);
  const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const meridian = timeMatch[3]?.toLowerCase();

  if (meridian === "pm" && hours < 12) hours += 12;
  if (meridian === "am" && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const d = new Date(year, month, day, hours, minutes, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatManualDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatManualTimeRange(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const sStr = s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const eStr = e.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${sStr} – ${eStr}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTomorrowDateString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ManualAvailabilityViewProps = {
  isAdding?: boolean;
  onToggleAdding?: () => void;
  dateStr?: string;
  onChangeDateStr?: (v: string) => void;
  startTimeStr?: string;
  onChangeStartTimeStr?: (v: string) => void;
  endTimeStr?: string;
  onChangeEndTimeStr?: (v: string) => void;
  validationError?: string | null;
  saving?: boolean;
  onSave?: () => void;
  error?: string | null;
  blocks?: ManualBusyBlockItem[];
  loading?: boolean;
  deletingId?: string | null;
  onDeleteBlock?: (id: string) => void;
};

export function ManualAvailabilityView({
  isAdding = false,
  onToggleAdding,
  dateStr = getTodayDateString(),
  onChangeDateStr,
  startTimeStr = "09:00",
  onChangeStartTimeStr,
  endTimeStr = "17:00",
  onChangeEndTimeStr,
  validationError = null,
  saving = false,
  onSave,
  error = null,
}: ManualAvailabilityViewProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: theme.spacing.xs,
        }}
      >
        <Button
          label={isAdding ? "Cancel" : "+ Manually add busy time"}
          variant={isAdding ? "ghost" : "outline"}
          size="sm"
          onPress={() => onToggleAdding?.()}
        />
      </View>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {isAdding ? (
        <Card>
          <Txt variant="section" color="heading">
            Add Busy Block
          </Txt>
          <View style={{ gap: theme.spacing.xs }}>
            <Txt variant="label" color="textMuted">
              Date Presets
            </Txt>
            <View style={{ flexDirection: "row", gap: theme.spacing.xs, flexWrap: "wrap" }}>
              <Button
                label="Today"
                variant={dateStr === getTodayDateString() ? "primary" : "secondary"}
                onPress={() => onChangeDateStr?.(getTodayDateString())}
              />
              <Button
                label="Tomorrow"
                variant={dateStr === getTomorrowDateString() ? "primary" : "secondary"}
                onPress={() => onChangeDateStr?.(getTomorrowDateString())}
              />
            </View>
          </View>
          <TextField
            label="Date (YYYY-MM-DD)"
            value={dateStr}
            onChangeText={onChangeDateStr}
            placeholder="2026-10-01"
          />
          <View style={{ gap: theme.spacing.xs }}>
            <Txt variant="label" color="textMuted">
              Time Presets
            </Txt>
            <View style={{ flexDirection: "row", gap: theme.spacing.xs, flexWrap: "wrap" }}>
              {TIME_PRESETS.map((preset) => {
                const isSelected = startTimeStr === preset.start && endTimeStr === preset.end;
                return (
                  <Button
                    key={preset.label}
                    label={preset.label}
                    variant={isSelected ? "primary" : "secondary"}
                    onPress={() => {
                      onChangeStartTimeStr?.(preset.start);
                      onChangeEndTimeStr?.(preset.end);
                    }}
                  />
                );
              })}
            </View>
          </View>
          <TextField
            label="Start Time"
            value={startTimeStr}
            onChangeText={onChangeStartTimeStr}
            placeholder="09:00 or 9:00 AM"
          />
          <TextField
            label="End Time"
            value={endTimeStr}
            onChangeText={onChangeEndTimeStr}
            placeholder="17:00 or 5:00 PM"
          />
          {validationError ? <Callout tone="danger">{validationError}</Callout> : null}
          <Button
            label="Save Busy Time"
            onPress={() => onSave?.()}
            loading={saving}
          />
        </Card>
      ) : null}
    </View>
  );
}

export function ManualAvailability({ onBlocksChanged }: { onBlocksChanged?: () => void }) {
  const [dateStr, setDateStr] = useState(getTodayDateString());
  const [startTimeStr, setStartTimeStr] = useState("09:00");
  const [endTimeStr, setEndTimeStr] = useState("17:00");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const handleSave = async () => {
    setValidationError(null);
    const startD = parseDateTime(dateStr, startTimeStr);
    const endD = parseDateTime(dateStr, endTimeStr);

    if (!startD || !endD) {
      setValidationError("Please enter valid date (YYYY-MM-DD) and times (e.g. 09:00, 5:00 PM).");
      return;
    }

    if (startD.getTime() >= endD.getTime()) {
      setValidationError("Start time must be before end time.");
      return;
    }

    setSaving(true);
    try {
      await api(routes.manualBusyBlocks, ManualBusyBlockItem, {
        method: "POST",
        body: { starts_at: startD.toISOString(), ends_at: endD.toISOString() },
      });
      setIsAdding(false);
      onBlocksChanged?.();
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Failed to add busy time.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManualAvailabilityView
      isAdding={isAdding}
      onToggleAdding={() => {
        setIsAdding(!isAdding);
        setValidationError(null);
      }}
      dateStr={dateStr}
      onChangeDateStr={setDateStr}
      startTimeStr={startTimeStr}
      onChangeStartTimeStr={setStartTimeStr}
      endTimeStr={endTimeStr}
      onChangeEndTimeStr={setEndTimeStr}
      validationError={validationError}
      saving={saving}
      onSave={handleSave}
    />
  );
}
