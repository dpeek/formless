import { useState } from "react";
import { Button } from "@dpeek/formless-ui/button";
import {
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { resetSeedData } from "../client/sync.ts";
import {
  clientSchemaKeyLabel,
  clientTargetForSchemaKey,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../client/app-target.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import type { AppPackageResolver } from "@dpeek/formless-installed-apps";

type DevActionStatus = {
  pending: boolean;
  error: string | null;
  message: string | null;
};

type SourceResetControlProps = {
  buttonClassName?: string;
  buttonLabel?: string;
  className?: string;
  onResetSourceData?: (response: BootstrapResponse) => void;
  schemaKey: ClientAppSchemaKey;
  activePackageResolver?: AppPackageResolver | undefined;
  appLabel?: string;
  target?: ClientAppTarget;
};

export function SourceResetControl({
  activePackageResolver,
  appLabel,
  buttonClassName,
  buttonLabel = "Reset",
  className,
  onResetSourceData,
  schemaKey,
  target,
}: SourceResetControlProps) {
  const resolvedAppLabel = appLabel ?? clientSchemaKeyLabel(schemaKey);
  const appTarget = target ?? clientTargetForSchemaKey(schemaKey);
  const resetScopeLabel = resetScopeLabelForTarget(resolvedAppLabel, appTarget);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<DevActionStatus>({
    pending: false,
    error: null,
    message: null,
  });

  async function resetSourceData() {
    if (resetStatus.pending) {
      return;
    }

    setResetDialogOpen(false);
    setResetStatus({ pending: true, error: null, message: null });

    try {
      const response = await resetSeedData(appTarget, undefined, { activePackageResolver });
      onResetSourceData?.(response);
      setResetStatus({
        pending: false,
        error: null,
        message: `Reset ${resetScopeLabel} source schema and seed data at ${response.schemaUpdatedAt}.`,
      });
    } catch (error) {
      setResetStatus({
        pending: false,
        error: error instanceof Error ? error.message : "Source reset failed.",
        message: null,
      });
    }
  }

  return (
    <div className={className}>
      <Button
        className={buttonClassName}
        isDisabled={resetStatus.pending}
        onPress={() => setResetDialogOpen(true)}
        type="button"
        intent="danger"
        aria-label={`Reset source seed data for ${resetScopeLabel}`}
      >
        {resetStatus.pending ? "Resetting..." : buttonLabel}
      </Button>
      <ModalContent
        closeButton={false}
        isOpen={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        role="alertdialog"
      >
        <ModalHeader>
          <ModalTitle>Reset {resetScopeLabel} source seed data?</ModalTitle>
          <ModalDescription>
            This restores the source schema and source seed data for <code>{schemaKey}</code>.
            Existing records in {resetScopeLabel} are replaced by the source seed records.
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <ModalClose intent="outline">Cancel</ModalClose>
          <Button onPress={() => void resetSourceData()} type="button" intent="danger">
            Reset
          </Button>
        </ModalFooter>
      </ModalContent>
      <DevActionMessage status={resetStatus} />
    </div>
  );
}

function resetScopeLabelForTarget(appLabel: string, target: ClientAppTarget): string {
  return typeof target === "object" && target.kind === "appInstall"
    ? `${appLabel} app install ${target.installId}`
    : appLabel;
}

function DevActionMessage({ className, status }: { className?: string; status: DevActionStatus }) {
  if (status.error) {
    return <p className={className ?? "mt-2 text-sm text-red-700"}>{status.error}</p>;
  }

  if (status.message) {
    return <p className={className ?? "mt-2 text-sm text-slate-600"}>{status.message}</p>;
  }

  return null;
}
