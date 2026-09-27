// Owner: Riley — manual availability entry for users without Apple or Google Calendars (#309).
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  ManualBusyBlocksResponse,
  ManualBusyBlockItem,
  routes,
} from "@web/contract";
import { z } from "zod";
import { Button, Callout, Card, TextField, Txt, useTheme } from "../../ui";
import { api } from "../../lib/api";

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
  blocks: ManualBusyBlockItem[];
  loading?: boolean;
  error?: string | null;
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
  deletingId?: string | null;
  onSave?: () => void;
  onDeleteBlock?: (id: string) => void;
};

export function ManualAvailabilityView({
  blocks,
  loading = false,
  error = null,
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
  deletingId = null,
  onSave,
  onDeleteBlock,
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
        <View style={{ flex: 1, minWidth: 200 }}>
          <Txt variant="title">Manual Availability</Txt>
          <Txt variant="small" color="textMuted">
            Add busy times if you don&apos;t use Apple or Google Calendars.
          </Txt>
        </View>
        <Button
          label={isAdding ? "Cancel" : "+ Add busy time"}
          variant={isAdding ? "ghost" : "outline"}
          onPress={() => onToggleAdding?.()}
        />
      </View>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {isAdding ? (
        <Card>
          <Txt variant="section" color="heading">
            Add Busy Block
          </Txt>
          <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
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
          <TextField
            label="Date (YYYY-MM-DD)"
            value={dateStr}
            onChangeText={onChangeDateStr}
            placeholder="2026-10-01"
          />
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

      {loading ? (
        <ActivityIndicator size="small" />
      ) : blocks.length === 0 ? (
        <Txt color="textMuted">No manual busy times added.</Txt>
      ) : (
        blocks.map((block) => (
          <View
            key={block.id}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: theme.spacing.sm,
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.sm,
              borderColor: theme.colors.border,
              borderWidth: 1,
              opacity: 0.9,
            }}
          >
            <View style={{ flex: 1, minWidth: 140 }}>
              <Txt variant="body" color="heading">
                {formatManualDate(block.starts_at)}
              </Txt>
              <Txt variant="small" color="textMuted" numeric>
                {formatManualTimeRange(block.starts_at, block.ends_at)}
              </Txt>
            </View>
            <Button
              label="Delete"
              variant="ghost"
              onPress={() => onDeleteBlock?.(block.id)}
              loading={deletingId === block.id}
            />
          </View>
        ))
      )}
    </View>
  );
}

export function ManualAvailability({ onBlocksChanged }: { onBlocksChanged?: () => void }) {
  const [blocks, setBlocks] = useState<ManualBusyBlockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateStr, setDateStr] = useState(getTodayDateString());
  const [startTimeStr, setStartTimeStr] = useState("09:00");
  const [endTimeStr, setEndTimeStr] = useState("17:00");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const fetchBlocks = () => {
    return api(routes.manualBusyBlocks, ManualBusyBlocksResponse)
      .then((res) => {
        setBlocks(res.blocks);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load manual busy times.");
        setLoading(false);
      });
  };

  useEffect(() => {
    void fetchBlocks();
  }, []);

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
      await fetchBlocks();
      setIsAdding(false);
      onBlocksChanged?.();
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Failed to add busy time.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlock = async (id: string) => {
    setDeletingId(id);
    try {
      await api(routes.manualBusyBlock(id), z.unknown(), {
        method: "DELETE",
      });
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      onBlocksChanged?.();
    } catch (e) {
      console.error("Failed to delete busy block", e);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ManualAvailabilityView
      blocks={blocks}
      loading={loading}
      error={error}
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
      deletingId={deletingId}
      onSave={handleSave}
      onDeleteBlock={handleDeleteBlock}
    />
  );
}
