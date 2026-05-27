import type {
  CreateDefaultConfig,
  CreateFieldConfig,
  CreateUnionPresentationConfig,
} from "../../client/views.ts";
import {
  createDefaultsAreResolved,
  initialCreateDiscriminatorValue,
  resolveCreateValues as resolveCreateDefaultValues,
  selectCreateFieldsForDiscriminator,
  selectCreateFieldsForInputValues,
} from "../../shared/create-defaults.ts";
import type { RecordValues } from "../../shared/protocol.ts";
import type { QueryEvaluationContext } from "../../shared/query.ts";
import type { FieldVisibilityValue } from "../../shared/schema.ts";

export type GeneratedCreateFieldAuthoringState = {
  discriminatorValue: string | undefined;
  inputValues: Record<string, FieldVisibilityValue>;
};

export type GeneratedCreateFieldAuthoringFacts = {
  canSubmit: boolean;
  defaultsResolved: boolean;
  visibleFields: CreateFieldConfig[];
};

export function initialGeneratedCreateFieldAuthoringState({
  defaults = [],
  union,
}: {
  defaults?: CreateDefaultConfig[];
  union?: CreateUnionPresentationConfig;
}): GeneratedCreateFieldAuthoringState {
  return {
    discriminatorValue: initialCreateDiscriminatorValue(union, defaults),
    inputValues: {},
  };
}

export function selectGeneratedCreateFieldAuthoring({
  defaults = [],
  enabled,
  fields,
  queryContext,
  state,
  union,
}: {
  defaults?: CreateDefaultConfig[];
  enabled: boolean;
  fields: CreateFieldConfig[];
  queryContext?: QueryEvaluationContext;
  state: GeneratedCreateFieldAuthoringState;
  union?: CreateUnionPresentationConfig;
}): GeneratedCreateFieldAuthoringFacts {
  const defaultsResolved = createDefaultsAreResolved(defaults, queryContext);

  return {
    canSubmit: enabled && defaultsResolved,
    defaultsResolved,
    visibleFields: selectCreateFieldsForInputValues(
      selectCreateFieldsForDiscriminator(fields, union, state.discriminatorValue),
      state.inputValues,
    ),
  };
}

export function nextGeneratedCreateFieldAuthoringState({
  fieldName,
  state,
  union,
  value,
}: {
  fieldName: string;
  state: GeneratedCreateFieldAuthoringState;
  union?: CreateUnionPresentationConfig;
  value: FieldVisibilityValue;
}): GeneratedCreateFieldAuthoringState {
  return {
    discriminatorValue:
      fieldName === union?.discriminatorFieldName ? String(value) : state.discriminatorValue,
    inputValues: {
      ...state.inputValues,
      [fieldName]: value,
    },
  };
}

export function resolveGeneratedCreateValues({
  defaults = [],
  fields,
  formData,
  queryContext,
  union,
}: {
  defaults?: CreateDefaultConfig[];
  fields: CreateFieldConfig[];
  formData: FormData;
  queryContext?: QueryEvaluationContext;
  union?: CreateUnionPresentationConfig;
}): RecordValues {
  return resolveCreateDefaultValues({
    defaults,
    fields,
    formData,
    queryContext,
    union,
  });
}
