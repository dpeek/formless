import type {
  FormlessUiAccessActionContract,
  FormlessUiAccessIntent,
  FormlessUiAccessInvitationAuthoringContract,
  FormlessUiAccessInvitationAuthoringReference,
  FormlessUiAccessManifestContract,
  FormlessUiAccessManifestReference,
  FormlessUiAuthIntent,
  FormlessUiAuthSurfaceContract,
  FormlessUiAuthSurfaceKind,
  FormlessUiAuthSurfaceReference,
  FormlessUiContractIntent,
  FormlessUiContractIntentHandler,
  FormlessUiContractReference,
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntent,
  FormlessUiDocumentThemeReference,
  FormlessUiListContract,
  FormlessUiListResultReference,
  FormlessUiManagementInstallDialogContract,
  FormlessUiManagementInstallDialogReference,
  FormlessUiManagementIntent,
  FormlessUiManagementManifestContract,
  FormlessUiManagementManifestReference,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultReference,
  FormlessUiResultReferenceRole,
  FormlessUiShellManifestContract,
  FormlessUiShellIntent,
  FormlessUiShellManifestReference,
  FormlessUiShellNavigationSectionContract,
  FormlessUiShellNavigationSectionReference,
  FormlessUiTableContract,
  FormlessUiTableResultReference,
  FormlessUiWorkspaceIntent,
  FormlessUiWorkspaceManifestContract,
  FormlessUiWorkspaceManifestReference,
  FormlessUiWorkspaceSectionShellContract,
  FormlessUiWorkspaceSectionShellReference,
} from "./formless-ui-contract.ts";

export type FormlessUiContractSnapshot<Reference extends FormlessUiContractReference> =
  Reference extends FormlessUiAccessManifestReference
    ? FormlessUiAccessManifestContract
    : Reference extends FormlessUiAccessInvitationAuthoringReference
      ? FormlessUiAccessInvitationAuthoringContract
      : Reference extends FormlessUiAuthSurfaceReference<infer SurfaceKind>
        ? Extract<FormlessUiAuthSurfaceContract, { surfaceKind: SurfaceKind }>
        : Reference extends FormlessUiDocumentThemeReference
          ? FormlessUiDocumentThemeContract
          : Reference extends FormlessUiManagementManifestReference
            ? FormlessUiManagementManifestContract
            : Reference extends FormlessUiManagementInstallDialogReference
              ? FormlessUiManagementInstallDialogContract
              : Reference extends FormlessUiWorkspaceManifestReference
                ? FormlessUiWorkspaceManifestContract
                : Reference extends FormlessUiWorkspaceSectionShellReference
                  ? FormlessUiWorkspaceSectionShellContract
                  : Reference extends FormlessUiShellManifestReference
                    ? FormlessUiShellManifestContract
                    : Reference extends FormlessUiShellNavigationSectionReference
                      ? FormlessUiShellNavigationSectionContract
                      : Reference extends FormlessUiListResultReference
                        ? FormlessUiListContract
                        : Reference extends FormlessUiTableResultReference
                          ? FormlessUiTableContract
                          : Reference extends FormlessUiRecordResultReference
                            ? FormlessUiRecordResultContract
                            : never;

export type FormlessUiContractHostListener = () => void;

export type FormlessUiContractHost = {
  dispatch(intent: FormlessUiContractIntent): ReturnType<FormlessUiContractIntentHandler>;
  getServerSnapshot<Reference extends FormlessUiContractReference>(
    reference: Reference,
  ): FormlessUiContractSnapshot<Reference> | undefined;
  read<Reference extends FormlessUiContractReference>(
    reference: Reference,
  ): FormlessUiContractSnapshot<Reference> | undefined;
  subscribe(
    reference: FormlessUiContractReference,
    listener: FormlessUiContractHostListener,
  ): () => void;
};

export type FormlessUiWorkspaceManifestNode = {
  reference: FormlessUiWorkspaceManifestReference;
  snapshot: FormlessUiWorkspaceManifestContract;
};

export type FormlessUiAccessManifestNode = {
  reference: FormlessUiAccessManifestReference;
  snapshot: FormlessUiAccessManifestContract;
};

export type FormlessUiAccessInvitationAuthoringNode = {
  reference: FormlessUiAccessInvitationAuthoringReference;
  snapshot: FormlessUiAccessInvitationAuthoringContract;
};

export type FormlessUiAuthSurfaceNode = {
  reference: FormlessUiAuthSurfaceReference;
  snapshot: FormlessUiAuthSurfaceContract;
};

export type FormlessUiDocumentThemeNode = {
  reference: FormlessUiDocumentThemeReference;
  snapshot: FormlessUiDocumentThemeContract;
};

export type FormlessUiWorkspaceSectionShellNode = {
  reference: FormlessUiWorkspaceSectionShellReference;
  snapshot: FormlessUiWorkspaceSectionShellContract;
};

