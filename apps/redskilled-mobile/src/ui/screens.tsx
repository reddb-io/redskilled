import { CameraView, type BarcodeScanningResult } from "expo-camera";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { RedskilledLinkPairedHost } from "@reddb-io/red-skills-link-protocol/protocol";

import {
  Button,
  EmptyState,
  Feedback,
  Field,
  Pill,
  ScreenHeading,
  type AppDestination,
} from "../design-system/components";
import { colors, density, radii, spacing, type } from "../design-system/tokens";
import type { FleetHostView, FleetWorkerRow } from "../domain/host-fleet";
import { copy } from "./copy";

interface ParsedIssue {
  readonly owner: string;
  readonly repository: string;
  readonly ticket: number;
}

interface WorkerListProps {
  readonly rows: readonly FleetWorkerRow[];
  readonly onStop: (row: FleetWorkerRow) => void;
}

function WorkerList({ onStop, rows }: WorkerListProps) {
  return (
    <View style={styles.listSurface}>
      {rows.map((worker, index) => (
        <View
          key={`${worker.hostId}:${worker.workerId}`}
          style={[styles.workerRow, index > 0 && styles.rowDivider]}
        >
          <View style={styles.workerSignal}>
            <Text style={styles.workerSignalText}>{worker.pending === true ? "○" : "●"}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {worker.repository}{worker.ticket == null ? "" : ` #${worker.ticket}`}
            </Text>
            <Text numberOfLines={1} style={styles.rowMetadata}>
              {worker.hostName} · {worker.workerId}
            </Text>
            <Text style={styles.liveState}>
              {worker.pending === true
                ? copy.workers.pending
                : [
                  (worker.phase ?? copy.workers.running).toUpperCase(),
                  worker.heartbeatAgeMs == null
                    ? null
                    : copy.workers.heartbeat(Math.round(worker.heartbeatAgeMs / 1000)),
                ].filter((part) => part != null).join(" · ")}
            </Text>
          </View>
          <Button
            label={copy.workers.stop}
            onPress={() => onStop(worker)}
            tone="danger"
            variant="ghost"
          />
        </View>
      ))}
    </View>
  );
}

export function DispatchScreen({
  activeHost,
  canDispatch,
  isDispatching,
  issue,
  issueUrl,
  onDispatch,
  onIssueUrlChange,
  onNavigate,
  onStopWorker,
  workers,
}: {
  activeHost: RedskilledLinkPairedHost | null;
  canDispatch: boolean;
  isDispatching: boolean;
  issue: ParsedIssue | null;
  issueUrl: string;
  onDispatch: () => void;
  onIssueUrlChange: (value: string) => void;
  onNavigate: (destination: AppDestination) => void;
  onStopWorker: (row: FleetWorkerRow) => void;
  workers: readonly FleetWorkerRow[];
}) {
  const issueInvalid = issueUrl.length > 0 && issue == null;
  return (
    <>
      <ScreenHeading description={copy.dispatch.description} title={copy.dispatch.title} />

      <Pressable
        accessibilityLabel={activeHost == null ? copy.dispatch.chooseTarget : copy.dispatch.changeTarget}
        accessibilityRole="button"
        onPress={() => onNavigate("hosts")}
        style={({ pressed }) => [styles.targetRail, pressed && styles.pressed]}
      >
        <View style={styles.targetCopy}>
          <Text style={styles.microLabel}>{copy.dispatch.targetLabel}</Text>
          <Text numberOfLines={1} style={styles.targetName}>
            {activeHost?.host_name ?? copy.dispatch.noTarget}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.inlineAction}>
          {activeHost == null ? copy.dispatch.chooseTarget : copy.dispatch.changeTarget}
        </Text>
      </Pressable>

      <View style={styles.actionSurface}>
        <Field
          autoCapitalize="none"
          autoCorrect={false}
          helper={issueInvalid ? copy.dispatch.invalidIssue : undefined}
          invalid={issueInvalid}
          keyboardType="url"
          label={copy.dispatch.issueLabel}
          onChangeText={onIssueUrlChange}
          onSubmitEditing={() => {
            if (canDispatch) onDispatch();
          }}
          placeholder={copy.dispatch.issuePlaceholder}
          returnKeyType="go"
          value={issueUrl}
        />
        {issue == null ? null : (
          <View style={styles.issueProof}>
            <Text numberOfLines={1} style={styles.issueRepository}>
              {issue.owner}/{issue.repository}
            </Text>
            <Text style={styles.issueNumber}>#{issue.ticket}</Text>
          </View>
        )}
        <Button
          disabled={!canDispatch}
          label={copy.dispatch.action}
          loading={isDispatching}
          onPress={onDispatch}
        />
      </View>

      <View style={styles.subsection}>
        <View style={styles.subsectionHeading}>
          <View style={styles.subsectionCopy}>
            <Text style={styles.subsectionTitle}>{copy.dispatch.activeTitle}</Text>
            <Text style={styles.subsectionDescription}>{copy.dispatch.activeDescription}</Text>
          </View>
          {workers.length === 0 ? null : (
            <Button
              label={copy.dispatch.viewWorkers}
              onPress={() => onNavigate("workers")}
              variant="ghost"
            />
          )}
        </View>
        {workers.length === 0 ? (
          <View style={styles.quietEmpty}>
            <Text style={styles.quietEmptyText}>{copy.workers.emptyDescription}</Text>
          </View>
        ) : (
          <WorkerList onStop={onStopWorker} rows={workers.slice(0, 2)} />
        )}
      </View>
    </>
  );
}

