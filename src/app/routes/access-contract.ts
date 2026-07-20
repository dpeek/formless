import type { FormlessUiAccessLoadingContract } from "@dpeek/formless-presentation/contract";
import {
  formlessUiAccessInvitationAuthoringReference,
  formlessUiAccessManifestReference,
} from "@dpeek/formless-presentation/contract-host";
import type { ApplicationRuntimeContractContribution } from "../generated/application-runtime-contract-host.tsx";

export const INSTANCE_ACCESS_ID = "instance-access";
export const INSTANCE_ACCESS_INVITATION_AUTHORING_ID = "instance-access:invitation-authoring";
export const INSTANCE_ACCESS_CONTRIBUTOR_ID = "instance-access";

export const instanceAccessReference = formlessUiAccessManifestReference(INSTANCE_ACCESS_ID);
export const instanceAccessInvitationAuthoringReference =
  formlessUiAccessInvitationAuthoringReference(
    INSTANCE_ACCESS_ID,
    INSTANCE_ACCESS_INVITATION_AUTHORING_ID,
  );

export const instanceAccessLoadingManifest = {
  accessibilityLabel: "Access",
  id: INSTANCE_ACCESS_ID,
  kind: "accessManifest",
  message: "Loading access management...",
  state: "loading",
  title: "Access",
} satisfies FormlessUiAccessLoadingContract;

export const initialInstanceAccessRuntimeContribution = [
  INSTANCE_ACCESS_CONTRIBUTOR_ID,
  {
    nodes: [
      {
        reference: instanceAccessReference,
        snapshot: instanceAccessLoadingManifest,
      },
    ],
  },
] as const satisfies ApplicationRuntimeContractContribution;