export type FormlessUiShellManifestNode = {
  reference: FormlessUiShellManifestReference;
  snapshot: FormlessUiShellManifestContract;
};

export type FormlessUiShellNavigationSectionNode = {
  reference: FormlessUiShellNavigationSectionReference;
  snapshot: FormlessUiShellNavigationSectionContract;
};

export type FormlessUiListResultNode = {
  reference: FormlessUiListResultReference;
  snapshot: FormlessUiListContract;
};

export type FormlessUiTableResultNode = {
  reference: FormlessUiTableResultReference;
  snapshot: FormlessUiTableContract;
};

export type FormlessUiRecordResultNode = {
  reference: FormlessUiRecordResultReference;
  snapshot: FormlessUiRecordResultContract;
};

export type FormlessUiManagementManifestNode = {
  reference: FormlessUiManagementManifestReference;
  snapshot: FormlessUiManagementManifestContract;
};

export type FormlessUiManagementInstallDialogNode = {
  reference: FormlessUiManagementInstallDialogReference;
  snapshot: FormlessUiManagementInstallDialogContract;
};

export type FormlessUiContractHostNode =
  | FormlessUiAccessInvitationAuthoringNode
  | FormlessUiAccessManifestNode
  | FormlessUiAuthSurfaceNode
  | FormlessUiDocumentThemeNode
  | FormlessUiListResultNode
  | FormlessUiManagementInstallDialogNode
  | FormlessUiManagementManifestNode
  | FormlessUiRecordResultNode
  | FormlessUiShellManifestNode
  | FormlessUiShellNavigationSectionNode
  | FormlessUiTableResultNode
  | FormlessUiWorkspaceManifestNode
  | FormlessUiWorkspaceSectionShellNode;

export type FormlessUiContractHostNodeSet = readonly FormlessUiContractHostNode[];

export type FormlessUiMutableContractHost = FormlessUiContractHost & {
  publish(nodes: FormlessUiContractHostNodeSet): void;
};

export type FormlessUiMemoryContractHostOptions = {
  dispatch?: FormlessUiContractIntentHandler;
  nodes?: FormlessUiContractHostNodeSet;
  serverNodes?: FormlessUiContractHostNodeSet;
};

type StoredContractNode = {
  reference: FormlessUiContractReference;
  snapshot: FormlessUiContractSnapshot<FormlessUiContractReference>;
};

type StoredContractNodes = ReadonlyMap<string, StoredContractNode>;

export function createFormlessUiMemoryContractHost({
  dispatch = () => undefined,
  nodes = [],
  serverNodes,
}: FormlessUiMemoryContractHostOptions = {}): FormlessUiMutableContractHost {
  const listeners = new Map<string, Set<FormlessUiContractHostListener>>();
  const serverSnapshotNodes = prepareNodeSet(serverNodes ?? nodes, new Map());
  let currentNodes = prepareNodeSet(nodes, serverSnapshotNodes);

  return {
    dispatch,
    getServerSnapshot,
    publish,
    read,
    subscribe,
  };

  function read<Reference extends FormlessUiContractReference>(
    reference: Reference,
  ): FormlessUiContractSnapshot<Reference> | undefined {
    return snapshotForReference(currentNodes, reference);
  }

  function getServerSnapshot<Reference extends FormlessUiContractReference>(
    reference: Reference,
  ): FormlessUiContractSnapshot<Reference> | undefined {
    return snapshotForReference(serverSnapshotNodes, reference);
  }

  function subscribe(
    reference: FormlessUiContractReference,
    listener: FormlessUiContractHostListener,
  ) {
    const key = formlessUiContractReferenceKey(reference);
    const scopedListeners = listeners.get(key) ?? new Set<FormlessUiContractHostListener>();
    scopedListeners.add(listener);
    listeners.set(key, scopedListeners);

    return () => {
      scopedListeners.delete(listener);
      if (scopedListeners.size === 0) {
        listeners.delete(key);
      }
    };
  }

  function publish(nextNodeSet: FormlessUiContractHostNodeSet) {
    const nextNodes = prepareNodeSet(nextNodeSet, currentNodes);
    const changedKeys = changedReferenceKeys(currentNodes, nextNodes);

    currentNodes = nextNodes;

    for (const key of changedKeys) {
      const listenersToNotify = Array.from(listeners.get(key) ?? []);
      for (const listener of listenersToNotify) {
        listener();
      }
    }
  }
}

export function formlessUiWorkspaceManifestReference(
  workspaceId: string,
): FormlessUiWorkspaceManifestReference {
  return {
    kind: "workspaceManifestReference",
    role: "workspace",
    workspaceId,
  };
}

export function formlessUiAccessManifestReference(
  accessId: string,
): FormlessUiAccessManifestReference {
  return {
    accessId,
    kind: "accessManifestReference",
    role: "access",
  };
}

