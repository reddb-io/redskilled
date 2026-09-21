import { useFonts } from "expo-font";
import { useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
} from "react-native";

import { pairRedskilledHost } from "@reddb-io/red-skills-link-protocol/mobile-client";
import type { RedskilledLinkPairedHost } from "@reddb-io/red-skills-link-protocol/protocol";

import {
  BrandMark,
  Feedback,
  type AppDestination,
} from "./src/design-system/components";
import { colors, spacing } from "./src/design-system/tokens";
import {
  fleetHostViews,
  fleetWorkerRows,
  type FleetWorkerRow,
  type HostRuntime,
} from "./src/domain/host-fleet";
import { parseGitHubIssueUrl } from "./src/domain/issue-url";
import type { MobileOperatorGateway } from "./src/domain/ticket-dispatch";
import { addPairedHost, loadPairedHosts, removePairedHost } from "./src/transport/paired-host-store";
import { createRemoteOperatorGateway } from "./src/transport/remote-operator-gateway";
import { AppShell } from "./src/ui/app-shell";
import { copy } from "./src/ui/copy";
import { DispatchScreen, HostsScreen, WorkersScreen } from "./src/ui/screens";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono: require("./vendor/design-system/fonts/jetbrains-mono-variable.ttf"),
    SpaceGrotesk: require("./vendor/design-system/fonts/space-grotesk-variable.ttf"),
  });
  const [hosts, setHosts] = useState<readonly RedskilledLinkPairedHost[]>([]);
  const [hostsLoaded, setHostsLoaded] = useState(false);
  const [activeHostId, setActiveHostId] = useState<string | null>(null);
  const [addingHost, setAddingHost] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [isPairing, setIsPairing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanLocked = useRef(false);
  const [issueUrl, setIssueUrl] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<Readonly<Record<string, HostRuntime>>>({});
  const [pending, setPending] = useState<readonly FleetWorkerRow[]>([]);
  const [screen, setScreen] = useState<AppDestination>("dispatch");
  const gateways = useMemo(() => {
    const built = new Map<string, MobileOperatorGateway>();
    for (const host of hosts) built.set(host.host_id, createRemoteOperatorGateway(host));
    return built;
  }, [hosts]);
  const activeHost = hosts.find((host) => host.host_id === activeHostId) ?? hosts[0] ?? null;

  useEffect(() => {
    let active = true;
    void loadPairedHosts()
      .then((loaded) => {
        if (!active) return;
        setHosts(loaded);
        setHostsLoaded(true);
        if (loaded.length === 0) setScreen("hosts");
      })
      .catch(() => {
        if (!active) return;
        setError(copy.errors.hostLoad);
        setHostsLoaded(true);
        setScreen("hosts");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (gateways.size === 0) return;
    let active = true;
    // Each Host is polled on its own and each outcome lands in ITS runtime:
    // an answered read stamps the instant the status verdict derives from,
    // and a failed read records WHY instead of being swallowed — one dead
    // machine reads unreachable on its own card while the rest stay honest.
    const refresh = () => {
      for (const [hostId, gateway] of gateways) {
        void gateway.state().then((snapshot) => {
          if (!active) return;
          setRuntime((current) => ({
            ...current,
            [hostId]: { snapshot, lastAnsweredAtMs: Date.now(), failure: null },
          }));
          setPending((current) => current.filter((row) =>
            row.hostId !== hostId || !snapshot.workers.some((worker) => worker.workerId === row.workerId)));
        }).catch((failure: unknown) => {
          if (!active) return;
          setRuntime((current) => ({
            ...current,
            [hostId]: {
              snapshot: current[hostId]?.snapshot ?? null,
              lastAnsweredAtMs: current[hostId]?.lastAnsweredAtMs ?? null,
              failure: failure instanceof Error ? failure.message : String(failure),
            },
          }));
        });
      }
    };
    refresh();
    const timer = setInterval(refresh, 3_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [gateways]);

  const issue = useMemo(() => {
    try {
      return parseGitHubIssueUrl(issueUrl);
    } catch {
      return null;
    }
  }, [issueUrl]);

  const now = Date.now();
  const hostViews = fleetHostViews(hosts, runtime, now);
  const workers = fleetWorkerRows(hosts, runtime, pending, now);
  const canDispatch = activeHost != null && issue != null && !isDispatching;

  async function dispatchIssue() {
    const gateway = activeHost == null ? null : gateways.get(activeHost.host_id);
    if (activeHost == null || issue == null || gateway == null) return;

    setIsDispatching(true);
    setError(null);
    try {
      const receipt = await gateway.dispatch({
        hostId: activeHost.host_id,
        issueUrl: issue.canonicalUrl,
      });
      setPending((current) => [{
        workerId: receipt.workerId,
        repository: receipt.repository,
        ticket: receipt.ticket,
        startedAt: new Date().toISOString(),
        pending: true,
        hostId: activeHost.host_id,
        hostName: activeHost.host_name,
      }, ...current.filter((row) => row.workerId !== receipt.workerId)]);
      setIssueUrl("");
    } catch {
      setError(copy.errors.dispatch);
    } finally {
      setIsDispatching(false);
    }
  }

  async function pairHost(invitation: string) {
    if (invitation.trim() === "") return;
    setIsPairing(true);
    setError(null);
    try {
      const host = await pairRedskilledHost(invitation, `Redskilled ${Platform.OS}`);
      setHosts(await addPairedHost(host));
      setActiveHostId(host.host_id);
      setAddingHost(false);
      setPairingCode("");
      setScreen("dispatch");
    } catch {
      setError(copy.errors.pairing);
    } finally {
      setIsPairing(false);
    }
  }

  async function unpairHost(hostId: string) {
    setError(null);
    setHosts(await removePairedHost(hostId));
    setRuntime(({ [hostId]: _gone, ...rest }) => rest);
    setPending((current) => current.filter((row) => row.hostId !== hostId));
    if (activeHostId === hostId) setActiveHostId(null);
  }

  async function scanPairingInvitation({ data }: BarcodeScanningResult) {
    if (scanLocked.current) return;
    scanLocked.current = true;
    setPairingCode(data);
    setScannerOpen(false);
    try {
      await pairHost(data);
    } finally {
      scanLocked.current = false;
    }
  }

  async function stopWorker(row: FleetWorkerRow) {
    const gateway = gateways.get(row.hostId);
    if (gateway == null) return;
    setError(null);
    try {
      if (await gateway.stop(row.workerId)) {
        setPending((current) => current.filter((entry) => entry.workerId !== row.workerId));
        setRuntime((current) => {
          const state = current[row.hostId];
          if (state?.snapshot == null) return current;
          return {
            ...current,
            [row.hostId]: {
              ...state,
              snapshot: {
                ...state.snapshot,
                workers: state.snapshot.workers.filter((worker) => worker.workerId !== row.workerId),
              },
            },
          };
        });
      }
    } catch {
      setError(copy.errors.stop);
    }
  }

  if ((!fontsLoaded && fontError == null) || !hostsLoaded) {
    return (
      <SafeAreaView accessibilityLabel={copy.app.loading} style={styles.loadingScreen}>
        <StatusBar style="light" />
        <BrandMark size={40} />
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const content = screen === "dispatch" ? (
    <DispatchScreen
      activeHost={activeHost}
      canDispatch={canDispatch}
      isDispatching={isDispatching}
      issue={issue}
      issueUrl={issueUrl}
      onDispatch={() => void dispatchIssue()}
      onIssueUrlChange={(value) => {
        setIssueUrl(value);
        setError(null);
      }}
      onNavigate={setScreen}
      onStopWorker={(worker) => void stopWorker(worker)}
      workers={workers}
    />
  ) : screen === "workers" ? (
    <WorkersScreen
      onNavigate={setScreen}
      onStopWorker={(worker) => void stopWorker(worker)}
      workers={workers}
    />
  ) : (
    <HostsScreen
      activeHostId={activeHost?.host_id ?? null}
      addingHost={addingHost}
      cameraPermission={cameraPermission}
      hostViews={hostViews}
      isPairing={isPairing}
      onAddHost={() => {
        setAddingHost(true);
        setError(null);
      }}
      onAllowCamera={() => void requestCameraPermission()}
      onCancelAdd={() => {
        setAddingHost(false);
        setScannerOpen(false);
      }}
      onPair={() => void pairHost(pairingCode)}
      onPairingCodeChange={setPairingCode}
      onScan={(result) => void scanPairingInvitation(result)}
      onScannerOpenChange={(open) => {
        scanLocked.current = false;
        setScannerOpen(open);
        setError(null);
      }}
      onSelectHost={setActiveHostId}
      onUnpairHost={(hostId) => void unpairHost(hostId)}
      pairingCode={pairingCode}
      scannerOpen={scannerOpen}
    />
  );

  return (
    <AppShell
      active={screen}
      hostCount={hosts.length}
      onNavigate={(destination) => {
        setError(null);
        setScreen(destination);
      }}
      workerCount={workers.length}
    >
      {error == null ? null : <Feedback>{error}</Feedback>}
      {content}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.xl,
    justifyContent: "center",
  },
});
