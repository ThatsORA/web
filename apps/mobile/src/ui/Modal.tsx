// Owner: Andy — Primer modal dialog: overlay back-drop, centered or sheet content card with title & close.
import type { ReactNode } from "react";
import { Modal as RNModal, Pressable, ScrollView, View } from "react-native";
import { Button } from "./Button";
import { Txt } from "./Txt";
import { useTheme } from "./useTheme";

export type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
};

export function Modal({ visible, onClose, title, children }: ModalProps) {
  const t = useTheme();

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: t.spacing.lg,
        }}
      >
        <Pressable
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
          onPress={onClose}
        />
        <View
          style={{
            width: "100%",
            maxHeight: "85%",
            backgroundColor: t.colors.surface,
            borderColor: t.colors.border,
            borderWidth: 1,
            borderRadius: t.radius.md,
            padding: t.spacing.lg,
            gap: t.spacing.md,
          }}
        >
          {title ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Txt variant="section" color="heading">
                {title}
              </Txt>
              <Button label="Close" variant="ghost" onPress={onClose} />
            </View>
          ) : null}
          <ScrollView contentContainerStyle={{ gap: t.spacing.sm }}>{children}</ScrollView>
        </View>
      </View>
    </RNModal>
  );
}
