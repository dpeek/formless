import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IdentityAccessManagementSummary } from "@dpeek/formless-identity-control-plane";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import { fetchInstanceAppInstalls } from "../../client/app-installs.ts";
import {
  createIdentityAccessManagementInvitation,
  fetchIdentityAccessManagementSummary,
  IdentityAccessManagementApiError,
  revokeIdentityAccessManagementInvitation,
  type CreateIdentityAccessManagementInvitationInput,
  type RevokeIdentityAccessManagementInvitationInput,
} from "../../client/identity-access-management.ts";
import type { AppInstallsResponse } from "../../shared/protocol.ts";
import { ApplicationPresentation } from "../application-presentation.tsx";
import { useApplicationRuntimePublicationCoordinatorContext } from "../generated/application-runtime-contract-host.tsx";
import { instanceAccessReference } from "./access-contract.ts";
import {
  createInitialAccessInvitationDraft,
  type AccessIntentActions,
  type AccessInvitationDraft,
  type AccessInvitationRevocationState,
  type AccessInvitationSubmissionState,
  type AccessManagementPresentationState,
  type ProjectAccessOptions,
} from "./access-projection.ts";
import { createAccessRuntimePublicationController } from "./access-runtime.ts";

export type AccessRouteDependencies = {
  createIdempotencyKey?: () => string;
  createInvitation?: (input: CreateIdentityAccessManagementInvitationInput) => Promise<unknown>;
  fetchInstalls?: (options?: { signal?: AbortSignal }) => Promise<AppInstallsResponse>;
  fetchSummary?: (options?: { signal?: AbortSignal }) => Promise<IdentityAccessManagementSummary>;
  revokeInvitation?: (input: RevokeIdentityAccessManagementInvitationInput) => Promise<unknown>;
};

