import { FormlessAuthority } from "./authority.ts";
import { findSchemaAppDefinition } from "../shared/schema-apps.ts";

export { FormlessAuthority } from "./authority.ts";

export type Env = {
  FORMLESS_AUTHORITY: DurableObjectNamespace<FormlessAuthority>;
};

export default {
  fetch(request, env) {
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
