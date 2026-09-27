// Owner: Andy — labelled input: 44pt, 1px borderStrong, 2px brand ring on focus.
import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

type Props = Omit<TextInputProps, "style"> & { label?: string; error?: string | null };

export function TextField({ label, error, onFocus, onBlur, ...input }: Props) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: t.spacing.xs }}>
      {label ? (
        <Txt variant="label" color="heading">
          {label}
        </Txt>
      ) : null}
      <TextInput
        accessibilityLabel={label ?? (input.accessibilityLabel as string | undefined) ?? input.placeholder}
        placeholderTextColor={t.colors.textMuted}
        autoCapitalize="none"
        {...input}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          ...t.type.body,
          minHeight: t.touch,
          color: input.editable === false ? t.colors.textMuted : t.colors.heading,
          backgroundColor: input.editable === false ? t.colors.surfaceMuted : t.colors.surface,
          borderColor: error ? t.colors.danger : focused ? t.colors.primary : t.colors.borderStrong,
          borderWidth: focused || error ? 2 : 1,
          borderRadius: t.radius.sm,
          paddingHorizontal: t.spacing.ms,
        }}
      />
      {error ? (
        <Txt variant="small" color="danger">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}
