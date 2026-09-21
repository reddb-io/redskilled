import type { PropsWithChildren } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import {
  BottomNavigation,
  BrandMark,
  type AppDestination,
} from "../design-system/components";
import { colors, density, spacing, type } from "../design-system/tokens";
import { copy } from "./copy";

export function AppShell({
  active,
  children,
  hostCount,
  onNavigate,
  workerCount,
}: PropsWithChildren<{
  active: AppDestination;
  hostCount: number;
  onNavigate: (destination: AppDestination) => void;
  workerCount: number;
}>) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.safeArea}
      >
        <View style={styles.chrome}>
          <BrandMark size={18} />
          <View style={styles.productName}>
            <Text numberOfLines={1} style={styles.title}>{copy.app.title}</Text>
            <Text numberOfLines={1} style={styles.mode}>{copy.app.subtitle}</Text>
          </View>
          <Text style={styles.platform}>{copy.app.platform}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.page}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        <BottomNavigation
          active={active}
          hostCount={hostCount}
          labels={copy.app.navigation}
          onChange={onNavigate}
          workerCount={workerCount}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  chrome: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: spacing.hairline,
    flexDirection: "row",
    minHeight: 60,
    paddingHorizontal: spacing.sm,
  },
  productName: { flex: 1, gap: density.gapSm },
  title: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
    letterSpacing: -0.2,
  },
  mode: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.xs,
  },
  platform: {
    color: colors.mutedStrong,
    fontFamily: type.family.mono,
    fontSize: 9,
    fontWeight: type.weight.bold,
    letterSpacing: 1.2,
  },
  page: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
});
