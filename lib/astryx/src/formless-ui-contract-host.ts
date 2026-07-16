import type {
  FormlessUiContractIntent,
  FormlessUiContractIntentHandler,
  FormlessUiContractReference,
  FormlessUiListContract,
  FormlessUiListResultReference,
  FormlessUiRecordResultContract,
  FormlessUiRecordResultReference,
  FormlessUiResultReferenceRole,
  FormlessUiShellManifestContract,
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
  Reference extends FormlessUiWorkspaceManifestReference
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

export type FormlessUiContractHostNode =
  | FormlessUiListResultNode
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
    case "shellCreate":
    case "shellLogout":
    case "shellReset":
    case "shellRootRecordSelection":
      return false;
    default:
      return true;
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

function mismatchedNodeError(reference: FormlessUiContractReference) {
  return new Error(
    `Formless UI contract snapshot does not match reference ${formlessUiContractReferenceKey(reference)}.`,
  );
}

function assertReferencesResolve(nodes: StoredContractNodes) {
  for (const node of nodes.values()) {
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
