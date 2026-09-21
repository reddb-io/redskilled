import { useState, type PropsWithChildren, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { colors, density, radii, spacing, type } from "./tokens";

/**
 * Hallmark · P5 H5 E4 S5 R5 V4 · genre: modern-minimal
 * tone: technical-austere · macrostructure: Workbench
 * design-system: design.md · designed-as-app
 */

const REDDB_HORIZONTAL_ASPECT_RATIO = 509 / 128;

export function BrandMark({ size = 24 }: { size?: number }) {
  const clearspace = size * 0.25;
  return (
    <View style={{ padding: clearspace }}>
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel="RedDB"
        resizeMode="contain"
        source={require("../../vendor/design-system/marks/reddb-horizontal-inverse-h128.png")}
        style={{ height: size, width: size * REDDB_HORIZONTAL_ASPECT_RATIO }}
      />
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeading({
  actions,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  eyebrow: string;
  title?: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingText}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {title == null ? null : <Text style={styles.sectionTitle}>{title}</Text>}
        {description == null ? null : (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      {actions == null ? null : <View style={styles.sectionActions}>{actions}</View>}
    </View>
  );
}

export function ScreenHeading({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <View style={styles.screenHeading}>
      <View style={styles.screenHeadingCopy}>
        <Text accessibilityRole="header" style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenDescription}>{description}</Text>
      </View>
      {action == null ? null : <View style={styles.screenHeadingAction}>{action}</View>}
    </View>
  );
}

export type AppDestination = "dispatch" | "workers" | "hosts";

export function BottomNavigation({
  active,
  hostCount,
  labels,
  onChange,
  workerCount,
}: {
  active: AppDestination;
  hostCount: number;
  labels: Readonly<Record<AppDestination, string>>;
  onChange: (destination: AppDestination) => void;
  workerCount: number;
}) {
  const destinations: ReadonlyArray<{
    id: AppDestination;
    label: string;
    count?: number;
  }> = [
    { id: "dispatch", label: labels.dispatch },
    { id: "workers", label: labels.workers, count: workerCount },
    { id: "hosts", label: labels.hosts, count: hostCount },
  ];

  return (
    <View accessibilityRole="tablist" style={styles.navigation}>
      {destinations.map((destination) => {
        const selected = active === destination.id;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={destination.id}
            onPress={() => onChange(destination.id)}
            style={({ pressed }) => [
              styles.navigationItem,
              selected && styles.navigationItemActive,
              pressed && styles.navigationItemPressed,
            ]}
          >
            <Text numberOfLines={1} style={[
              styles.navigationLabel,
              selected && styles.navigationLabelActive,
            ]}>
              {destination.label}
            </Text>
            {destination.count == null ? null : (
              <Text style={[styles.navigationCount, selected && styles.navigationCountActive]}>
                {destination.count}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ glyph, label }: { glyph?: string; label: string }) {
  return (
    <View style={styles.pill}>
      {glyph == null ? null : <Text style={styles.pillGlyph}>{glyph}</Text>}
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  label,
  loading = false,
  state = "default",
  tone = "default",
  variant = "primary",
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  label: string;
  loading?: boolean;
  state?: "default" | "error" | "success";
  tone?: "default" | "danger";
  variant?: ButtonVariant;
}) {
  const disabled = props.disabled === true || loading;
  const [focused, setFocused] = useState(false);
  const contentColor = variant === "primary"
    ? colors.onPrimary
    : tone === "danger" ? colors.danger : colors.foreground;
  const stateGlyph = state === "error" ? "!" : state === "success" ? "✓" : null;

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        state === "error" && styles.buttonError,
        state === "success" && styles.buttonSuccess,
        focused && styles.buttonFocused,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} size="small" />
      ) : (
        <View style={styles.buttonContent}>
          {stateGlyph == null ? null : (
            <Text style={[styles.buttonStateGlyph, { color: contentColor }]}>{stateGlyph}</Text>
          )}
          <Text numberOfLines={1} style={[styles.buttonText, { color: contentColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  helper,
  invalid = false,
  label,
  ...props
}: TextInputProps & { helper?: string; invalid?: boolean; label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        placeholderTextColor={colors.mutedStrong}
        selectionColor={colors.primary}
        style={[styles.input, focused && styles.inputFocused, invalid && styles.inputInvalid, props.style]}
      />
      <Text style={[styles.fieldHelper, invalid && styles.fieldHelperInvalid]}>
        {helper ?? " "}
      </Text>
    </View>
  );
}

export function EmptyState({
  action,
  description,
  glyph,
  title,
}: {
  action?: ReactNode;
  description: string;
  glyph: string;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyGlyphBox}>
        <Text style={styles.emptyGlyph}>{glyph}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action == null ? null : <View style={styles.emptyAction}>{action}</View>}
    </View>
  );
}

export function Feedback({ children }: PropsWithChildren) {
  return (
    <View accessibilityRole="alert" style={styles.feedback}>
      <Text style={styles.feedbackGlyph}>!</Text>
      <Text style={styles.feedbackText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: spacing.hairline,
    gap: density.gapLg,
    padding: density.insetMd,
  },
  screenHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  screenHeadingCopy: { flex: 1, gap: spacing.sm },
  screenHeadingAction: { paddingTop: density.gapSm },
  screenTitle: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.display,
    fontWeight: type.weight.bold,
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  screenDescription: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    lineHeight: 21,
    maxWidth: 440,
  },
  sectionHeading: {
    alignItems: "flex-end",
    borderBottomColor: colors.border,
    borderBottomWidth: spacing.hairline,
    flexDirection: "row",
    gap: density.gapLg,
    justifyContent: "space-between",
    paddingBottom: density.insetSm,
  },
  sectionHeadingText: { flex: 1, gap: density.gapSm },
  sectionActions: { alignItems: "center", flexDirection: "row", gap: density.gapMd },
  eyebrow: {
    color: colors.muted,
    fontFamily: type.family.mono,
    fontSize: type.size.xs,
    fontWeight: type.weight.bold,
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.lg,
    fontWeight: type.weight.medium,
    letterSpacing: -0.36,
  },
  description: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    lineHeight: 21,
  },
  pill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.borderStrong,
    borderRadius: radii.full,
    borderWidth: spacing.hairline,
    flexDirection: "row",
    gap: density.gapMd,
    minHeight: density.controlHeightMd,
    paddingHorizontal: density.insetSm,
  },
  pillGlyph: {
    color: colors.foreground,
    fontFamily: type.family.mono,
    fontSize: type.size.xs,
  },
  pillText: {
    color: colors.foreground,
    fontFamily: type.family.mono,
    fontSize: 10,
    fontWeight: type.weight.bold,
    letterSpacing: 1,
  },
  button: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radii.md,
    borderWidth: spacing.hairline,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: density.insetMd,
  },
  buttonPrimary: { backgroundColor: colors.foreground },
  buttonSecondary: { backgroundColor: "transparent", borderColor: colors.borderStrong },
  buttonGhost: { alignSelf: "flex-start", backgroundColor: "transparent", minHeight: 36 },
  buttonDisabled: { opacity: 0.5 },
  buttonError: { borderColor: colors.danger },
  buttonSuccess: { borderColor: colors.foreground },
  buttonFocused: { borderColor: colors.primary },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  buttonContent: { alignItems: "center", flexDirection: "row", gap: density.gapMd },
  buttonStateGlyph: {
    fontFamily: type.family.mono,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
  },
  buttonText: {
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
    letterSpacing: 0.8,
  },
  field: { gap: density.gapMd },
  fieldLabel: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    fontWeight: type.weight.medium,
  },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: spacing.hairline,
    color: colors.foreground,
    fontFamily: type.family.mono,
    fontSize: type.size.sm,
    minHeight: 52,
    paddingHorizontal: density.insetSm,
    paddingVertical: density.gapLg,
  },
  inputInvalid: { borderColor: colors.danger },
  inputFocused: { borderColor: colors.primary },
  fieldHelper: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.xs,
    lineHeight: 18,
    minHeight: 18,
  },
  fieldHelperInvalid: { color: colors.danger },
  emptyState: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderStyle: "dashed",
    borderWidth: spacing.hairline,
    gap: density.gapLg,
    paddingHorizontal: density.insetLg,
    paddingVertical: spacing.huge,
  },
  emptyGlyphBox: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: spacing.hairline,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  emptyGlyph: {
    color: colors.muted,
    fontFamily: type.family.mono,
    fontSize: type.size.lg,
  },
  emptyTitle: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.base,
    fontWeight: type.weight.medium,
    textAlign: "center",
  },
  emptyDescription: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    lineHeight: 21,
    maxWidth: 320,
    textAlign: "center",
  },
  emptyAction: { alignSelf: "stretch", paddingTop: density.gapSm },
  feedback: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: spacing.hairline,
    flexDirection: "row",
    gap: density.gapMd,
    padding: density.insetSm,
  },
  feedbackGlyph: {
    color: colors.danger,
    fontFamily: type.family.mono,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
  },
  feedbackText: {
    color: colors.foreground,
    flex: 1,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    lineHeight: 20,
  },
  navigation: {
    backgroundColor: colors.surfaceSunken,
    borderTopColor: colors.border,
    borderTopWidth: spacing.hairline,
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    paddingTop: density.gapSm,
  },
  navigationItem: {
    alignItems: "center",
    borderTopColor: colors.surfaceSunken,
    borderTopWidth: 2,
    flex: 1,
    flexDirection: "row",
    gap: density.gapSm,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: spacing.xs,
  },
  navigationItemActive: { borderTopColor: colors.primary },
  navigationItemPressed: { opacity: 0.72 },
  navigationLabel: {
    color: colors.mutedStrong,
    fontFamily: type.family.sans,
    fontSize: type.size.xs,
    fontWeight: type.weight.medium,
  },
  navigationLabelActive: { color: colors.foreground },
  navigationCount: {
    color: colors.mutedStrong,
    fontFamily: type.family.mono,
    fontSize: 10,
  },
  navigationCountActive: { color: colors.primary },
});
