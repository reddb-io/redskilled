// Public ACP v2 turn forwarding, permission delegation and terminal cleanup.
import { randomUUID } from "node:crypto";
import { methods, type PromptRequest, type RequestPermissionResponse, type SessionNotification } from "@agentclientprotocol/sdk";
import * as acpV2 from "@agentclientprotocol/sdk/experimental/v2";
import { translateV1SessionUpdateToV2 } from "@reddb-io/protocol-acp";
import { formatStandingOrdersBrief } from "./standing-orders.js";
import { resolvePermission } from "./acp-permission.js";
import type { AcpSessionJournal as DurableAcpSessionJournal } from "./acp-session-journal.js";
import type { PublicSession, StartRedskillsAcpControlPlaneOptions } from "./acp-control-plane-contract.js";
import { admitNativeAcpWorker } from "./acp-worker-admission.js";
import { cleanupWorkflowWorker, notifyWorkerLifecycle, reapWorkflowWorker, requestWorkflowTurn, scheduleIdleCleanup, workflowOutcome, type ActiveWorkflowWorker } from "./acp-worker-lifecycle.js";

export async function runV2PublicTurn(
  options: StartRedskillsAcpControlPlaneOptions,
  sessionJournal: DurableAcpSessionJournal,
  sessions: Map<string, PublicSession>,
  active: Map<string, ActiveWorkflowWorker>,
  params: acpV2.PromptRequest,
  upstream: acpV2.AgentContext,
  attached: () => boolean,
): Promise<void> {
  const session = sessions.get(params.sessionId);
  if (session == null) return;
  const messageId = randomUUID();
  await upstream.notify(acpV2.methods.client.session.update, {
    sessionId: params.sessionId,
    update: { sessionUpdate: "state_update", state: "running" },
  });

  let worker: ActiveWorkflowWorker | undefined;
  try {
    const forward = async (_method: typeof methods.client.session.update, notice: SessionNotification) => {
      const update = translateV1SessionUpdateToV2(notice.update, messageId);
      if (update == null) return;
      await upstream.notify(acpV2.methods.client.session.update, {
        sessionId: params.sessionId,
        update,
        _meta: notice._meta,
      });
    };
    // Inject standing orders into the prompt if present
    let prompt = params.prompt as unknown as PromptRequest["prompt"];
    if (options.standingOrdersStore != null) {
      const ordersResult = await options.standingOrdersStore.show(session.project.projectLabel);
      if (ordersResult.orders.length > 0) {
        const ordersText = formatStandingOrdersBrief(ordersResult.orders);
        prompt = [{ type: "text", text: ordersText }, ...prompt];
      }
    }
    const turn = await requestWorkflowTurn(
      params.sessionId,
      active,
      {
        sessionId: params.sessionId,
        prompt,
        ...(params._meta == null ? {} : { _meta: params._meta }),
      },
      (replacement) => admitNativeAcpWorker(
        options,
        sessionJournal,
        session,
        params.sessionId,
        forward,
        (request) => resolvePermission(
          sessionJournal,
          params.sessionId,
          request,
          attached,
          async (projected) => await upstream.request(
            acpV2.methods.client.session.requestPermission,
            projected as unknown as acpV2.RequestPermissionRequest,
          ) as unknown as RequestPermissionResponse,
        ),
        replacement,
      ),
    );
    worker = turn.worker;
    const response = turn.response;
    const outcome = workflowOutcome(response);
    await sessionJournal.checkpoint(params.sessionId, response, outcome);
    if (outcome != null) {
      await notifyWorkerLifecycle(worker, "terminal-outcome", outcome).catch(() => undefined);
      await reapWorkflowWorker(params.sessionId, worker, active, outcome);
    } else if (!attached()) {
      await reapWorkflowWorker(params.sessionId, worker, active, "client-detached");
    } else {
      scheduleIdleCleanup(params.sessionId, worker, active);
    }
    await upstream.notify(acpV2.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: "state_update", state: "idle", stopReason: response.stopReason },
      _meta: { redskills: { authority: "redskilled", workerId: worker.workerId } },
    });
  } catch (error) {
    if (worker != null) cleanupWorkflowWorker(params.sessionId, worker, active);
    const detail = error instanceof Error ? error.message : String(error);
    options.recordAcpFailure?.({
      projectLabel: session.project.projectLabel,
      detail: `an ACP v2 turn ended as a refusal: ${detail}`,
      surface: "turn",
    });
    await upstream.notify(acpV2.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: "state_update", state: "idle", stopReason: "refusal" },
      _meta: { redskills: { authority: "redskilled", detail } },
    });
  }
}