export function formlessUiAccessInvitationAuthoringReference(
  accessId: string,
  authoringId: string,
): FormlessUiAccessInvitationAuthoringReference {
  return {
    accessId,
    authoringId,
    kind: "accessInvitationAuthoringReference",
    role: "accessInvitationAuthoring",
  };
}

export function formlessUiAuthSurfaceReference<SurfaceKind extends FormlessUiAuthSurfaceKind>({
  surfaceId,
  surfaceKind,
}: {
  surfaceId: string;
  surfaceKind: SurfaceKind;
}): FormlessUiAuthSurfaceReference<SurfaceKind> {
  return {
    kind: "authSurfaceReference",
    role: "authSurface",
    surfaceId,
    surfaceKind,
  };
}

export function formlessUiManagementManifestReference(
  managementId: string,
): FormlessUiManagementManifestReference {
  return {
    kind: "managementManifestReference",
    managementId,
    role: "management",
  };
}

export function formlessUiManagementInstallDialogReference(
  managementId: string,
  dialogId: string,
): FormlessUiManagementInstallDialogReference {
  return {
    dialogId,
    kind: "managementInstallDialogReference",
    managementId,
    role: "managementInstallDialog",
  };
}

export function formlessUiDocumentThemeReference(
  themeId: string,
): FormlessUiDocumentThemeReference {
  return {
    kind: "documentThemeReference",
    role: "documentTheme",
    themeId,
  };
}

export function formlessUiWorkspaceSectionShellReference(
  workspaceId: string,
  sectionId: string,
): FormlessUiWorkspaceSectionShellReference {
  return {
    kind: "workspaceSectionShellReference",
    role: "section",
    sectionId,
    workspaceId,
  };
}

export function formlessUiShellManifestReference(
  shellId: string,
): FormlessUiShellManifestReference {
  return {
    kind: "shellManifestReference",
    role: "shell",
    shellId,
  };
}

export function formlessUiShellNavigationSectionReference(
  shellId: string,
  sectionId: string,
): FormlessUiShellNavigationSectionReference {
  return {
    kind: "shellNavigationSectionReference",
    role: "shellNavigationSection",
    sectionId,
    shellId,
  };
}

export function formlessUiListResultReference({
  resultId,
  role,
  sectionId,
  workspaceId,
}: Omit<FormlessUiListResultReference, "kind">): FormlessUiListResultReference {
  return {
    kind: "listResultReference",
    resultId,
    role,
    sectionId,
    workspaceId,
  };
}

export function formlessUiTableResultReference({
  resultId,
  role,
  sectionId,
  workspaceId,
}: Omit<FormlessUiTableResultReference, "kind">): FormlessUiTableResultReference {
  return {
    kind: "tableResultReference",
    resultId,
    role,
    sectionId,
    workspaceId,
  };
}

export function formlessUiRecordResultReference<Role extends FormlessUiResultReferenceRole>({
  resultId,
  role,
  sectionId,
  workspaceId,
}: Omit<FormlessUiRecordResultReference<Role>, "kind">): FormlessUiRecordResultReference<Role> {
  return {
    kind: "recordResultReference",
    resultId,
    role,
    sectionId,
    workspaceId,
  };
}

export function formlessUiContractReferenceKey(reference: FormlessUiContractReference): string {
  switch (reference.kind) {
    case "accessManifestReference":
      return JSON.stringify([reference.role, reference.accessId]);
    case "accessInvitationAuthoringReference":
      return JSON.stringify([reference.role, reference.accessId, reference.authoringId]);
    case "authSurfaceReference":
      return JSON.stringify([reference.role, reference.surfaceKind, reference.surfaceId]);
    case "documentThemeReference":
      return JSON.stringify([reference.role, reference.themeId]);
    case "managementManifestReference":
      return JSON.stringify([reference.role, reference.managementId]);
    case "managementInstallDialogReference":
      return JSON.stringify([reference.role, reference.managementId, reference.dialogId]);
    case "shellManifestReference":
      return JSON.stringify([reference.role, reference.shellId]);
    case "shellNavigationSectionReference":
      return JSON.stringify([reference.role, reference.shellId, reference.sectionId]);
    case "workspaceManifestReference":
      return JSON.stringify([reference.role, reference.workspaceId]);
    case "workspaceSectionShellReference":
      return JSON.stringify([reference.role, reference.workspaceId, reference.sectionId]);
    case "listResultReference":
    case "recordResultReference":
    case "tableResultReference":
      return JSON.stringify([
        reference.role,
        reference.workspaceId,
        reference.sectionId,
        reference.kind,
        reference.resultId,
      ]);
  }
}

