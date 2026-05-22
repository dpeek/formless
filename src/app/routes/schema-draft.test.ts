import { describe, expect, it } from "vite-plus/test";
import {
  commitSchemaRouteDraftState,
  createSchemaRouteDraftState,
  isSchemaRouteDraftDirty,
  revertSchemaRouteDraftState,
  serializeSchemaRouteDraftForSave,
  updateSchemaRouteSourceText,
} from "./schema-draft.ts";
import { stringifySchema, type AppSchema } from "../../shared/schema.ts";
import { taskSourceSchema as appSchema } from "../../test/schema-apps.ts";

describe("schema route draft state", () => {
  it("starts clean from the saved schema source", () => {
    const state = createSchemaRouteDraftState(appSchema);

    expect(isSchemaRouteDraftDirty(state)).toBe(false);
    expect(state.sourceError).toBeNull();
    expect(state.sourceText).toBe(stringifySchema(appSchema));
  });

  it("updates the draft from valid Source edits", () => {
    const state = createSchemaRouteDraftState(appSchema);
    const nextSchema: AppSchema = {
      ...appSchema,
      entities: {
        ...appSchema.entities,
        task: {
          ...appSchema.entities.task,
          label: "Work item",
        },
      },
    };
    const nextState = updateSchemaRouteSourceText(state, stringifySchema(nextSchema));
    const saveResult = serializeSchemaRouteDraftForSave(nextState);

    expect(nextState.sourceError).toBeNull();
    expect(isSchemaRouteDraftDirty(nextState)).toBe(true);
    expect(saveResult).toMatchObject({
      ok: true,
      schema: {
        entities: {
          task: {
            label: "Work item",
          },
        },
      },
    });
  });

  it("keeps the last valid draft and blocks save for invalid Source edits", () => {
    const state = createSchemaRouteDraftState(appSchema);
    const invalidState = updateSchemaRouteSourceText(state, "{");
    const saveResult = serializeSchemaRouteDraftForSave(invalidState);

    expect(invalidState.sourceError).toContain("JSON");
    expect(invalidState.draft.schema).toEqual(appSchema);
    expect(isSchemaRouteDraftDirty(invalidState)).toBe(true);
    expect(saveResult).toMatchObject({
      ok: false,
    });
    expect(saveResult.ok === false ? saveResult.message : "").toContain("Source schema is invalid");
  });

  it("reverts Source edits and commits saved schema after save", () => {
    const state = createSchemaRouteDraftState(appSchema);
    const nextSchema: AppSchema = {
      ...appSchema,
      version: 2,
    };
    const editedState = updateSchemaRouteSourceText(state, stringifySchema(nextSchema));
    const revertedState = revertSchemaRouteDraftState(editedState);
    const committedState = commitSchemaRouteDraftState(nextSchema);

    expect(isSchemaRouteDraftDirty(editedState)).toBe(true);
    expect(isSchemaRouteDraftDirty(revertedState)).toBe(false);
    expect(revertedState.sourceText).toBe(stringifySchema(appSchema));
    expect(isSchemaRouteDraftDirty(committedState)).toBe(false);
    expect(committedState.sourceText).toBe(stringifySchema(nextSchema));
  });
});
