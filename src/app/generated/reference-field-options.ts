import type { ReferenceOption } from "../../client/store.ts";
import type { FieldValue } from "@dpeek/formless-storage";
import { isSupportedIdentityReferenceTarget, type FieldSchema } from "@dpeek/formless-schema";

export const EMPTY_GENERATED_REFERENCE_OPTIONS: ReferenceOption[] = [];

export function shouldUseAppReplicaReferenceOptions(
  field: Extract<FieldSchema, { type: "reference" }>,
) {
  return !isSupportedIdentityReferenceTarget(field.to);
}

export function generatedReferenceDisplayLabel(
  value: FieldValue | undefined,
  options: readonly ReferenceOption[],
) {
  if (typeof value !== "string") {
    return "";
  }

  return options.find((option) => option.id === value)?.label ?? value;
}

export function generatedMissingReferenceOptionValue(
  value: string,
  options: readonly ReferenceOption[],
) {
  return value !== "" && !options.some((option) => option.id === value) ? value : null;
}
