import type { FormlessUiManagementLoadingContract } from "@dpeek/formless-astryx/contract";
import {
  formlessUiManagementInstallDialogReference,
  formlessUiManagementManifestReference,
} from "@dpeek/formless-astryx/contract-host";
import type { ApplicationRuntimeContractContribution } from "../generated/application-runtime-contract-host.tsx";

export const INSTANCE_MANAGEMENT_ID = "instance-management";
export const INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID = "instance-management:install-dialog";
export const INSTANCE_MANAGEMENT_PUSH_OPERATION_ID = "instance-management:workspace:push";
export const INSTANCE_MANAGEMENT_PUSH_CONTROL_ID = "workspace:push";
export const INSTANCE_MANAGEMENT_CONTRIBUTOR_ID = "instance-management";

export const instanceManagementReference =
  formlessUiManagementManifestReference(INSTANCE_MANAGEMENT_ID);
export const instanceManagementInstallDialogReference = formlessUiManagementInstallDialogReference(
  INSTANCE_MANAGEMENT_ID,
  INSTANCE_MANAGEMENT_INSTALL_DIALOG_ID,
);

export const instanceManagementLoadingManifest = {
  accessibilityLabel: "Instance management",
  id: INSTANCE_MANAGEMENT_ID,
  kind: "managementManifest",
  message: "Loading installed apps...",
  state: "loading",
  title: "Instance Settings",
} satisfies FormlessUiManagementLoadingContract;

export const initialInstanceManagementRuntimeContribution = [
  INSTANCE_MANAGEMENT_CONTRIBUTOR_ID,
  {
    nodes: [
      {
        reference: instanceManagementReference,
        snapshot: instanceManagementLoadingManifest,
      },
    ],
  },
] as const satisfies ApplicationRuntimeContractContribution;
