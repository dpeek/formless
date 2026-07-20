import { DropdownMenu, type DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  CreateIntent,
  FieldIntent,
  TreeChildCreationContract,
  TreeChildVariantContract,
  TreeIntentHandler,
  TreeParentIdentity,
} from "@dpeek/formless-presentation/contract";
import { AstryxCreateSurfaceRenderer } from "./create-renderer.tsx";

export function AstryxTreeChildCreation({
  creation,
  onIntent,
  parent,
  resultId,
}: {
  creation: TreeChildCreationContract;
  onIntent: TreeIntentHandler;
  parent: TreeParentIdentity;
  resultId: string;
}) {
  const surface = creation.activeCreateSurface;

  return (
    <VStack
      aria-label={creation.accessibilityLabel}
      data-formless-astryx-tree-child-creation={creation.id}
      gap={2}
      role="group"
      width="100%"
    >
      <DropdownMenu
        button={{
          children: "Add child",
          isDisabled: creation.variants.every((variant) => !variant.availability.available),
          label: creation.accessibilityLabel,
          variant: "secondary",
        }}
        items={astryxTreeChildVariantMenuItems(creation, onIntent)}
      />
      {surface ? (
        <AstryxCreateSurfaceRenderer
          onFieldIntent={(fieldId, intent) =>
            dispatchAstryxTreeCreateFieldIntent(
              onIntent,
              resultId,
              parent,
              surface.id,
              fieldId,
              intent,
            )
          }
          onIntent={(intent) =>
            dispatchAstryxTreeCreateIntent(onIntent, resultId, parent, surface.id, intent)
          }
          renderTrigger={false}
          surface={surface}
        />
      ) : null}
    </VStack>
  );
}

export function astryxTreeChildVariantMenuItems(
  creation: TreeChildCreationContract,
  onIntent: TreeIntentHandler,
): DropdownMenuOption[] {
  return creation.variants.map((variant) => ({
    isDisabled: !variant.availability.available,
    label: astryxTreeChildVariantLabel(variant),
    onClick: () => dispatchAstryxTreeChildVariantSelection(onIntent, variant),
  }));
}

export function dispatchAstryxTreeChildVariantSelection(
  onIntent: TreeIntentHandler,
  variant: TreeChildVariantContract,
) {
  if (!variant.availability.available) {
    return;
  }

  return onIntent(variant.selectionIntent);
}

export function dispatchAstryxTreeCreateIntent(
  onIntent: TreeIntentHandler,
  resultId: string,
  parent: TreeParentIdentity,
  surfaceId: string,
  intent: CreateIntent,
) {
  return onIntent({ intent, parent, resultId, surfaceId, type: "treeCreate" });
}

export function dispatchAstryxTreeCreateFieldIntent(
  onIntent: TreeIntentHandler,
  resultId: string,
  parent: TreeParentIdentity,
  surfaceId: string,
  fieldId: string,
  intent: FieldIntent,
) {
  return onIntent({
    fieldId,
    intent,
    resultId,
    target: { kind: "create", parent, surfaceId },
    type: "treeField",
  });
}

function astryxTreeChildVariantLabel(variant: TreeChildVariantContract) {
  return variant.slot ? `${variant.label} · ${variant.slot.label}` : variant.label;
}
