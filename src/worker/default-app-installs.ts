import { findAppInstall, type AppInstall } from "../shared/app-installs.ts";
import {
  createInstanceAppInstall,
  readInstanceAppInstalls,
} from "./instance-app-installs-state.ts";

export const DEFAULT_SITE_INSTALL_ID = "site";
export const DEFAULT_SITE_INSTALL_LABEL = "Site";

export type EnsureDefaultAppInstallsResult = {
  defaultSite: {
    created: boolean;
    install: AppInstall;
  };
  installs: AppInstall[];
};

export function ensureDefaultAppInstalls(
  storage: DurableObjectStorage,
  input: { now: string },
): EnsureDefaultAppInstallsResult {
  const existingInstalls = readInstanceAppInstalls(storage);
  const existingSite = findAppInstall(existingInstalls, DEFAULT_SITE_INSTALL_ID);

  if (existingSite) {
    return {
      defaultSite: {
        created: false,
        install: existingSite,
      },
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
    installs: result.installs,
  };
}
