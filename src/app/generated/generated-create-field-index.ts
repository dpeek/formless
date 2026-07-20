import type {
  FormlessUiCreateField,
  FormlessUiCreateSurfaceContract,
  FormlessUiFieldIntent,
} from "@dpeek/formless-presentation/contract";

export type GeneratedCreateFieldIndex = ReadonlyMap<string, FormlessUiCreateField>;

export function indexGeneratedCreateSurfaceFields(
  surface: FormlessUiCreateSurfaceContract,
): GeneratedCreateFieldIndex {
  const fieldsById = new Map<string, FormlessUiCreateField>();

  for (const field of surface.dialog.form.fieldSet.fields) {
    if (fieldsById.has(field.fieldId)) {
      throw new Error(
        `Generated create surface "${surface.id}" contains duplicate field occurrence "${field.fieldId}".`,
      );
    }
    fieldsById.set(field.fieldId, field);
  }

  return fieldsById;
}

export function resolveGeneratedCreateFieldIntent(
  fieldsById: GeneratedCreateFieldIndex,
  fieldId: string,
  intent: FormlessUiFieldIntent,
): FormlessUiCreateField | undefined {
  if (intent.type !== "createDraftChange") {
    return undefined;
  }

  const field = fieldsById.get(fieldId);
  return field?.fieldName === intent.fieldName ? field : undefined;
}
