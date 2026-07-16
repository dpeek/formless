import { Button } from "@dpeek/formless-ui/button";
import { AddIcon } from "@dpeek/formless-ui/icons";
import { memo, type ReactNode, useMemo } from "react";
import type {
  FormlessUiActionTriggerContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceIntentScope,
  FormlessUiWorkspaceLinkActionContract,
  FormlessUiWorkspaceManifestContract,
  FormlessUiWorkspaceManifestReference,
  FormlessUiWorkspaceSectionContract,
  FormlessUiWorkspaceSectionShellContract,
  FormlessUiWorkspaceSectionShellReference,
} from "@dpeek/formless-astryx/contract";
import {
  useFormlessUiWorkspaceIntentHandler,
  useFormlessUiWorkspaceManifest,
  useFormlessUiWorkspaceSectionShell,
} from "@dpeek/formless-astryx/contract-host/react";
import { projectGeneratedWorkspaceExternalActionIntent } from "./formless-ui-workspace-projection.ts";
import {
  LegacySubscribedWorkspaceCollectionRenderer,
  LegacyWorkspaceCollectionRenderer,
} from "./legacy-workspace-collection-renderer.tsx";

export function LegacyWorkspaceScreenRenderer({
  onIntent,
  workspace,
}: {
  onIntent: FormlessUiWorkspaceIntentHandler;
  workspace: FormlessUiWorkspaceContract;
}) {
  if (workspace.sections.length === 0 && workspace.actions.length === 0) {
    return null;
  }

  return (
    <LegacyWorkspaceFrame workspace={workspace}>
      {workspace.sections.map((section) => (
        <LegacyWorkspaceSection
          key={section.id}
          onIntent={onIntent}
          screenId={workspace.id}
          section={section}
        />
      ))}
    </LegacyWorkspaceFrame>
  );
}

export const LegacySubscribedWorkspaceScreenRenderer = memo(
  function LegacySubscribedWorkspaceScreenRenderer({
    reference,
  }: {
    reference: FormlessUiWorkspaceManifestReference;
  }) {
    const workspace = useFormlessUiWorkspaceManifest(reference);

    if (!workspace || (workspace.sections.length === 0 && workspace.actions.length === 0)) {
      return null;
    }

    return (
      <LegacyWorkspaceFrame workspace={workspace}>
        {workspace.sections.map((sectionReference) => (
          <LegacySubscribedWorkspaceSection
            key={`${sectionReference.workspaceId}:${sectionReference.sectionId}`}
            reference={sectionReference}
          />
        ))}
      </LegacyWorkspaceFrame>
    );
  },
  (previous, next) => previous.reference.workspaceId === next.reference.workspaceId,
);

function LegacyWorkspaceFrame({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace: FormlessUiWorkspaceContract | FormlessUiWorkspaceManifestContract;
}) {
  return (
    <div
      className={workspace.sections.length === 1 ? undefined : "space-y-8"}
      data-formless-legacy-workspace={workspace.id}
    >
      <LegacyWorkspaceLinkActions actions={workspace.actions} />
      {children}
    </div>
  );
}

export function LegacyWorkspaceLinkActions({
  actions,
}: {
  actions: readonly FormlessUiWorkspaceLinkActionContract[];
}) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex justify-end gap-2">
      {actions.map((action) => {
        const opensInNewTab = action.target === "newTab";

        return (
          <a
            aria-label={action.accessibilityLabel}
            className={
              action.prominence === "primary"
                ? "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                : "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
            }
            data-formless-legacy-workspace-link-action={action.id}
            href={action.href}
            key={action.id}
            rel={opensInNewTab ? "noopener noreferrer" : undefined}
            target={opensInNewTab ? "_blank" : undefined}
          >
            {action.label}
          </a>
        );
      })}
    </div>
  );
}

function LegacyWorkspaceSection({
  onIntent,
  screenId,
  section,
}: {
  onIntent: FormlessUiWorkspaceIntentHandler;
  screenId: string;
  section: FormlessUiWorkspaceSectionContract;
}) {
  const scope = {
    collectionId: section.collection.id,
    screenId,
    sectionId: section.id,
  };

  return (
    <LegacyWorkspaceSectionFrame onIntent={onIntent} scope={scope} section={section}>
      <LegacyWorkspaceCollectionRenderer
        collection={section.collection}
        onIntent={onIntent}
        scope={scope}
      />
    </LegacyWorkspaceSectionFrame>
  );
}

const LegacySubscribedWorkspaceSection = memo(
  function LegacySubscribedWorkspaceSection({
    reference,
  }: {
    reference: FormlessUiWorkspaceSectionShellReference;
  }) {
    const onIntent = useFormlessUiWorkspaceIntentHandler();
    const section = useFormlessUiWorkspaceSectionShell(reference);
    const scope = useMemo(
      () =>
        section
          ? {
              collectionId: section.collection.id,
              screenId: reference.workspaceId,
              sectionId: reference.sectionId,
            }
          : undefined,
      [reference.sectionId, reference.workspaceId, section?.collection.id],
    );

    if (!section || !scope) {
      return null;
    }

    return (
      <LegacyWorkspaceSectionFrame onIntent={onIntent} scope={scope} section={section}>
        <LegacySubscribedWorkspaceCollectionRenderer
          collection={section.collection}
          scope={scope}
        />
      </LegacyWorkspaceSectionFrame>
    );
  },
  (previous, next) =>
    previous.reference.workspaceId === next.reference.workspaceId &&
    previous.reference.sectionId === next.reference.sectionId,
);

function LegacyWorkspaceSectionFrame({
  children,
  onIntent,
  scope,
  section,
}: {
  children: ReactNode;
  onIntent: FormlessUiWorkspaceIntentHandler;
  scope: FormlessUiWorkspaceIntentScope;
  section: FormlessUiWorkspaceSectionContract | FormlessUiWorkspaceSectionShellContract;
}) {
  const renderHeader = section.headingVisibility === "visible" || section.actions.length > 0;

  return (
    <section
      aria-label={section.accessibilityLabel}
      className={renderHeader ? "space-y-4" : undefined}
    >
      {renderHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {section.headingVisibility === "visible" ? (
            <h2 className="text-lg font-semibold">{section.label}</h2>
          ) : (
            <span />
          )}
          {section.actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {section.actions.map(({ action, id }) => (
                <LegacyWorkspaceExternalAction
                  action={action}
                  key={id}
                  onInvoke={() =>
                    onIntent(
                      projectGeneratedWorkspaceExternalActionIntent(scope, id, action.invoke),
                    )
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function LegacyWorkspaceExternalAction({
  action,
  onInvoke,
}: {
  action: FormlessUiActionTriggerContract;
  onInvoke: () => Promise<void> | void;
}) {
  return (
    <span title={action.disabledReason}>
      <Button
        aria-label={action.accessibilityLabel ?? action.label}
        data-formless-workspace-external-action={action.id}
        intent={
          action.intent === "danger"
            ? "danger"
            : action.intent === "primary"
              ? "primary"
              : "outline"
        }
        isDisabled={action.disabled}
        onPress={() => void onInvoke()}
        size="sm"
        type="button"
      >
        {action.icon === "add" ? <AddIcon aria-hidden="true" /> : null}
        {action.label}
      </Button>
    </span>
  );
}
