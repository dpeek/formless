import { instanceControlPlanePreferredAdminOriginFromRecords } from "@dpeek/formless-instance-control-plane";

import {
  authAccountContinuationLocationForReturnTarget,
  type AuthSuccessContinuationTarget,
} from "../shared/instance-auth.ts";
import { isWorkersDevHost } from "../shared/runtime-topology.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";

type OwnerSetupContinuationEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export async function ownerSetupSuccessContinueTo(
  request: Request,
  env: OwnerSetupContinuationEnv,
): Promise<AuthSuccessContinuationTarget | undefined> {
  const adminOrigin = await ownerSetupAdminOrigin(request, env);

  if (adminOrigin === undefined) {
    return undefined;
  }

  const requestOrigin = new URL(request.url).origin;

  if (adminOrigin === requestOrigin) {
    return authAccountContinuationLocationForReturnTarget("/");
  }

  return new URL("/", adminOrigin).toString() as AuthSuccessContinuationTarget;
}

export async function ownerSetupAdminOrigin(
  request: Request,
  env: OwnerSetupContinuationEnv,
): Promise<string | undefined> {
  const requestUrl = new URL(request.url);
  const deploymentTargetUrl = isWorkersDevHost(requestUrl.hostname) ? requestUrl.origin : undefined;
  const resolution = instanceControlPlanePreferredAdminOriginFromRecords({
    ...(deploymentTargetUrl === undefined ? {} : { deploymentTargetUrl }),
    records:
      (await readControlPlaneRecords({
        env,
        requestUrl: request.url,
      })) ?? [],
  });

  return resolution.status === "resolved" ? resolution.adminOrigin : undefined;
}