export function WorkersScreen({
  onNavigate,
  onStopWorker,
  workers,
}: {
  onNavigate: (destination: AppDestination) => void;
  onStopWorker: (row: FleetWorkerRow) => void;
  workers: readonly FleetWorkerRow[];
}) {
  return (
    <>
      <ScreenHeading
        action={<Pill label={copy.workers.count(workers.length)} />}
        description={copy.workers.description}
        title={copy.workers.title}
      />
      {workers.length === 0 ? (
        <EmptyState
          action={(
            <Button
              label={copy.workers.dispatchAction}
              onPress={() => onNavigate("dispatch")}
            />
          )}
          description={copy.workers.emptyDescription}
          glyph="○"
          title={copy.workers.emptyTitle}
        />
      ) : (
        <WorkerList onStop={onStopWorker} rows={workers} />
      )}
    </>
  );
}

function HostStatus({ status }: { status: FleetHostView["status"] }) {
  const danger = status === "unreachable";
  const active = status === "online";
  return (
    <View style={styles.status}>
      <Text style={[
        styles.statusGlyph,
        active && styles.statusGlyphActive,
        danger && styles.statusGlyphDanger,
      ]}>
        {danger ? "×" : active ? "●" : "○"}
      </Text>
      <Text style={styles.statusText}>{copy.host.status[status]}</Text>
    </View>
  );
}

function PairingPanel({
  cameraPermission,
  isPairing,
  onAllowCamera,
  onCancel,
  onPair,
  onPairingCodeChange,
  onScan,
  onScannerOpenChange,
  pairingCode,
  scannerOpen,
}: {
  cameraPermission: { granted: boolean; canAskAgain: boolean } | null;
  isPairing: boolean;
  onAllowCamera: () => void;
  onCancel?: () => void;
  onPair: () => void;
  onPairingCodeChange: (value: string) => void;
  onScan: (result: BarcodeScanningResult) => void;
  onScannerOpenChange: (open: boolean) => void;
  pairingCode: string;
  scannerOpen: boolean;
}) {
  let scanner: ReactNode = null;
  if (scannerOpen && cameraPermission == null) {
    scanner = (
      <View accessibilityLabel={copy.host.cameraLoading} style={styles.cameraMessage}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.cameraCopy}>{copy.host.cameraLoading}</Text>
      </View>
    );
  } else if (scannerOpen && !cameraPermission?.granted) {
    scanner = (
      <View style={styles.cameraMessage}>
        <Text style={styles.cameraCopy}>{copy.host.cameraPermission}</Text>
        {cameraPermission?.canAskAgain ? (
          <Button label={copy.host.cameraAllow} onPress={onAllowCamera} />
        ) : (
          <Feedback>{copy.host.cameraUnavailable}</Feedback>
        )}
        <Button label={copy.host.cameraCancel} onPress={() => onScannerOpenChange(false)} variant="ghost" />
      </View>
    );
  } else if (scannerOpen) {
    scanner = (
      <View style={styles.cameraPanel}>
        <View style={styles.cameraFrame}>
          <CameraView
            accessibilityLabel={copy.host.cameraLabel}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            facing="back"
            onBarcodeScanned={onScan}
            style={styles.camera}
          />
        </View>
        <Text style={styles.cameraCopy}>{copy.host.cameraHint}</Text>
        <Button label={copy.host.cameraCancel} onPress={() => onScannerOpenChange(false)} variant="ghost" />
      </View>
    );
  }

  return (
    <View style={styles.pairingSurface}>
      <View style={styles.pairingIntro}>
        <Text style={styles.pairingTitle}>{copy.host.emptyTitle}</Text>
        <Text style={styles.pairingDescription}>{copy.host.emptyDescription}</Text>
      </View>
      <Button
        label={copy.host.scanAction}
        onPress={() => onScannerOpenChange(true)}
        variant="secondary"
      />
      {scanner}
      <View style={styles.orDivider}>
        <View style={styles.orRule} />
        <Text style={styles.orText}>{copy.host.or}</Text>
        <View style={styles.orRule} />
      </View>
      <Field
        autoCapitalize="none"
        autoCorrect={false}
        label={copy.host.invitationLabel}
        onChangeText={onPairingCodeChange}
        placeholder={copy.host.invitationPlaceholder}
        value={pairingCode}
      />
      <Button
        disabled={pairingCode.trim() === ""}
        label={copy.host.pairAction}
        loading={isPairing}
        onPress={onPair}
      />
      {onCancel == null ? null : (
        <Button label={copy.host.addCancel} onPress={onCancel} variant="ghost" />
      )}
    </View>
  );
}

