import rawSiteSourceSchema from "../schema.json";

import { describe, expect, it } from "vite-plus/test";

import { SITE_PUBLIC_BLOCK_TYPES } from "./public-block-types.ts";

describe("Site public block types", () => {
  it("matches the block type enum in the source schema", () => {
    const blockTypeField = rawSiteSourceSchema.entities.block.fields.type;

    expect(blockTypeField.type).toBe("enum");
    expect(Object.keys(blockTypeField.values)).toEqual(SITE_PUBLIC_BLOCK_TYPES);
  });
});
