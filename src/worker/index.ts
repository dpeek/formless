import { FormlessAuthority } from "./authority.ts";

export { FormlessAuthority } from "./authority.ts";

export type Env = {
  FORMLESS_AUTHORITY: DurableObjectNamespace<FormlessAuthority>;
};

const AUTHORITY_NAME = "default";

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 404 });
    }

    const authorityId = env.FORMLESS_AUTHORITY.idFromName(AUTHORITY_NAME);
    const authority = env.FORMLESS_AUTHORITY.get(authorityId);

    return authority.fetch(request);
  },
} satisfies ExportedHandler<Env>;
