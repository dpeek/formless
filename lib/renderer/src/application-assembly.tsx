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
import {
  AstryxApplicationSurfaceFrame,
  AstryxSubscribedWorkspaceSurfaceFrame,
} from "./components/application-surface-frame.tsx";

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
      return (
        <AstryxApplicationSurfaceFrame width="standard">
          <AstryxSubscribedAccessRenderer accessReference={presentation.accessReference} />
        </AstryxApplicationSurfaceFrame>
      );
    case "applicationSystemState":
      return (
        <AstryxApplicationSurfaceFrame width="narrow">
          <AstryxSubscribedApplicationSystemStateRenderer
            systemStateReference={presentation.systemStateReference}
          />
        </AstryxApplicationSurfaceFrame>
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
        <AstryxApplicationSurfaceFrame width="standard">
          <AstryxSubscribedManagementRenderer
            managementReference={presentation.managementReference}
          />
        </AstryxApplicationSurfaceFrame>
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
      return (
        <AstryxSubscribedWorkspaceSurfaceFrame reference={presentation.reference}>
          <AstryxSubscribedWorkspaceScreenRenderer reference={presentation.reference} />
        </AstryxSubscribedWorkspaceSurfaceFrame>
      );
  }
}
