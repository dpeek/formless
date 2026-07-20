import type { ReactNode } from "react";
import type {
  FormlessUiAccessManifestReference,
  FormlessUiApplicationSystemStateReference,
  FormlessUiAuthSurfaceReference,
  FormlessUiDocumentThemeReference,
  FormlessUiManagementManifestReference,
  FormlessUiShellManifestReference,
  FormlessUiWorkspaceManifestReference,
} from "@dpeek/formless-presentation/contract";
import { AstryxSubscribedAccessRenderer } from "./components/formless-ui-access-renderer.tsx";
import { AstryxSubscribedApplicationSystemStateRenderer } from "./components/formless-ui-application-system-state-renderer.tsx";
import { AstryxSubscribedAuthRenderer } from "./components/formless-ui-auth-renderer.tsx";
import { AstryxSubscribedManagementRenderer } from "./components/formless-ui-management-renderer.tsx";
import { AstryxSubscribedWorkspaceScreenRenderer } from "./components/formless-ui-workspace-screen-renderer.tsx";
import { AstryxSubscribedApplicationShellRenderer } from "./components/shell.tsx";
import { AstryxSubscribedDocumentThemeRenderer } from "./components/theme.tsx";

export type FormlessApplicationPresentation =
  | {
      accessReference: FormlessUiAccessManifestReference;
      kind: "access";
    }
  | {
      kind: "applicationSystemState";
      systemStateReference: FormlessUiApplicationSystemStateReference;
    }
  | {
      kind: "auth";
      reference: FormlessUiAuthSurfaceReference;
    }
  | {
      children: ReactNode;
      kind: "documentTheme";
      themeReference: FormlessUiDocumentThemeReference;
    }
  | {
      kind: "management";
      managementReference: FormlessUiManagementManifestReference;
    }
  | {
      children: ReactNode;
      kind: "shell";
      shellReference: FormlessUiShellManifestReference;
      themeReference?: FormlessUiDocumentThemeReference | undefined;
    }
  | {
      kind: "workspace";
      reference: FormlessUiWorkspaceManifestReference;
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
