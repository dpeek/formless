import { Button } from "@dpeek/formless-ui/button";
import { Fieldset, fieldErrorStyles } from "@dpeek/formless-ui/field";
import { AddIcon } from "@dpeek/formless-ui/icons";
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import type {
  FormlessUiButtonContent,
  FormlessUiButtonContract,
  FormlessUiCreateFormContract,
  FormlessUiCreateIntentHandler,
  FormlessUiCreateSurfaceContract,
  FormlessUiFieldIntentHandler,
  FormlessUiSemanticIconId,
} from "@dpeek/formless-astryx/contract";
import { GeneratedCreateFieldControl } from "./create-field-control.tsx";

export function LegacyGeneratedCreateSurface({
  onCreateIntent,
  onFieldIntent,
  renderDialog = true,
  renderTrigger = true,
  surface,
}: {
  onCreateIntent: FormlessUiCreateIntentHandler;
  onFieldIntent: FormlessUiFieldIntentHandler;
  renderDialog?: boolean;
  renderTrigger?: boolean;
  surface: FormlessUiCreateSurfaceContract;
}) {
  return (
    <>
      {renderTrigger ? (
        <LegacyGeneratedCreateTrigger onCreateIntent={onCreateIntent} surface={surface} />
      ) : null}
      {renderDialog && surface.dialog.open ? (
        <ModalContent
          isOpen={surface.dialog.open}
          onOpenChange={(open) =>
            onCreateIntent({ open, surfaceId: surface.id, type: "createOpenChange" })
          }
        >
          <ModalHeader>
            <ModalTitle>{surface.dialog.title}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <LegacyGeneratedCreateForm
              form={surface.dialog.form}
              onCreateIntent={onCreateIntent}
              onFieldIntent={onFieldIntent}
              surfaceId={surface.id}
            />
          </ModalBody>
        </ModalContent>
      ) : null}
    </>
  );
}

export function LegacyGeneratedCreateTrigger({
  onCreateIntent,
  surface,
}: {
  onCreateIntent: FormlessUiCreateIntentHandler;
  surface: FormlessUiCreateSurfaceContract;
}) {
  const trigger = surface.trigger;

  return (
    <span title={trigger.disabledReason}>
      <Button
        aria-label={trigger.accessibilityLabel}
        data-formless-create-trigger={surface.id}
        intent={legacyButtonIntent(trigger)}
        isDisabled={trigger.disabled}
        onPress={() =>
          onCreateIntent({ open: true, surfaceId: surface.id, type: "createOpenChange" })
        }
        size={legacyButtonSize(trigger)}
        type="button"
      >
        <LegacyButtonContent content={trigger.content} />
      </Button>
    </span>
  );
}

export function LegacyGeneratedCreateForm({
  form,
  heading,
  onCreateIntent,
  onFieldIntent,
  surfaceId,
}: {
  form: FormlessUiCreateFormContract;
  heading?: string;
  onCreateIntent: FormlessUiCreateIntentHandler;
  onFieldIntent: FormlessUiFieldIntentHandler;
  surfaceId: string;
}) {
  return (
    <form
      className="space-y-4"
      data-formless-create-form={surfaceId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void onCreateIntent({ surfaceId, type: "createSubmit" });
      }}
    >
      {heading ? <h2 className="text-lg font-medium">{heading}</h2> : null}
      {form.fieldSet.disabledReason ? (
        <p className="text-sm text-slate-600">{form.fieldSet.disabledReason}</p>
      ) : null}
      <Fieldset className="space-y-4" disabled={form.fieldSet.disabled}>
        {form.fieldSet.fields.map((field) => (
          <GeneratedCreateFieldControl
            field={field}
            key={field.fieldName}
            onIntent={onFieldIntent}
          />
        ))}
      </Fieldset>
      {form.errors.length > 0 ? (
        <div className="space-y-1" role="alert">
          {form.errors.map((error) => (
            <div className={fieldErrorStyles()} data-slot="field-error" key={error}>
              {error}
            </div>
          ))}
        </div>
      ) : null}
      <ModalFooter>
        <Button
          aria-label={form.cancel.accessibilityLabel}
          intent={legacyButtonIntent(form.cancel)}
          onPress={() => onCreateIntent({ open: false, surfaceId, type: "createOpenChange" })}
          size={legacyButtonSize(form.cancel)}
          type="button"
        >
          <LegacyButtonContent content={form.cancel.content} />
        </Button>
        <Button
          aria-label={form.submit.accessibilityLabel}
          intent={legacyButtonIntent(form.submit)}
          isDisabled={form.submit.disabled}
          size={legacyButtonSize(form.submit)}
          type="submit"
        >
          <LegacyButtonContent content={form.submit.content} />
        </Button>
      </ModalFooter>
    </form>
  );
}

function LegacyButtonContent({ content }: { content: FormlessUiButtonContent }) {
  if (content.kind === "label") {
    return content.label;
  }

  return (
    <>
      <LegacySemanticIcon icon={content.icon} />
      {content.kind === "iconAndLabel" ? content.label : null}
    </>
  );
}

function LegacySemanticIcon({ icon }: { icon: FormlessUiSemanticIconId }) {
  return icon === "add" ? <AddIcon aria-hidden="true" /> : null;
}

function legacyButtonIntent(button: FormlessUiButtonContract) {
  return button.prominence === "primary"
    ? undefined
    : button.prominence === "secondary"
      ? "outline"
      : "plain";
}

function legacyButtonSize(button: FormlessUiButtonContract) {
  return button.density === "compact" && button.content.kind === "iconOnly" ? "sq-xs" : undefined;
}
