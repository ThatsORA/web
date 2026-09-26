// Owner: Ojas — add an expense to a confirmed event (#20, #81). Andy mounts it on the confirmed card.
import { CreateExpenseRequest, routes } from "@web/contract";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api } from "../../lib/api";
import { Button, Callout, Chip, TextField, Txt, useTheme } from "../../ui";
import { parseCents, remainingLine } from "./amounts";

// The contract defines no response schema for POST /expenses, and nothing here reads it.
const CreateExpenseResponse = z.unknown();

type Props = { eventId: string; attendees: { id: string; username: string; display_name?: string }[]; onSaved?: () => void };

export function ExpenseForm({ eventId, attendees, onSaved }: Props) {
  const t = useTheme();
  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [custom, setCustom] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const totalCents = parseCents(total);
  // Blank custom inputs mean "owes nothing"; anything else must parse.
  const entered = attendees.flatMap((a) => (amounts[a.id]?.trim() ? [{ user_id: a.id, amount_cents: parseCents(amounts[a.id]!) }] : []));
  const allParse = entered.every((s) => s.amount_cents !== null);
  const remaining = remainingLine(totalCents ?? 0, entered.map((s) => s.amount_cents ?? 0));
  const valid = !!description.trim() && !!totalCents && (!custom || (allParse && remaining.done));

  async function save() {
    setSaving(true);
    setFailed(false);
    try {
      const body = CreateExpenseRequest.parse({ total_cents: totalCents, description: description.trim(), splits: custom ? entered : undefined });
      await api(routes.expenses(eventId), CreateExpenseResponse, { method: "POST", body });
      setDescription("");
      setTotal("");
      setAmounts({});
      onSaved?.();
    } catch (e) {
      console.warn("POST /expenses failed", e);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: t.spacing.md }}>
      <TextField label="What for" value={description} onChangeText={setDescription} maxLength={120} autoCapitalize="sentences" />
      <TextField
        label="Total ($)"
        value={total}
        onChangeText={setTotal}
        keyboardType="decimal-pad"
        error={total && totalCents === null ? "Enter an amount like 24.50" : null}
      />
      <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
        <Chip label="Split equally" selected={!custom} onPress={() => setCustom(false)} />
        <Chip label="Custom" selected={custom} onPress={() => setCustom(true)} />
      </View>
      {custom ? (
        <View style={{ gap: t.spacing.sm }}>
          {attendees.map((a) => (
            <TextField
              key={a.id}
              label={a.display_name ?? a.username}
              value={amounts[a.id] ?? ""}
              onChangeText={(v) => setAmounts((m) => ({ ...m, [a.id]: v }))}
              keyboardType="decimal-pad"
              error={amounts[a.id]?.trim() && parseCents(amounts[a.id]!) === null ? "Enter an amount like 8.25" : null}
            />
          ))}
          {totalCents ? (
            <Txt variant="label" color={remaining.done ? "success" : "textMuted"} numeric>
              {remaining.text}
            </Txt>
          ) : null}
        </View>
      ) : null}
      <Button label="Add expense" onPress={save} loading={saving} disabled={!valid} />
      {failed ? (
        <Callout tone="danger" title="Couldn't add the expense">
          Check your connection and try again.
        </Callout>
      ) : null}
    </View>
  );
}
