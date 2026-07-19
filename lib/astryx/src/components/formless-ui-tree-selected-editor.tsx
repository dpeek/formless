import * as stylex from "@stylexjs/stylex";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type {
  FormlessUiField,
  FormlessUiFieldIntent,
  FormlessUiFieldSetContract,
  FormlessUiTreeIntentHandler,
  FormlessUiTreeItemContract,
  FormlessUiTreeResultContract,
  FormlessUiTreeSelectedEditorContract,
} from "../formless-ui-contract.ts";
import { FormlessUiFieldRenderer } from "./fields/renderer.tsx";
import {
  AstryxTreeSelectedActions,
  AstryxTreeSelectedDiagnostics,
} from "./formless-ui-tree-actions.tsx";
import { AstryxTreeChildCreation } from "./formless-ui-tree-child-creation.tsx";

export function AstryxTreeSelectedEditor({
  editor,
  onIntent,
  selectedItem,
  tree,
}: {
  editor: FormlessUiTreeSelectedEditorContract | undefined;
  onIntent: FormlessUiTreeIntentHandler;
  selectedItem: FormlessUiTreeItemContract | undefined;
  tree: FormlessUiTreeResultContract;
}) {
  if (!editor) {
    return (
      <Card data-formless-astryx-tree-editor-empty={tree.id} padding={5} width="100%">
        <EmptyState headingLevel={2} isCompact title="Select an item to edit." />
      </Card>
    );
  }

  return (
    <Card
      aria-label={editor.accessibilityLabel}
      data-formless-astryx-tree-editor={editor.id}
      padding={5}
      width="100%"
    >
      <VStack gap={5} width="100%">
        <VStack gap={1} width="100%">
          <Heading level={2}>{selectedItem?.label ?? tree.root.label}</Heading>
          {selectedItem ? <AstryxTreeSelectedItemFacts item={selectedItem} /> : null}
        </VStack>
        <AstryxTreeSelectedDiagnostics editor={editor} item={selectedItem} />
        <AstryxTreeSelectedActions
          editor={editor}
          item={selectedItem}
          onIntent={onIntent}
          resultId={tree.id}
        />
        <AstryxTreeFieldSet
          editor={editor}
          fieldSet={editor.placementFields}
          kind="placement"
          onIntent={onIntent}
          resultId={tree.id}
        />
        {editor.childFields ? (
          <AstryxTreeFieldSet
            editor={editor}
            fieldSet={editor.childFields}
            kind="child"
            onIntent={onIntent}
            resultId={tree.id}
          />
        ) : null}
        {editor.childCreation ? (
          <AstryxTreeChildCreation
            creation={editor.childCreation}
            onIntent={onIntent}
            parent={{ itemId: editor.itemId, kind: "item" }}
            resultId={tree.id}
          />
        ) : null}
      </VStack>
    </Card>
  );
}

function AstryxTreeSelectedItemFacts({ item }: { item: FormlessUiTreeItemContract }) {
  const facts = [item.variant?.label, item.slot?.label].filter(Boolean).join(" · ");

  return facts ? (
    <Text color="secondary" display="block" type="supporting">
      {facts}
    </Text>
  ) : null;
}

export function AstryxTreeFieldSet({
  editor,
  fieldSet,
  kind,
  onIntent,
  resultId,
}: {
  editor: FormlessUiTreeSelectedEditorContract;
  fieldSet: FormlessUiFieldSetContract;
  kind: "child" | "placement";
  onIntent: FormlessUiTreeIntentHandler;
  resultId: string;
}) {
  const label = fieldSet.label ?? (kind === "placement" ? "Placement" : "Child");
  const headingId = `${fieldSet.id}:heading`;

  return (
    <Card
      aria-labelledby={headingId}
      data-formless-astryx-tree-field-set={fieldSet.id}
      data-formless-astryx-tree-field-set-kind={kind}
      padding={4}
      role="region"
      variant="muted"
      width="100%"
    >
      <VStack gap={3} width="100%">
        <Heading id={headingId} level={3}>
          {label}
        </Heading>
        {fieldSet.disabledReason ? (
          <Text color="secondary" display="block" role="status" type="supporting">
            {fieldSet.disabledReason}
          </Text>
        ) : null}
        <fieldset
          aria-labelledby={headingId}
          disabled={fieldSet.disabled}
          title={fieldSet.disabledReason}
          {...stylex.props(styles.fieldSet)}
        >
          <FormLayout direction="vertical">
            {fieldSet.fields.map((field) => (
              <FormlessUiFieldRenderer
                field={field}
                key={field.fieldId}
                onIntent={(intent) =>
                  dispatchAstryxTreeFieldIntent(
                    onIntent,
                    resultId,
                    editor,
                    fieldSet,
                    kind,
                    field,
                    intent,
                  )
                }
              />
            ))}
          </FormLayout>
        </fieldset>
        {fieldSet.errors?.map((error) => (
          <FieldStatus key={error} message={error} type="error" variant="detached" />
        ))}
      </VStack>
    </Card>
  );
}

export function dispatchAstryxTreeFieldIntent(
  onIntent: FormlessUiTreeIntentHandler,
  resultId: string,
  editor: FormlessUiTreeSelectedEditorContract,
  fieldSet: FormlessUiFieldSetContract,
  kind: "child" | "placement",
  field: FormlessUiField,
  intent: FormlessUiFieldIntent,
) {
  return onIntent({
    fieldId: field.fieldId,
    intent,
    resultId,
    target: {
      fieldSetId: fieldSet.id,
      itemId: editor.itemId,
      kind,
    },
    type: "treeField",
  });
}

const styles = stylex.create({
  fieldSet: {
    borderWidth: 0,
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
});
