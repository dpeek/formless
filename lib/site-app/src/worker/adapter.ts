import type { AppSchema } from "@dpeek/formless-schema";

import { buildSitePageTree } from "../tree.ts";
import type { SitePageTree, StoredRecord } from "../types.ts";
import type {
  PublicSiteDocumentRenderInput,
  PublicSiteDocumentRenderResponse,
} from "./site-ssr.tsx";
import type { PublicSiteIconRenderInput } from "./site-icons.ts";
import {
  renderPublishedSiteIndexingResponse,
  type PublicSiteIndexingRenderInput,
} from "./public-indexing.ts";

type PublicSiteWorkerTreeInput = {
  records: StoredRecord[];
  schema: AppSchema;
  slug: string;
  target?: { apiRoutePrefix: `/${string}` };
  turnstileSiteKey?: string;
};

type SitePublicWorkerAdapter = {
  buildPublicTree(input: PublicSiteWorkerTreeInput): { tree: SitePageTree | null };
  renderDocument(input: PublicSiteDocumentRenderInput): Promise<PublicSiteDocumentRenderResponse>;
  renderIcon(input: PublicSiteIconRenderInput): Promise<Response>;
  renderIndexing(input: PublicSiteIndexingRenderInput): Response;
};

export const sitePublicWorkerAdapter = {
  buildPublicTree(input) {
    return buildSitePageTree(input.schema, input.records, input.slug, {
      target: input.target,
      turnstileSiteKey: input.turnstileSiteKey,
    });
  },
  async renderDocument(input) {
    const { renderPublishedSiteDocumentResponse } = await import("./site-ssr.tsx");

    return renderPublishedSiteDocumentResponse(input);
  },
  async renderIcon(input) {
    const { renderSiteIconResponse } = await import("./site-icons.ts");

    return renderSiteIconResponse(input);
  },
  renderIndexing(input) {
    return renderPublishedSiteIndexingResponse(input);
  },
} satisfies SitePublicWorkerAdapter;
