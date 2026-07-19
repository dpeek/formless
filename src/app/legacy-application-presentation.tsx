import { LegacySubscribedAccessRenderer } from "./generated/legacy-access-renderer.tsx";
import { LegacySubscribedApplicationShellRenderer } from "./generated/legacy-application-shell-renderer.tsx";
import { LegacySubscribedApplicationSystemStateRenderer } from "./generated/legacy-application-system-state-renderer.tsx";
import { LegacySubscribedDocumentThemeRenderer } from "./generated/legacy-document-theme-renderer.tsx";
import { LegacySubscribedManagementRenderer } from "./generated/legacy-management-renderer.tsx";
import { LegacySubscribedAuthRenderer } from "./generated/legacy-owner-auth-renderer.tsx";
import { LegacySubscribedWorkspaceScreenRenderer } from "./generated/legacy-workspace-screen-renderer.tsx";
import type {
  ApplicationPresentationAssembly,
  ApplicationPresentationAssemblyProps,
} from "./application-presentation-contract.ts";

export const legacyApplicationPresentationAssembly = {
  id: "legacy",
  Renderer: LegacyApplicationPresentationAssembly,
} as const satisfies ApplicationPresentationAssembly;

function LegacyApplicationPresentationAssembly({
  presentation,
}: ApplicationPresentationAssemblyProps) {
  switch (presentation.kind) {
    case "access":
      return <LegacySubscribedAccessRenderer accessReference={presentation.accessReference} />;
    case "applicationSystemState":
      return (
        <LegacySubscribedApplicationSystemStateRenderer
          systemStateReference={presentation.systemStateReference}
        />
      );
    case "auth":
      return <LegacySubscribedAuthRenderer reference={presentation.reference} />;
    case "documentTheme":
      return (
        <LegacySubscribedDocumentThemeRenderer themeReference={presentation.themeReference}>
          {presentation.children}
        </LegacySubscribedDocumentThemeRenderer>
      );
    case "management":
      return (
        <LegacySubscribedManagementRenderer
          managementReference={presentation.managementReference}
        />
      );
    case "shell":
      return (
        <LegacySubscribedApplicationShellRenderer
          shellReference={presentation.shellReference}
          themeReference={presentation.themeReference}
        >
          {presentation.children}
        </LegacySubscribedApplicationShellRenderer>
      );
    case "workspace":
      return <LegacySubscribedWorkspaceScreenRenderer reference={presentation.reference} />;
  }
}