export function isFormlessUiWorkspaceIntent(
  intent: FormlessUiContractIntent,
): intent is FormlessUiWorkspaceIntent {
  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange":
    case "accessInvitationFieldChange":
    case "accessInvitationGrantSelection":
    case "accessInvitationRevocationConfirmationOpenChange":
    case "accessInvitationRevoke":
    case "accessInvitationSubmit":
    case "authAction":
    case "authContinuation":
    case "authField":
    case "authPasskey":
    case "authPolicySelection":
    case "documentThemeModeSelection":
    case "managementAuthorizationOpen":
    case "managementInstallDialogOpenChange":
    case "managementInstallField":
    case "managementInstallPackageSelection":
    case "managementInstallSubmit":
    case "managementWorkspaceOperation":
    case "shellCreate":
    case "shellLogout":
    case "shellReset":
    case "shellRootRecordSelection":
      return false;
    default:
      return true;
  }
}

export function isFormlessUiAccessIntent(
  intent: FormlessUiContractIntent,
): intent is FormlessUiAccessIntent {
  switch (intent.type) {
    case "accessInvitationAuthoringOpenChange":
    case "accessInvitationFieldChange":
    case "accessInvitationGrantSelection":
    case "accessInvitationRevocationConfirmationOpenChange":
    case "accessInvitationRevoke":
    case "accessInvitationSubmit":
      return true;
    default:
      return false;
  }
}

export function isFormlessUiAuthIntent(
  intent: FormlessUiContractIntent,
): intent is FormlessUiAuthIntent {
  switch (intent.type) {
    case "authAction":
    case "authContinuation":
    case "authField":
    case "authPasskey":
    case "authPolicySelection":
      return true;
    default:
      return false;
  }
}

export function isFormlessUiManagementIntent(
  intent: FormlessUiContractIntent,
): intent is FormlessUiManagementIntent {
  switch (intent.type) {
    case "managementAuthorizationOpen":
    case "managementInstallDialogOpenChange":
    case "managementInstallField":
    case "managementInstallPackageSelection":
    case "managementInstallSubmit":
    case "managementWorkspaceOperation":
      return true;
    default:
      return false;
  }
}

export function isFormlessUiDocumentThemeIntent(
  intent: FormlessUiContractIntent,
): intent is FormlessUiDocumentThemeIntent {
  return intent.type === "documentThemeModeSelection";
}

export function isFormlessUiShellIntent(
  intent: FormlessUiContractIntent,
): intent is FormlessUiShellIntent {
  switch (intent.type) {
    case "shellCreate":
    case "shellLogout":
    case "shellReset":
    case "shellRootRecordSelection":
      return true;
    default:
      return false;
  }
}

function snapshotForReference<Reference extends FormlessUiContractReference>(
  nodes: StoredContractNodes,
  reference: Reference,
): FormlessUiContractSnapshot<Reference> | undefined {
  return nodes.get(formlessUiContractReferenceKey(reference))?.snapshot as
    | FormlessUiContractSnapshot<Reference>
    | undefined;
}

function prepareNodeSet(
  nodes: FormlessUiContractHostNodeSet,
  reusableNodes: StoredContractNodes,
): StoredContractNodes {
  const prepared = new Map<string, StoredContractNode>();

  for (const node of nodes) {
    assertNodeMatchesReference(node);
    const key = formlessUiContractReferenceKey(node.reference);

    if (prepared.has(key)) {
      throw new Error(`Duplicate Formless UI contract reference ${key}.`);
    }

    const reusableNode = reusableNodes.get(key);
    prepared.set(key, {
      reference: node.reference,
      snapshot:
        reusableNode && semanticallyEqual(reusableNode.snapshot, node.snapshot)
          ? reusableNode.snapshot
          : node.snapshot,
    });
  }

  assertReferencesResolve(prepared);
  return prepared;
}

