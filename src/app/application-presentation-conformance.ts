import type { RuntimeProfileKind } from "../shared/runtime-topology.ts";

export type ApplicationPresentationSurface =
  | "accessManagement"
  | "accountAuth"
  | "applicationShell"
  | "applicationSystemState"
  | "collaboratorInvitationAuth"
  | "create"
  | "documentTheme"
  | "field"
  | "generatedWorkspace"
  | "instanceManagement"
  | "listResult"
  | "operation"
  | "ownerAuth"
  | "publicSitePage"
  | "publicSiteSystemState"
  | "recordResult"
  | "tableResult"
  | "treeResult";

export type ApplicationPresentationHostOwner =
  | "applicationRuntime"
  | "applicationSystemStateRuntime"
  | "noShellAuthRuntime"
  | "publicSiteRuntime";

export type ApplicationPresentationSurfaceOwnership = {
  contractBoundary: string;
  hostOwner: ApplicationPresentationHostOwner;
  projectionOwner: string;
  surface: ApplicationPresentationSurface;
};

export const applicationPresentationSurfaceOwnership = [
  ownership("applicationShell", "shellManifest", "applicationRuntime", "application shell runtime"),
  ownership(
    "instanceManagement",
    "managementManifest",
    "applicationRuntime",
    "instance management runtime",
  ),
  ownership("ownerAuth", "authSurface", "noShellAuthRuntime", "owner auth routes"),
  ownership("accountAuth", "authSurface", "noShellAuthRuntime", "account auth route"),
  ownership(
    "collaboratorInvitationAuth",
    "authSurface",
    "noShellAuthRuntime",
    "collaborator invitation route",
  ),
  ownership("accessManagement", "accessManifest", "applicationRuntime", "access runtime"),
  ownership(
    "generatedWorkspace",
    "workspaceManifest",
    "applicationRuntime",
    "generated workspace runtime",
  ),
  ownership("treeResult", "treeResult", "applicationRuntime", "generated tree runtime"),
  ownership("listResult", "listResult", "applicationRuntime", "generated list runtime"),
  ownership("tableResult", "tableResult", "applicationRuntime", "generated table runtime"),
  ownership("recordResult", "recordResult", "applicationRuntime", "generated record runtime"),
  ownership("field", "owning workspace or result node", "applicationRuntime", "field runtime"),
  ownership("create", "owning shell or workspace node", "applicationRuntime", "create runtime"),
  ownership(
    "operation",
    "owning management, workspace, or result node",
    "applicationRuntime",
    "operation runtime",
  ),
  ownership("documentTheme", "documentTheme", "applicationRuntime", "application theme runtime"),
  ownership(
    "applicationSystemState",
    "applicationSystemState",
    "applicationSystemStateRuntime",
    "top-level route runtime",
  ),
  ownership("publicSitePage", "SitePublicRendererProps", "publicSiteRuntime", "Site runtime"),
  ownership(
    "publicSiteSystemState",
    "SitePublicSystemStateRendererProps",
    "publicSiteRuntime",
    "Site runtime",
  ),
] as const satisfies readonly ApplicationPresentationSurfaceOwnership[];

export type ProductionRoutePresentationMatrixRow = {
  id: string;
  profiles: readonly RuntimeProfileKind[];
  routeFamily: string;
  shell: "application" | "none";
  surfaces: readonly ApplicationPresentationSurface[];
};

const instanceProfiles = ["dev", "instance"] as const satisfies readonly RuntimeProfileKind[];
const allProfiles = [
  "app",
  "dev",
  "instance",
  "publishedSite",
  "siteAuthoring",
] as const satisfies readonly RuntimeProfileKind[];

export const productionRoutePresentationMatrix = [
  route("collaborator-invitation", allProfiles, "/formless/invitations/accept", "none", [
    "collaboratorInvitationAuth",
  ]),
  route("account-auth", allProfiles, "/formless/auth and /formless/auth/*", "none", [
    "accountAuth",
  ]),
  route(
    "owner-auth",
    ["dev", "instance", "publishedSite"],
    "/formless/auth/setup and /formless/auth/sign-in",
    "none",
    ["ownerAuth"],
  ),
  route("instance-management", instanceProfiles, "/", "application", [
    "applicationShell",
    "instanceManagement",
  ]),
  route("access-management", instanceProfiles, "/access", "application", [
    "applicationShell",
    "accessManagement",
  ]),
  route(
    "local-session",
    instanceProfiles,
    "/local-session when local gateway is available",
    "none",
    ["applicationSystemState"],
  ),
  route("source-app-admin", ["dev"], "/tasks/*, /site/*, and /crm/*", "application", [
    "applicationShell",
    "generatedWorkspace",
  ]),
  route("installed-app-admin", instanceProfiles, "/apps/:installId/*", "application", [
    "applicationShell",
    "generatedWorkspace",
  ]),
  route("installed-site-public", instanceProfiles, "/sites/:installId/*", "none", [
    "publicSitePage",
    "publicSiteSystemState",
  ]),
  route("source-site-preview", ["dev"], "/pages/*", "none", [
    "publicSitePage",
    "publicSiteSystemState",
  ]),
  route("app-profile", ["app"], "/ and declared screen paths", "application", [
    "applicationShell",
    "generatedWorkspace",
  ]),
  route("app-profile-registry", ["app"], "pending package route registry", "none", [
    "applicationSystemState",
  ]),
  route("site-authoring-admin", ["siteAuthoring"], "/admin/*", "application", [
    "applicationShell",
    "generatedWorkspace",
  ]),
  route("site-authoring-public", ["siteAuthoring"], "/ and non-admin paths", "none", [
    "publicSitePage",
    "publicSiteSystemState",
  ]),
  route("published-site", ["publishedSite"], "/ and public slug paths", "none", [
    "publicSitePage",
    "publicSiteSystemState",
  ]),
  route("application-missing", ["app", "dev"], "unmatched application paths", "application", [
    "applicationShell",
    "applicationSystemState",
  ]),
  route("instance-missing", ["instance"], "unmatched instance paths", "none", [
    "applicationSystemState",
  ]),
  route("route-loading", allProfiles, "route registry and lazy route boundaries", "none", [
    "applicationSystemState",
  ]),
  route(
    "owner-check",
    ["app", "dev", "instance", "siteAuthoring"],
    "owner-protected application paths",
    "application",
    ["applicationShell", "applicationSystemState"],
  ),
] as const satisfies readonly ProductionRoutePresentationMatrixRow[];

function ownership(
  surface: ApplicationPresentationSurface,
  contractBoundary: string,
  hostOwner: ApplicationPresentationHostOwner,
  projectionOwner: string,
): ApplicationPresentationSurfaceOwnership {
  return { contractBoundary, hostOwner, projectionOwner, surface };
}

function route(
  id: string,
  profiles: readonly RuntimeProfileKind[],
  routeFamily: string,
  shell: ProductionRoutePresentationMatrixRow["shell"],
  surfaces: readonly ApplicationPresentationSurface[],
): ProductionRoutePresentationMatrixRow {
  return { id, profiles, routeFamily, shell, surfaces };
}
