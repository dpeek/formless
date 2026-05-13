import { FormlessAuthority } from "./authority.ts";
import { findSchemaAppDefinition } from "../shared/schema-apps.ts";
import { handleSiteMediaRequest } from "./media.ts";

export { FormlessAuthority } from "./authority.ts";

export type Env = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace<FormlessAuthority>;
  FORMLESS_MEDIA: R2Bucket;
};

export default {
  async fetch(request, env) {
    const mediaResponse = await handleSiteMediaRequest(request, env);

    if (mediaResponse) {
      return mediaResponse;
    }

    const url = new URL(request.url);
    const app = parseApiSchemaApp(url.pathname);

    if (!app) {
      return new Response(null, { status: 404 });
    }

    const authorityId = env.FORMLESS_AUTHORITY.idFromName(app.key);
    const authority = env.FORMLESS_AUTHORITY.get(authorityId);

    return authority.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function parseApiSchemaApp(pathname: string) {
  const [apiSegment, schemaKey, routeSegment] = pathname.split("/").filter(Boolean);

  if (apiSegment !== "api" || !schemaKey || !routeSegment) {
    return undefined;
  }

  return findSchemaAppDefinition(schemaKey);
}
