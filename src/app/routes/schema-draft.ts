import {
  applySchemaBuilderIntent,
  createSchemaBuilderDraft,
  isSchemaBuilderDraftDirty,
  revertSchemaBuilderDraft,
  serializeSchemaBuilderDraft,
  validateSchemaBuilderDraft,
  type SchemaBuilderDraft,
  type SchemaBuilderIntent,
} from "../../client/schema-builder.ts";
import { parseAppSchema, stringifySchema, type AppSchema } from "../../shared/schema.ts";

export type SchemaRouteDraftState = {
  draft: SchemaBuilderDraft;
  sourceError: string | null;
  sourceText: string;
};

export type SchemaRouteDraftSaveResult =
  | {
      ok: true;
      schema: AppSchema;
    }
  | {
      message: string;
      ok: false;
    };

export type SchemaRouteDraftIntentResult =
  | {
      ok: true;
      state: SchemaRouteDraftState;
    }
  | {
      message: string;
      ok: false;
    };

export function createSchemaRouteDraftState(schema: AppSchema): SchemaRouteDraftState {
  const draft = createSchemaBuilderDraft(schema);

  return {
    draft,
    sourceError: null,
    sourceText: stringifySchema(draft.schema),
  };
}

export function commitSchemaRouteDraftState(schema: AppSchema): SchemaRouteDraftState {
  return createSchemaRouteDraftState(schema);
}

export function updateSchemaRouteSourceText(
  state: SchemaRouteDraftState,
  sourceText: string,
): SchemaRouteDraftState {
  try {
    const schema = parseAppSchema(JSON.parse(sourceText) as unknown);

    return {
      draft: {
        savedSchema: state.draft.savedSchema,
        schema,
      },
      sourceError: null,
      sourceText,
    };
  } catch (error) {
    return {
      ...state,
      sourceError: errorMessage(error),
      sourceText,
    };
  }
}

export function applySchemaRouteBuilderIntent(
  state: SchemaRouteDraftState,
  intent: SchemaBuilderIntent,
): SchemaRouteDraftIntentResult {
  try {
    const draft = applySchemaBuilderIntent(state.draft, intent);

    return {
      ok: true,
      state: {
        draft,
        sourceError: null,
        sourceText: stringifySchema(draft.schema),
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
    };
  }
}

export function revertSchemaRouteDraftState(state: SchemaRouteDraftState): SchemaRouteDraftState {
  const draft = revertSchemaBuilderDraft(state.draft);

  return {
    draft,
    sourceError: null,
    sourceText: stringifySchema(draft.schema),
  };
}

export function isSchemaRouteDraftDirty(state: SchemaRouteDraftState): boolean {
  if (state.sourceError !== null) {
    return state.sourceText !== stringifySchema(state.draft.savedSchema);
  }

  return isSchemaBuilderDraftDirty(state.draft);
}

export function serializeSchemaRouteDraftForSave(
  state: SchemaRouteDraftState,
): SchemaRouteDraftSaveResult {
  if (state.sourceError !== null) {
    return {
      ok: false,
      message: `Source schema is invalid. ${state.sourceError}`,
    };
  }

  const issues = validateSchemaBuilderDraft(state.draft);

  if (issues.length > 0) {
    return {
      ok: false,
      message: issues.map(formatValidationIssue).join("\n"),
    };
  }

  return {
    ok: true,
    schema: serializeSchemaBuilderDraft(state.draft),
  };
}

function formatValidationIssue(issue: ReturnType<typeof validateSchemaBuilderDraft>[number]) {
  if (issue.entityKey && issue.fieldKey) {
    return `${issue.entityKey}.${issue.fieldKey}: ${issue.message}`;
  }

  if (issue.entityKey) {
    return `${issue.entityKey}: ${issue.message}`;
  }

  return issue.message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Schema source is invalid.";
}
