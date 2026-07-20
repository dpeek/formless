import type { ReactNode } from "react";
import type {
  AccessManifestReference,
  ApplicationSystemStateReference,
  AuthSurfaceReference,
  DocumentThemeReference,
  ManagementManifestReference,
  ShellManifestReference,
  WorkspaceManifestReference,
} from "@dpeek/formless-presentation/contract";
import { AstryxSubscribedAccessRenderer } from "./components/access-renderer.tsx";
import { AstryxSubscribedApplicationSystemStateRenderer } from "./components/application-system-state-renderer.tsx";
import { AstryxSubscribedAuthRenderer } from "./components/auth-renderer.tsx";
import { AstryxSubscribedManagementRenderer } from "./components/management-renderer.tsx";
import { AstryxSubscribedWorkspaceScreenRenderer } from "./components/workspace-screen-renderer.tsx";
import { AstryxSubscribedApplicationShellRenderer } from "./components/shell.tsx";
import { AstryxSubscribedDocumentThemeRenderer } from "./components/theme.tsx";

export type FormlessApplicationPresentation =
  | {
      accessReference: AccessManifestReference;
      kind: "access";
    }
  | {
      kind: "applicationSystemState";
      systemStateReference: ApplicationSystemStateReference;
    }
  | {
      kind: "auth";
      reference: AuthSurfaceReference;
    }
  | {
      children: ReactNode;
      kind: "documentTheme";
      themeReference: DocumentThemeReference;
    }
  | {
      kind: "management";
      managementReference: ManagementManifestReference;
    }
  | {
      children: ReactNode;
      kind: "shell";
      shellReference: ShellManifestReference;
      themeReference?: DocumentThemeReference | undefined;
    }
  | {
      kind: "workspace";
      reference: WorkspaceManifestReference;
    };

export type FormlessApplicationRendererProps = {
  presentation: FormlessApplicationPresentation;
};

export function FormlessApplicationRenderer({ presentation }: FormlessApplicationRendererProps) {
  switch (presentation.kind) {
    case "access":
      return <AstryxSubscribedAccessRenderer accessReference={presentation.accessReference} />;
    case "applicationSystemState":
      return (
        <AstryxSubscribedApplicationSystemStateRenderer
          systemStateReference={presentation.systemStateReference}
        />
      );
    case "auth":
      return <AstryxSubscribedAuthRenderer reference={presentation.reference} />;
    case "documentTheme":
      return (
        <AstryxSubscribedDocumentThemeRenderer themeReference={presentation.themeReference}>
          {presentation.children}
        </AstryxSubscribedDocumentThemeRenderer>
      );
    case "management":
      return (
        <AstryxSubscribedManagementRenderer
          managementReference={presentation.managementReference}
        />
      );
    case "shell":
      return (
        <AstryxSubscribedApplicationShellRenderer
          shellReference={presentation.shellReference}
          themeReference={presentation.themeReference}
        >
          {presentation.children}
        </AstryxSubscribedApplicationShellRenderer>
      );
    case "workspace":
      return <AstryxSubscribedWorkspaceScreenRenderer reference={presentation.reference} />;
  }
}
