import { findAppInstall, type AppInstall } from "../shared/app-installs.ts";
import {
  readBackfilledControlPlaneAppInstalls,
  type InstanceAppInstallsApiEnv,
} from "./instance-app-installs.ts";
import {
  createInstanceAppInstall,
  createInstanceAppInstallInCurrentTransaction,
  readInstanceAppInstalls,
} from "./instance-app-installs-state.ts";

export const DEFAULT_SITE_INSTALL_ID = "site";
export const DEFAULT_SITE_INSTALL_LABEL = "Site";

export type DefaultAppBootstrapPolicy = "starter-site" | "starter-site-if-empty";

export type EnsureDefaultAppInstallsResult = {
  defaultSite: {
    created: boolean;
    install: AppInstall;
  } | null;
  installs: AppInstall[];
};

export async function ensureDefaultAppInstalls(
  storage: DurableObjectStorage,
  input: {
    env: InstanceAppInstallsApiEnv;
    now: string;
    policy?: DefaultAppBootstrapPolicy;
    requestUrl: string;
  },
): Promise<EnsureDefaultAppInstallsResult> {
  const existingInstalls = await readBackfilledControlPlaneAppInstalls(
    storage,
    input.env,
    input.requestUrl,
  );
  const existingSite = findAppInstall(existingInstalls, DEFAULT_SITE_INSTALL_ID);
  const policy = input.policy ?? "starter-site-if-empty";

  if (existingSite) {
    return {
      defaultSite: {
        created: false,
        install: existingSite,
      },
      installs: existingInstalls,
    };
  }

  if (policy === "starter-site-if-empty" && existingInstalls.length > 0) {
    return {
      defaultSite: null,
      installs: existingInstalls,
    };
  }

  const result = createInstanceAppInstall(storage, {
    installId: DEFAULT_SITE_INSTALL_ID,
    label: DEFAULT_SITE_INSTALL_LABEL,
    now: input.now,
    packageAppKey: "site",
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return {
    defaultSite: {
      created: true,
      install: result.install,
    },
    installs: await readBackfilledControlPlaneAppInstalls(storage, input.env, input.requestUrl),
  };
}

export function ensureDefaultAppInstallsInCurrentTransaction(
  storage: DurableObjectStorage,
  input: { now: string; policy?: DefaultAppBootstrapPolicy },
): EnsureDefaultAppInstallsResult {
  const existingInstalls = readInstanceAppInstalls(storage);
  const existingSite = findAppInstall(existingInstalls, DEFAULT_SITE_INSTALL_ID);
  const policy = input.policy ?? "starter-site-if-empty";

  if (existingSite) {
    return {
      defaultSite: {
        created: false,
        install: existingSite,
      },
      installs: existingInstalls,
    };
  }

  if (policy === "starter-site-if-empty" && existingInstalls.length > 0) {
    return {
      defaultSite: null,
      installs: existingInstalls,
    };
  }

  const result = createInstanceAppInstallInCurrentTransaction(storage, {
    installId: DEFAULT_SITE_INSTALL_ID,
    label: DEFAULT_SITE_INSTALL_LABEL,
    now: input.now,
    packageAppKey: "site",
  });

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return {
    defaultSite: {
      created: true,
      install: result.install,
    },
    installs: result.installs,
  };
}