function assertNodeMatchesReference(node: FormlessUiContractHostNode) {
  const { reference, snapshot } = node;

  switch (reference.kind) {
    case "accessManifestReference":
      if (snapshot.kind !== "accessManifest" || snapshot.id !== reference.accessId) {
        throw mismatchedNodeError(reference);
      }
      assertAccessManifestContract(snapshot);
      return;
    case "accessInvitationAuthoringReference":
      if (
        snapshot.kind !== "accessInvitationAuthoring" ||
        snapshot.id !== reference.authoringId ||
        snapshot.accessId !== reference.accessId
      ) {
        throw mismatchedNodeError(reference);
      }
      assertAccessInvitationAuthoringContract(snapshot);
      return;
    case "authSurfaceReference":
      if (
        snapshot.kind !== "authSurface" ||
        snapshot.id !== reference.surfaceId ||
        snapshot.surfaceKind !== reference.surfaceKind
      ) {
        throw mismatchedNodeError(reference);
      }
      assertAuthSurfaceContract(snapshot);
      return;
    case "documentThemeReference":
      if (snapshot.kind !== "documentTheme" || snapshot.id !== reference.themeId) {
        throw mismatchedNodeError(reference);
      }
      assertDocumentThemeContract(snapshot);
      return;
    case "managementManifestReference":
      if (snapshot.kind !== "managementManifest" || snapshot.id !== reference.managementId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "managementInstallDialogReference":
      if (
        snapshot.kind !== "managementInstallDialog" ||
        snapshot.id !== reference.dialogId ||
        snapshot.managementId !== reference.managementId
      ) {
        throw mismatchedNodeError(reference);
      }
      assertManagementInstallDialogContract(snapshot);
      return;
    case "shellManifestReference":
      if (snapshot.kind !== "shellManifest" || snapshot.id !== reference.shellId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "shellNavigationSectionReference":
      if (
        snapshot.kind !== "shellNavigationSection" ||
        snapshot.id !== reference.sectionId ||
        snapshot.shellId !== reference.shellId
      ) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "workspaceManifestReference":
      if (snapshot.kind !== "workspaceManifest" || snapshot.id !== reference.workspaceId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "workspaceSectionShellReference":
      if (snapshot.kind !== "workspaceSectionShell" || snapshot.id !== reference.sectionId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "listResultReference":
      if (snapshot.kind !== "list" || snapshot.id !== reference.resultId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "recordResultReference":
      if (snapshot.kind !== "recordResult" || snapshot.id !== reference.resultId) {
        throw mismatchedNodeError(reference);
      }
      return;
    case "tableResultReference":
      if (snapshot.kind !== "table" || snapshot.id !== reference.resultId) {
        throw mismatchedNodeError(reference);
      }
  }
}

function assertAccessManifestContract(snapshot: FormlessUiAccessManifestContract) {
  if (snapshot.state !== "ready") {
    return;
  }

  const { authoring, confirmation, invitations, invite, people } = snapshot;
  assertAccessActionIdentity(invite, snapshot.id);
  if (
    invite.purpose !== "authoring-open" ||
    invite.intent.type !== "accessInvitationAuthoringOpenChange" ||
    invite.intent.authoringId !== authoring.authoringId ||
    !invite.intent.open
  ) {
    throw new Error(
      `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid authoring action.`,
    );
  }

  assertDistinctAccessIdentities(
    snapshot.id,
    "people",
    people.map(({ id }) => id),
  );
  assertDistinctAccessIdentities(
    snapshot.id,
    "invitations",
    invitations.map(({ id }) => id),
  );

  for (const invitation of invitations) {
    if (invitation.revocation.availability !== "available") {
      continue;
    }
    const action = invitation.revocation.action;
    assertAccessActionIdentity(action, snapshot.id);
    if (
      action.purpose !== "revocation-open" ||
      action.intent.type !== "accessInvitationRevocationConfirmationOpenChange" ||
      action.intent.invitationId !== invitation.id ||
      !action.intent.open
    ) {
      throw new Error(
        `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid invitation revocation action.`,
      );
    }
  }

  if (!confirmation) {
    return;
  }
  assertAccessActionIdentity(confirmation.cancel, snapshot.id);
  assertAccessActionIdentity(confirmation.action, snapshot.id);
  if (
    confirmation.cancel.purpose !== "revocation-cancel" ||
    confirmation.cancel.intent.type !== "accessInvitationRevocationConfirmationOpenChange" ||
    confirmation.cancel.intent.confirmationId !== confirmation.id ||
    confirmation.cancel.intent.invitationId !== confirmation.invitationId ||
    confirmation.cancel.intent.open ||
    confirmation.action.purpose !== "invitation-revoke" ||
    confirmation.action.intent.type !== "accessInvitationRevoke" ||
    confirmation.action.intent.confirmationId !== confirmation.id ||
    confirmation.action.intent.invitationId !== confirmation.invitationId
  ) {
    throw new Error(
      `Formless UI access manifest ${JSON.stringify(snapshot.id)} has an invalid revocation confirmation.`,
    );
  }
}

function assertAccessInvitationAuthoringContract(
  snapshot: FormlessUiAccessInvitationAuthoringContract,
) {
  assertAccessActionIdentity(snapshot.cancel, snapshot.accessId);
  assertAccessActionIdentity(snapshot.submit, snapshot.accessId);
  if (
    snapshot.cancel.purpose !== "authoring-cancel" ||
    snapshot.cancel.intent.type !== "accessInvitationAuthoringOpenChange" ||
    snapshot.cancel.intent.authoringId !== snapshot.id ||
    snapshot.cancel.intent.open ||
    snapshot.submit.purpose !== "invitation-submit" ||
    snapshot.submit.intent.type !== "accessInvitationSubmit" ||
    snapshot.submit.intent.authoringId !== snapshot.id
  ) {
    throw new Error(
      `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has invalid actions.`,
    );
  }

  const expectedFieldPurposes = {
    displayName: "display-name",
    expiresAt: "expires-at",
    targetAppInstall: "target-app-install",
    targetEmail: "target-email",
    targetOrganization: "target-organization",
    targetSurface: "target-surface",
  } as const;
  const fields = Object.entries(snapshot.fields) as Array<
    [keyof typeof expectedFieldPurposes, (typeof snapshot.fields)[keyof typeof snapshot.fields]]
  >;
  assertDistinctAccessIdentities(
    snapshot.id,
    "fields",
    fields.map(([, field]) => field.id),
  );
  for (const [fieldName, field] of fields) {
    if (
      field.purpose !== expectedFieldPurposes[fieldName] ||
      field.changeIntent.accessId !== snapshot.accessId ||
      field.changeIntent.authoringId !== snapshot.id ||
      field.changeIntent.fieldId !== field.id
    ) {
      throw new Error(
        `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has an invalid field contract.`,
      );
    }
    if (field.inputKind === "select") {
      const options = field.options ?? [];
      assertDistinctAccessIdentities(
        snapshot.id,
        "field options",
        options.map(({ id }) => id),
      );
      if (options.filter(({ selected }) => selected).length > 1) {
        throw new Error(
          `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has inconsistent field selection.`,
        );
      }
      if (options.some(({ selected, value }) => selected !== (value === field.value))) {
        throw new Error(
          `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has inconsistent field selection.`,
        );
      }
    } else if (field.options !== undefined) {
      throw new Error(
        `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has options on a non-select field.`,
      );
    }
  }

  const expectedGrantPurposes = ["roles", "memberships"] as const;
  snapshot.grantSelections.forEach((selection, index) => {
    if (selection.purpose !== expectedGrantPurposes[index]) {
      throw new Error(
        `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has invalid grant order.`,
      );
    }
    assertDistinctAccessIdentities(
      snapshot.id,
      "grant groups",
      selection.groups.map(({ id }) => id),
    );
    const options = selection.groups.flatMap((group) =>
      group.options.map((option) => ({ group, option })),
    );
    assertDistinctAccessIdentities(
      snapshot.id,
      "grant options",
      options.map(({ option }) => option.id),
    );
    const selectedOptionIds = options
      .filter(({ option }) => option.selected)
      .map(({ option }) => option.id);
    if (!semanticallyEqual(selection.selectedOptionIds, selectedOptionIds)) {
      throw new Error(
        `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has inconsistent grant selection.`,
      );
    }
    for (const { group, option } of options) {
      const intent = option.selectionIntent;
      if (
        intent.accessId !== snapshot.accessId ||
        intent.authoringId !== snapshot.id ||
        intent.controlId !== selection.id ||
        intent.groupId !== group.id ||
        intent.optionId !== option.id ||
        intent.selected === option.selected
      ) {
        throw new Error(
          `Formless UI access invitation authoring ${JSON.stringify(snapshot.id)} has an invalid grant-selection intent.`,
        );
      }
    }
  });
}

function assertAccessActionIdentity(action: FormlessUiAccessActionContract, accessId: string) {
  if (
    action.intent.accessId !== accessId ||
    action.intent.actionId !== action.id ||
    action.intent.controlId !== action.control.id
  ) {
    throw new Error(`Formless UI access action ${JSON.stringify(action.id)} has invalid identity.`);
  }
}

function assertDistinctAccessIdentities(
  ownerId: string,
  identityKind: string,
  identities: readonly string[],
) {
  if (new Set(identities).size !== identities.length) {
    throw new Error(
      `Formless UI access contract ${JSON.stringify(ownerId)} has duplicate ${identityKind} identities.`,
    );
  }
}

function assertAuthSurfaceContract(snapshot: FormlessUiAuthSurfaceContract) {
  const fieldIds = new Set<string>();
  for (const authField of snapshot.fields) {
    const { field, intent, purpose } = authField;
    if (fieldIds.has(field.fieldId)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has duplicate field identities.`,
      );
    }
    fieldIds.add(field.fieldId);

    if (
      intent.surfaceId !== snapshot.id ||
      intent.fieldId !== field.fieldId ||
      (purpose === "profile-input" && field.surface !== "operation") ||
      (purpose !== "profile-input" && field.surface !== "create") ||
      (purpose === "verification-token" && authField.autocomplete !== "one-time-code")
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid field contract.`,
      );
    }
  }

  const policyIds = new Set<string>();
  for (const policy of snapshot.policies) {
    if (policyIds.has(policy.id)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has duplicate policy identities.`,
      );
    }
    policyIds.add(policy.id);

    const intent = policy.selectionIntent;
    if (intent && (intent.surfaceId !== snapshot.id || intent.policyId !== policy.id)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid policy-selection intent.`,
      );
    }
  }

  const actionIds = new Set<string>();
  for (const action of snapshot.actions) {
    if (actionIds.has(action.id)) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has duplicate action identities.`,
      );
    }
    actionIds.add(action.id);

    const { intent } = action;
    if (
      intent.surfaceId !== snapshot.id ||
      intent.actionId !== action.id ||
      intent.controlId !== action.control.id
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid action intent.`,
      );
    }
  }

  if (snapshot.passkey?.availability === "available") {
    const { control, id, intent } = snapshot.passkey;
    if (
      intent.surfaceId !== snapshot.id ||
      intent.passkeyId !== id ||
      intent.controlId !== control.id
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid passkey intent.`,
      );
    }
  }

  if (snapshot.continuation) {
    const { control, destination, intent } = snapshot.continuation;
    if (
      intent.surfaceId !== snapshot.id ||
      intent.destinationId !== destination.id ||
      intent.controlId !== control.id
    ) {
      throw new Error(
        `Formless UI auth surface ${JSON.stringify(snapshot.id)} has an invalid continuation intent.`,
      );
    }
  }
}

function assertManagementInstallDialogContract(
  snapshot: FormlessUiManagementInstallDialogContract,
) {
  const { closeIntent, fields, packageOptions, selectedPackageOptionId, submitIntent } = snapshot;

  if (
    closeIntent.managementId !== snapshot.managementId ||
    closeIntent.dialogId !== snapshot.id ||
    closeIntent.open
  ) {
    throw new Error(
      `Formless UI management install dialog ${JSON.stringify(snapshot.id)} has an invalid close intent.`,
    );
  }

  if (
    submitIntent.managementId !== snapshot.managementId ||
    submitIntent.dialogId !== snapshot.id ||
    submitIntent.controlId !== snapshot.submit.id
  ) {
    throw new Error(
      `Formless UI management install dialog ${JSON.stringify(snapshot.id)} has an invalid submit intent.`,
    );
  }

  const fieldIds = new Set(Object.values(fields).map(({ fieldId }) => fieldId));
  if (fieldIds.size !== 3) {
    throw new Error(
      `Formless UI management install dialog ${JSON.stringify(snapshot.id)} requires distinct field identities.`,
    );
  }

  const optionIds = new Set<string>();
  for (const option of packageOptions) {
    if (optionIds.has(option.id)) {
      throw new Error(
        `Formless UI management install dialog ${JSON.stringify(snapshot.id)} has duplicate package options.`,
      );
    }
    optionIds.add(option.id);

    const intent = option.selectionIntent;
    if (
      intent.managementId !== snapshot.managementId ||
      intent.dialogId !== snapshot.id ||
      intent.fieldId !== fields.package.fieldId ||
      intent.optionId !== option.id
    ) {
      throw new Error(
        `Formless UI management install dialog ${JSON.stringify(snapshot.id)} has an invalid package-selection intent.`,
      );
    }
  }

  if (!optionIds.has(selectedPackageOptionId)) {
    throw new Error(
      `Formless UI management install dialog ${JSON.stringify(snapshot.id)} has no selected package option.`,
    );
  }

  for (const option of packageOptions) {
    if (option.selected !== (option.id === selectedPackageOptionId)) {
      throw new Error(
        `Formless UI management install dialog ${JSON.stringify(snapshot.id)} has inconsistent package selection.`,
      );
    }
  }
}

function assertDocumentThemeContract(snapshot: FormlessUiDocumentThemeContract) {
  if (snapshot.policy.kind === "fixed") {
    if (snapshot.activeMode !== snapshot.policy.mode || snapshot.selectionControl !== undefined) {
      throw new Error(
        `Fixed Formless UI document theme ${JSON.stringify(snapshot.id)} must use its policy mode and omit selection control.`,
      );
    }
    return;
  }

  const control = snapshot.selectionControl;
  if (!control) {
    throw new Error(
      `User-controlled Formless UI document theme ${JSON.stringify(snapshot.id)} requires a selection control.`,
    );
  }
  if (!control.options.some(({ mode }) => mode === control.selectedMode)) {
    throw new Error(
      `Formless UI document theme ${JSON.stringify(snapshot.id)} selection has no matching option.`,
    );
  }

  const modes = new Set<string>();
  for (const option of control.options) {
    if (modes.has(option.mode)) {
      throw new Error(
        `Formless UI document theme ${JSON.stringify(snapshot.id)} has duplicate mode options.`,
      );
    }
    modes.add(option.mode);

    if (
      option.selectionIntent.themeId !== snapshot.id ||
      option.selectionIntent.controlId !== control.id ||
      option.selectionIntent.mode !== option.mode
    ) {
      throw new Error(
        `Formless UI document theme ${JSON.stringify(snapshot.id)} has an invalid mode-selection intent.`,
      );
    }
  }
}

function mismatchedNodeError(reference: FormlessUiContractReference) {
  return new Error(
    `Formless UI contract snapshot does not match reference ${formlessUiContractReferenceKey(reference)}.`,
  );
}

function assertReferencesResolve(nodes: StoredContractNodes) {
  for (const node of nodes.values()) {
    if (node.snapshot.kind === "accessManifest") {
      if (node.snapshot.state !== "ready") {
        continue;
      }
      if (node.snapshot.authoring.accessId !== node.snapshot.id) {
        throw invalidScopedReferenceError(node.snapshot.authoring);
      }
      assertReferenceResolves(nodes, node.snapshot.authoring);
      continue;
    }

    if (node.snapshot.kind === "managementManifest") {
      if (node.snapshot.state !== "ready") {
        continue;
      }

      const manifest = node.snapshot;
      if (manifest.installDialog.managementId !== manifest.id) {
        throw invalidScopedReferenceError(manifest.installDialog);
      }
      assertReferenceResolves(nodes, manifest.installDialog);

      const expectedRoles = ["apps", "routes"] as const;
      manifest.workspaces.forEach((workspace, index) => {
        if (workspace.role !== expectedRoles[index]) {
          throw new Error(
            `Formless UI management manifest ${JSON.stringify(manifest.id)} has invalid workspace order.`,
          );
        }
        assertReferenceResolves(nodes, workspace.reference);
      });

      const authorizationPrompt = manifest.workspaceOperation?.authorizationPrompt;
      if (authorizationPrompt) {
        const intent = authorizationPrompt.intent;
        if (
          intent.managementId !== manifest.id ||
          intent.operationId !== manifest.workspaceOperation?.id ||
          intent.promptId !== authorizationPrompt.id ||
          intent.controlId !== authorizationPrompt.action.id
        ) {
          throw new Error(
            `Formless UI management manifest ${JSON.stringify(manifest.id)} has an invalid authorization intent.`,
          );
        }
      }
      continue;
    }

    if (node.snapshot.kind === "shellManifest") {
      const manifest = node.snapshot;
      for (const sectionReference of manifest.navigationSections) {
        if (sectionReference.shellId !== manifest.id) {
          throw invalidScopedReferenceError(sectionReference);
        }
        assertReferenceResolves(nodes, sectionReference);
      }

      const activeDestination = manifest.activeDestination;
      if (activeDestination) {
        const sectionReference = manifest.navigationSections.find(
          ({ sectionId }) => sectionId === activeDestination.sectionId,
        );
        const section = sectionReference
          ? snapshotForReference(nodes, sectionReference)
          : undefined;
        if (
          !section ||
          !section.destinations.some(({ id }) => id === activeDestination.destinationId)
        ) {
          throw new Error(
            `Formless UI shell active destination ${JSON.stringify(activeDestination)} has no snapshot.`,
          );
        }
      }
      continue;
    }

    if (node.snapshot.kind === "workspaceManifest") {
      for (const sectionReference of node.snapshot.sections) {
        if (sectionReference.workspaceId !== node.snapshot.id) {
          throw invalidScopedReferenceError(sectionReference);
        }
        assertReferenceResolves(nodes, sectionReference);
      }
      continue;
    }

    if (node.snapshot.kind === "workspaceSectionShell") {
      const { presentation } = node.snapshot.collection;
      const sectionNode = node as StoredContractNode & {
        reference: FormlessUiWorkspaceSectionShellReference;
      };
      assertWorkspaceResultScope(sectionNode.reference, presentation.result);
      assertReferenceResolves(nodes, presentation.result);
      if (presentation.contextDetail) {
        assertWorkspaceResultScope(sectionNode.reference, presentation.contextDetail);
        assertReferenceResolves(nodes, presentation.contextDetail);
      }
    }
  }
}

function assertWorkspaceResultScope(
  sectionReference: FormlessUiWorkspaceSectionShellReference,
  resultReference: FormlessUiContractReference,
) {
  if (
    !("workspaceId" in resultReference) ||
    !("sectionId" in resultReference) ||
    resultReference.workspaceId !== sectionReference.workspaceId ||
    resultReference.sectionId !== sectionReference.sectionId
  ) {
    throw invalidScopedReferenceError(resultReference);
  }
}

function invalidScopedReferenceError(reference: FormlessUiContractReference) {
  return new Error(
    `Formless UI contract reference ${formlessUiContractReferenceKey(reference)} has an invalid parent scope.`,
  );
}

function assertReferenceResolves(
  nodes: StoredContractNodes,
  reference: FormlessUiContractReference,
) {
  if (!nodes.has(formlessUiContractReferenceKey(reference))) {
    throw new Error(
      `Formless UI contract reference ${formlessUiContractReferenceKey(reference)} has no snapshot.`,
    );
  }
}

function changedReferenceKeys(previous: StoredContractNodes, next: StoredContractNodes) {
  const changed = new Set<string>();

  for (const [key, previousNode] of previous) {
    if (next.get(key)?.snapshot !== previousNode.snapshot) {
      changed.add(key);
    }
  }

  for (const key of next.keys()) {
    if (!previous.has(key)) {
      changed.add(key);
    }
  }

  return changed;
}

function semanticallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isObject(left) || !isObject(right)) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => semanticallyEqual(value, right[index]));
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key, index) => key !== rightKeys[index])
  ) {
    return false;
  }

  return leftKeys.every((key) => semanticallyEqual(left[key], right[key]));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
