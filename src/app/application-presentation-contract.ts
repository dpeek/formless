import type { ComponentType, ReactNode } from "react";
import type {
  FormlessUiAccessManifestReference,
  FormlessUiApplicationSystemStateReference,
  FormlessUiAuthSurfaceReference,
  FormlessUiDocumentThemeReference,
  FormlessUiManagementManifestReference,
  FormlessUiShellManifestReference,
  FormlessUiWorkspaceManifestReference,
} from "@dpeek/formless-astryx/contract";

export type ApplicationPresentation =
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

export type ApplicationPresentationAssemblyProps = {
  presentation: ApplicationPresentation;
};

export type ApplicationPresentationAssembly = {
  id: "astryx" | "legacy";
  Renderer: ComponentType<ApplicationPresentationAssemblyProps>;
};