export function AccessRoute({ dependencies = {} }: { dependencies?: AccessRouteDependencies }) {
  const application = useApplicationRuntimePublicationCoordinatorContext();
  const [publicationController] = useState(() =>
    createAccessRuntimePublicationController(application),
  );
  const fetchInstalls = dependencies.fetchInstalls ?? fetchInstanceAppInstalls;
  const fetchSummary = dependencies.fetchSummary ?? fetchIdentityAccessManagementSummary;
  const createInvitation =
    dependencies.createInvitation ?? createIdentityAccessManagementInvitation;
  const revokeInvitation =
    dependencies.revokeInvitation ?? revokeIdentityAccessManagementInvitation;
  const createIdempotencyKey =
    dependencies.createIdempotencyKey ?? createAccessInvitationIdempotencyKey;
  const [installs, setInstalls] = useState<readonly AppInstall[]>([]);
  const [state, setState] = useState<AccessManagementPresentationState>({ status: "loading" });
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [confirmationInvitationId, setConfirmationInvitationId] = useState<string>();
  const [draft, setDraft] = useState<AccessInvitationDraft>(() =>
    createInitialAccessInvitationDraft({ installs: [] }),
  );
  const [submission, setSubmission] = useState<AccessInvitationSubmissionState>({
    status: "idle",
  });
  const [revocation, setRevocation] = useState<AccessInvitationRevocationState>({
    status: "idle",
  });
  const createPending = useRef(false);
  const revokePending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let stopped = false;

    setState({ status: "loading" });

    void Promise.all([
      fetchSummary({ signal: controller.signal }),
      fetchInstalls({ signal: controller.signal }),
    ])
      .then(([summary, registry]) => {
        if (stopped) {
          return;
        }
        const nextInstalls = registry.installs;
        setInstalls(nextInstalls);
        setDraft(createInitialAccessInvitationDraft({ installs: nextInstalls, summary }));
        setState({ status: "ready", summary });
      })
      .catch((error: unknown) => {
        if (stopped || controller.signal.aborted) {
          return;
        }
        if (
          error instanceof IdentityAccessManagementApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          setState({ message: error.message, status: "unauthorized" });
          return;
        }
        setState({ message: accessRequestError(error), status: "failed" });
      });

    return () => {
      stopped = true;
      mounted.current = false;
      controller.abort();
    };
  }, [fetchInstalls, fetchSummary]);

  const changeAuthoringOpen = useCallback((open: boolean) => {
    setAuthoringOpen(open);
    if (open) {
      setSubmission({ status: "idle" });
    }
  }, []);
  const changeDraft = useCallback((nextDraft: AccessInvitationDraft) => {
    setDraft(nextDraft);
    setSubmission((current) => (current.status === "failed" ? { status: "idle" } : current));
  }, []);
  const changeRevocationConfirmation = useCallback((invitationId: string | undefined) => {
    setConfirmationInvitationId(invitationId);
    if (invitationId !== undefined) {
      setRevocation({ status: "idle" });
    }
  }, []);
  const submitInvitation = useCallback(
    async (input: CreateIdentityAccessManagementInvitationInput) => {
      if (createPending.current) {
        return;
      }
      createPending.current = true;
      setSubmission({ status: "submitting" });

      try {
        await createInvitation(input);
        const summary = await fetchSummary();
        if (!mounted.current) {
          return;
        }
        setState({ status: "ready", summary });
        setDraft(createInitialAccessInvitationDraft({ installs, summary }));
        setAuthoringOpen(false);
        setSubmission({ message: "Invitation created.", status: "succeeded" });
      } catch (error) {
        if (mounted.current) {
          setSubmission({ message: accessRequestError(error), status: "failed" });
        }
      } finally {
        createPending.current = false;
      }
    },
    [createInvitation, fetchSummary, installs],
  );
  const submitRevocation = useCallback(
    async (input: RevokeIdentityAccessManagementInvitationInput) => {
      if (revokePending.current) {
        return;
      }
      revokePending.current = true;
      setRevocation({ invitationId: input.invitationId, status: "submitting" });

      try {
        await revokeInvitation(input);
        const summary = await fetchSummary();
        if (!mounted.current) {
          return;
        }
        setState({ status: "ready", summary });
        setConfirmationInvitationId(undefined);
        setRevocation({
          invitationId: input.invitationId,
          message: "Invitation revoked.",
          status: "succeeded",
        });
      } catch (error) {
        if (mounted.current) {
          setRevocation({
            invitationId: input.invitationId,
            message: accessRequestError(error),
            status: "failed",
          });
        }
      } finally {
        revokePending.current = false;
      }
    },
    [fetchSummary, revokeInvitation],
  );
  const actions = useMemo<AccessIntentActions>(
    () => ({
      changeAuthoringOpen,
      changeDraft,
      changeRevocationConfirmation,
      createIdempotencyKey,
      revokeInvitation: submitRevocation,
      submitInvitation,
    }),
    [
      changeAuthoringOpen,
      changeDraft,
      changeRevocationConfirmation,
      createIdempotencyKey,
      submitInvitation,
      submitRevocation,
    ],
  );
  const input = useMemo<ProjectAccessOptions>(
    () => ({
      authoringOpen,
      confirmationInvitationId,
      draft,
      installs,
      revocation,
      state,
      submission,
    }),
    [authoringOpen, confirmationInvitationId, draft, installs, revocation, state, submission],
  );

  useLayoutEffect(() => {
    publicationController.updateRuntime(input, actions);
  }, [actions, input, publicationController]);

  useLayoutEffect(() => {
    publicationController.activate();
    return () => publicationController.dispose();
  }, [publicationController]);

  return (
    <ApplicationPresentation
      presentation={{ accessReference: instanceAccessReference, kind: "access" }}
    />
  );
}

function accessRequestError(error: unknown): string {
  return error instanceof IdentityAccessManagementApiError || error instanceof Error
    ? error.message
    : "Access management request failed.";
}

function createAccessInvitationIdempotencyKey(): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `access-invitation:${Date.now()}:${randomId}`;
}
