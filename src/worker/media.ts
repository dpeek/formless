// Compatibility shim for pre-extraction Worker Media route imports.
// New code imports the Media Worker package subpath directly.
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
  handleMediaRequest as handleMediaPackageRequest,
  mediaObjectStoreFromR2Bucket,
} from "@dpeek/formless-media/worker";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { resolveWorkerRuntimeRequestTopology, type WorkerRuntimeRouteInput } from "./routing.ts";

export const SITE_IMAGE_UPLOAD_MAX_BYTES = MEDIA_IMAGE_UPLOAD_MAX_BYTES;
export const SITE_MEDIA_CACHE_CONTROL = MEDIA_OBJECT_CACHE_CONTROL;
export { CORE_IMAGE_KEY_PREFIX, CORE_MEDIA_ROUTE_PREFIX };

type MediaEnv = AuthorityAdminGuardEnv & {
  FORMLESS_MEDIA: R2Bucket;
};

export async function handleMediaRequest(
  request: Request,
  env: MediaEnv,
  runtimeProfile: WorkerRuntimeRouteInput = {},
) {
  const { pathname } = resolveWorkerRuntimeRequestTopology(request, runtimeProfile);

  return handleMediaPackageRequest(request, {
    authorizeWrite: (writeRequest) => authorizeInstanceWrite(writeRequest, env),
    pathname,
    provider: "r2",
    store: mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
  });
}