export function HostsScreen({
  activeHostId,
  addingHost,
  cameraPermission,
  hostViews,
  isPairing,
  onAddHost,
  onAllowCamera,
  onCancelAdd,
  onPair,
  onPairingCodeChange,
  onScan,
  onScannerOpenChange,
  onSelectHost,
  onUnpairHost,
  pairingCode,
  scannerOpen,
}: {
  activeHostId: string | null;
  addingHost: boolean;
  cameraPermission: { granted: boolean; canAskAgain: boolean } | null;
  hostViews: readonly FleetHostView[];
  isPairing: boolean;
  onAddHost: () => void;
  onAllowCamera: () => void;
  onCancelAdd: () => void;
  onPair: () => void;
  onPairingCodeChange: (value: string) => void;
  onScan: (result: BarcodeScanningResult) => void;
  onScannerOpenChange: (open: boolean) => void;
  onSelectHost: (hostId: string) => void;
  onUnpairHost: (hostId: string) => void;
  pairingCode: string;
  scannerOpen: boolean;
}) {
  const showPairing = hostViews.length === 0 || addingHost;
  return (
    <>
      <ScreenHeading
        action={hostViews.length === 0 || addingHost ? undefined : (
          <Button label={copy.host.add} onPress={onAddHost} variant="secondary" />
        )}
        description={copy.host.description}
        title={copy.host.title}
      />

      {hostViews.length === 0 ? null : (
        <View style={styles.hostList}>
          {hostViews.map((host, index) => {
            const selected = activeHostId === host.hostId;
            return (
              <View key={host.hostId} style={[styles.hostRow, index > 0 && styles.rowDivider]}>
                <Pressable
                  accessibilityLabel={copy.host.selectLabel(host.hostName)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelectHost(host.hostId)}
                  style={({ pressed }) => [styles.hostSelect, pressed && styles.pressed]}
                >
                  <View style={styles.hostMonogram}>
                    <Text style={styles.hostMonogramText}>H</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.hostNameRow}>
                      <Text numberOfLines={1} style={styles.rowTitle}>{host.hostName}</Text>
                      {selected ? <Text style={styles.selectedLabel}>{copy.host.selected}</Text> : null}
                    </View>
                    <Text style={styles.rowMetadata}>
                      {host.daemonVersion == null
                        ? copy.host.pairedDescription
                        : `${copy.host.daemonVersion(host.daemonVersion)} · ${copy.host.workerCount(host.workerCount)}`}
                    </Text>
                    {host.failure == null || host.status === "online" ? null : (
                      <Text style={styles.hostFailure}>{copy.errors.state(host.failure)}</Text>
                    )}
                    <HostStatus status={host.status} />
                  </View>
                </Pressable>
                <Button
                  label={copy.host.unpair}
                  onPress={() => onUnpairHost(host.hostId)}
                  tone="danger"
                  variant="ghost"
                />
              </View>
            );
          })}
        </View>
      )}

      {showPairing ? (
        <PairingPanel
          cameraPermission={cameraPermission}
          isPairing={isPairing}
          onAllowCamera={onAllowCamera}
          onCancel={hostViews.length === 0 ? undefined : onCancelAdd}
          onPair={onPair}
          onPairingCodeChange={onPairingCodeChange}
          onScan={onScan}
          onScannerOpenChange={onScannerOpenChange}
          pairingCode={pairingCode}
          scannerOpen={scannerOpen}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  actionSurface: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderWidth: spacing.hairline,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  targetRail: {
    alignItems: "center",
    borderBottomColor: colors.borderStrong,
    borderBottomWidth: spacing.hairline,
    flexDirection: "row",
    gap: spacing.lg,
    minHeight: 60,
    paddingVertical: spacing.sm,
  },
  targetCopy: { flex: 1, gap: density.gapSm },
  microLabel: {
    color: colors.mutedStrong,
    fontFamily: type.family.mono,
    fontSize: 9,
    fontWeight: type.weight.bold,
    letterSpacing: 1.1,
  },
  targetName: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.base,
    fontWeight: type.weight.medium,
  },
  inlineAction: {
    color: colors.primary,
    fontFamily: type.family.mono,
    fontSize: 10,
    fontWeight: type.weight.bold,
    letterSpacing: 0.8,
  },
  pressed: { opacity: 0.72 },
  issueProof: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: spacing.hairline,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  issueRepository: {
    color: colors.foreground,
    flex: 1,
    fontFamily: type.family.mono,
    fontSize: type.size.xs,
  },
  issueNumber: {
    color: colors.primary,
    fontFamily: type.family.mono,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
  },
  subsection: { gap: spacing.md, paddingTop: spacing.sm },
  subsectionHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  subsectionCopy: { flex: 1, gap: density.gapSm },
  subsectionTitle: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.lg,
    fontWeight: type.weight.medium,
  },
  subsectionDescription: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.xs,
    lineHeight: 18,
  },
  quietEmpty: {
    borderBottomColor: colors.border,
    borderBottomWidth: spacing.hairline,
    paddingVertical: spacing.xl,
  },
  quietEmptyText: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    lineHeight: 21,
  },
  listSurface: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: spacing.hairline,
    overflow: "hidden",
  },
  workerRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 82,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivider: { borderTopColor: colors.border, borderTopWidth: spacing.hairline },
  workerSignal: { alignItems: "center", justifyContent: "center", width: 24 },
  workerSignalText: {
    color: colors.primary,
    fontFamily: type.family.mono,
    fontSize: type.size.xs,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    fontWeight: type.weight.medium,
  },
  rowMetadata: {
    color: colors.muted,
    fontFamily: type.family.mono,
    fontSize: 10,
    marginTop: density.gapSm,
  },
  liveState: {
    color: colors.muted,
    fontFamily: type.family.mono,
    fontSize: 9,
    fontWeight: type.weight.bold,
    letterSpacing: 0.8,
    marginTop: density.gapSm,
  },
  status: {
    alignItems: "center",
    flexDirection: "row",
    gap: density.gapMd,
    marginTop: density.gapMd,
  },
  statusGlyph: { color: colors.mutedStrong, fontFamily: type.family.mono, fontSize: 10 },
  statusGlyphActive: { color: colors.primary },
  statusGlyphDanger: { color: colors.danger },
  statusText: {
    color: colors.muted,
    fontFamily: type.family.mono,
    fontSize: 9,
    fontWeight: type.weight.bold,
    letterSpacing: 0.8,
  },
  pairingSurface: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.xl,
    borderWidth: spacing.hairline,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  pairingIntro: { gap: spacing.sm },
  pairingTitle: {
    color: colors.foreground,
    fontFamily: type.family.sans,
    fontSize: type.size.xl,
    fontWeight: type.weight.bold,
    letterSpacing: -0.4,
  },
  pairingDescription: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    lineHeight: 21,
  },
  cameraMessage: { alignItems: "stretch", gap: spacing.md, paddingVertical: spacing.sm },
  cameraPanel: { gap: spacing.md },
  cameraFrame: {
    aspectRatio: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: spacing.hairline,
    overflow: "hidden",
  },
  camera: { flex: 1 },
  cameraCopy: {
    color: colors.muted,
    fontFamily: type.family.sans,
    fontSize: type.size.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  orDivider: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  orRule: { backgroundColor: colors.border, flex: 1, height: spacing.hairline },
  orText: {
    color: colors.mutedStrong,
    fontFamily: type.family.mono,
    fontSize: 9,
    fontWeight: type.weight.bold,
  },
  hostList: {
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: spacing.hairline,
    overflow: "hidden",
  },
  hostRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hostSelect: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 68,
  },
  hostMonogram: {
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderWidth: spacing.hairline,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  hostMonogramText: {
    color: colors.foreground,
    fontFamily: type.family.mono,
    fontSize: type.size.sm,
    fontWeight: type.weight.bold,
  },
  hostNameRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  selectedLabel: {
    color: colors.primary,
    fontFamily: type.family.mono,
    fontSize: 8,
    fontWeight: type.weight.bold,
    letterSpacing: 0.8,
  },
  hostFailure: {
    color: colors.danger,
    fontFamily: type.family.sans,
    fontSize: type.size.xs,
    lineHeight: 18,
    marginTop: density.gapMd,
  },
});
