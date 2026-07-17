import type { AppSchema } from "@dpeek/formless-schema";

import type { SitePublicOperationTargetResolver } from "../public-operation-block-projection.ts";
import type { SitePublicRendererComponent } from "../public-renderer.ts";
import type { SitePublicSystemStateRendererComponent } from "../public-system-state.ts";
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
  publicOperationTargetResolver?: SitePublicOperationTargetResolver;
  target?: { apiRoutePrefix: `/${string}` };
  turnstileSiteKey?: string;
};

export type SitePublicWorkerAdapter = {
  buildPublicTree(input: PublicSiteWorkerTreeInput): { tree: SitePageTree | null };
  renderDocument(
    input: SitePublicWorkerDocumentRenderInput,
  ): Promise<PublicSiteDocumentRenderResponse>;
  renderIcon(input: PublicSiteIconRenderInput): Promise<Response>;
  renderIndexing(input: PublicSiteIndexingRenderInput): Response;
};

export type SitePublicWorkerDocumentRenderInput = Omit<
  PublicSiteDocumentRenderInput,
  "builtInRenderer" | "builtInSystemStateRenderer" | "workspaceRenderer"
>;

export type SitePublicWorkerAdapterOptions = {
  builtInRenderer: SitePublicRendererComponent;
  builtInSystemStateRenderer: SitePublicSystemStateRendererComponent;
  workspaceRenderer?: SitePublicRendererComponent;
};

export function createSitePublicWorkerAdapter(
  options: SitePublicWorkerAdapterOptions,
): SitePublicWorkerAdapter {
  return {
    buildPublicTree(input) {
      return buildSitePageTree(input.schema, input.records, input.slug, {
        publicOperationTargetResolver: input.publicOperationTargetResolver,
        target: input.target,
        turnstileSiteKey: input.turnstileSiteKey,
      });
    },
    async renderDocument(input) {
      const { renderPublishedSiteDocumentResponse } = await import("./site-ssr.tsx");

      return renderPublishedSiteDocumentResponse({
        ...input,
        builtInRenderer: options.builtInRenderer,
        builtInSystemStateRenderer: options.builtInSystemStateRenderer,
        workspaceRenderer: options.workspaceRenderer,
      });
    },
    async renderIcon(input) {
      const { renderSiteIconResponse } = await import("./site-icons.ts");

      return renderSiteIconResponse(input);
    },
    renderIndexing(input) {
      return renderPublishedSiteIndexingResponse(input);
    },
  };
}
