// Owner: Andy — labelled text input with an optional error line.
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "./useTheme";

type Props = Omit<TextInputProps, "style"> & { label: string; error?: string | null };

export function TextField({ label, error, ...input }: Props) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text style={{ color: t.colors.textMuted, fontSize: t.font.small }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.textMuted}
        autoCapitalize="none"
        {...input}
        style={{
          color: t.colors.text,
          backgroundColor: t.colors.surface,
          borderColor: error ? t.colors.danger : t.colors.border,
          borderWidth: 1,
          borderRadius: t.radius.sm,
          paddingVertical: 12,
          paddingHorizontal: t.spacing.md,
          fontSize: t.font.body,
        }}
      />
      {error ? <Text style={{ color: t.colors.danger, fontSize: t.font.small }}>{error}</Text> : null}
    </View>
  );
}
