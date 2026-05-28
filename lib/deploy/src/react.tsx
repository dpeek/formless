export {
  DEPLOY_ACTOR_KINDS,
  DEPLOY_CONTROL_PLANE_ACTION_IDS,
  DEPLOY_PUBLIC_CONTRACT_VERSION,
} from "./types.ts";
export type {
  DeployActorKind,
  DeployAttemptSummary,
  DeployDesiredStateProjection,
  DeployDriftSummary,
  DeployEvidenceSummary,
} from "./types.ts";

export type DeployReactSurfaceMetadata = {
  hiddenActorKinds: readonly DeployHiddenBrowserActorKind[];
  readOnlyHistoryEntities: readonly string[];
};

export type DeployHiddenBrowserActorKind = "cliDeployer" | "runner";

export const DEPLOY_REACT_SURFACE_METADATA = {
  hiddenActorKinds: ["cliDeployer", "runner"],
  readOnlyHistoryEntities: ["deployAttempt", "deployEvidenceSummary", "deployDriftReport"],
} as const satisfies DeployReactSurfaceMetadata;
