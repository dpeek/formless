import { Button } from "@dpeek/formless-ui/button";
import { AddIcon } from "@dpeek/formless-ui/icons";
import type {
  FormlessUiActionTriggerContract,
  FormlessUiWorkspaceContract,
  FormlessUiWorkspaceIntentHandler,
  FormlessUiWorkspaceSectionContract,
} from "@dpeek/formless-astryx/contract";
import { projectGeneratedWorkspaceExternalActionIntent } from "./formless-ui-workspace-projection.ts";
import { LegacyWorkspaceCollectionRenderer } from "./legacy-workspace-collection-renderer.tsx";

export function LegacyWorkspaceScreenRenderer({
  onIntent,
  workspace,
}: {
  onIntent: FormlessUiWorkspaceIntentHandler;
  workspace: FormlessUiWorkspaceContract;
}) {
  if (workspace.sections.length === 0) {
    return null;
  }

  return (
    <div
      className={workspace.sections.length === 1 ? undefined : "space-y-8"}
      data-formless-legacy-workspace={workspace.id}
    >
      {workspace.sections.map((section) => (
        <LegacyWorkspaceSection
          key={section.id}
          onIntent={onIntent}
          screenId={workspace.id}
          section={section}
        />
      ))}
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
      <LegacyWorkspaceCollectionRenderer
        collection={section.collection}
        onIntent={onIntent}
        scope={scope}
      />
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
