// Owner: Riley — manual availability entry for users without Apple or Google Calendars (#309).
import React, { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { getCalendars } from "expo-localization";
import { ManualBusyBlockItem, routes } from "@web/contract";
import { Button, Callout, Modal, Txt, useTheme } from "../../ui";
import { api } from "../../lib/api";

/** The day from `day` at the hour and minute of `time`, in local time. */
export function combineDayAndTime(day: Date, time: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes(), 0, 0);
}

/** Today at `hour`:00 local time. */
export function todayAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Label for a picker value. Times follow the phone's 12/24-hour setting; dates read like "Thu, Oct 1". */
export function formatPickerValue(value: Date, mode: "date" | "time", uses24hourClock: boolean): string {
  return mode === "date"
    ? value.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
    : value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !uses24hourClock });
}

/** Busy block bounds for the chosen day, or the reason they can't be saved. */
export function busyBlockRange(day: Date, start: Date, end: Date): { startsAt: Date; endsAt: Date } | { error: string } {
  const startsAt = combineDayAndTime(day, start);
  const endsAt = combineDayAndTime(day, end);
  if (startsAt.getTime() >= endsAt.getTime()) return { error: "Start time must be before end time." };
  return { startsAt, endsAt };
}

const uses24hourClock = () => getCalendars()[0]?.uses24hourClock === true;

/** iOS shows its native compact picker (tap to open the calendar or clock); Android opens its native dialog from a button. */
function PickerField({ label, mode, value, onChange }: {
  label: string;
  mode: "date" | "time";
  value: Date;
  onChange: (value: Date) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: theme.spacing.sm }}>
      <Txt variant="label">{label}</Txt>
      {Platform.OS === "ios" ? (
        <DateTimePicker value={value} mode={mode} display="compact" onValueChange={(_, date) => onChange(date)} />
      ) : (
        <Button
          label={formatPickerValue(value, mode, uses24hourClock())}
          variant="outline"
          size="sm"
          onPress={() => DateTimePickerAndroid.open({ value, mode, onValueChange: (_, date) => onChange(date) })}
        />
      )}
    </View>
  );
}

export type ManualAvailabilityViewProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  day: Date;
  onChangeDay: (v: Date) => void;
  start: Date;
  onChangeStart: (v: Date) => void;
  end: Date;
  onChangeEnd: (v: Date) => void;
  validationError?: string | null;
  saving?: boolean;
  onSave: () => void;
};

export function ManualAvailabilityView({
  open,
  onOpen,
  onClose,
  day,
  onChangeDay,
  start,
  onChangeStart,
  end,
  onChangeEnd,
  validationError = null,
  saving = false,
  onSave,
}: ManualAvailabilityViewProps) {
  return (
    <View style={{ flexDirection: "row" }}>
      <Button label="+ Manually add busy time" variant="outline" size="sm" onPress={onOpen} />
      <Modal visible={open} onClose={onClose} title="Add busy time">
        <PickerField label="Date" mode="date" value={day} onChange={onChangeDay} />
        <PickerField label="Start" mode="time" value={start} onChange={onChangeStart} />
        <PickerField label="End" mode="time" value={end} onChange={onChangeEnd} />
        {validationError ? <Callout tone="danger">{validationError}</Callout> : null}
        <Button label="Save busy time" onPress={onSave} loading={saving} />
      </Modal>
    </View>
  );
}

export function ManualAvailability({ onBlocksChanged }: { onBlocksChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => new Date());
  const [start, setStart] = useState(() => todayAt(9));
  const [end, setEnd] = useState(() => todayAt(17));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const range = busyBlockRange(day, start, end);
    if ("error" in range) {
      setValidationError(range.error);
      return;
    }
    setValidationError(null);
    setSaving(true);
    try {
      await api(routes.manualBusyBlocks, ManualBusyBlockItem, {
        method: "POST",
        body: { starts_at: range.startsAt.toISOString(), ends_at: range.endsAt.toISOString() },
      });
      setOpen(false);
      onBlocksChanged?.();
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Failed to add busy time.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManualAvailabilityView
      open={open}
      onOpen={() => {
        setValidationError(null);
        setOpen(true);
      }}
      onClose={() => setOpen(false)}
      day={day}
      onChangeDay={setDay}
      start={start}
      onChangeStart={setStart}
      end={end}
      onChangeEnd={setEnd}
      validationError={validationError}
      saving={saving}
      onSave={() => void handleSave()}
    />
  );
}
