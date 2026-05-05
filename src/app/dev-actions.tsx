import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@formless/ui/alert-dialog";
import { Button } from "@formless/ui/button";
import { resetSeedData, resetSourceSchema } from "../client/sync.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../shared/schema-apps.ts";

type ResetStatus = {
  pending: boolean;
  error: string | null;
};

type DevActionsProps = {
  schemaKey: SchemaKey;
  onResetSchema?: (response: BootstrapResponse) => void;
  onResetSeedData?: (response: BootstrapResponse) => void;
};

export function DevActions({ schemaKey, onResetSchema, onResetSeedData }: DevActionsProps) {
  const app = getSchemaAppDefinition(schemaKey);
  const [schemaResetStatus, setSchemaResetStatus] = useState<ResetStatus>({
    pending: false,
    error: null,
  });
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedResetStatus, setSeedResetStatus] = useState<ResetStatus>({
    pending: false,
    error: null,
  });

  async function resetSchema() {
    if (schemaResetStatus.pending || seedResetStatus.pending) {
      return;
    }

    setSchemaResetStatus({ pending: true, error: null });

    try {
      const response = await resetSourceSchema(schemaKey);
      onResetSchema?.(response);
      setSchemaResetStatus({ pending: false, error: null });
    } catch (error) {
      setSchemaResetStatus({
        pending: false,
        error: error instanceof Error ? error.message : "Schema reset failed.",
      });
    }
  }

  async function resetLocalData() {
    if (schemaResetStatus.pending || seedResetStatus.pending) {
      return;
    }

    setSeedDialogOpen(false);
    setSeedResetStatus({ pending: true, error: null });

    try {
      const response = await resetSeedData(schemaKey);
      onResetSeedData?.(response);
      setSeedResetStatus({ pending: false, error: null });
    } catch (error) {
      setSeedResetStatus({
        pending: false,
        error: error instanceof Error ? error.message : "Seed reset failed.",
      });
    }
  }

  return (
    <section
      aria-label={`${app.label} route reset controls`}
      className="rounded border border-slate-200 p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={schemaResetStatus.pending || seedResetStatus.pending}
          onClick={() => void resetSchema()}
          type="button"
          variant="outline"
        >
          {schemaResetStatus.pending ? "Resetting schema..." : "Reset source schema"}
        </Button>
        <AlertDialog open={seedDialogOpen} onOpenChange={setSeedDialogOpen}>
          <AlertDialogTrigger
            render={
              <Button
                disabled={schemaResetStatus.pending || seedResetStatus.pending}
                type="button"
                variant="destructive"
              />
            }
          >
            {seedResetStatus.pending ? "Resetting seed data..." : "Reset seed data"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset {app.label} seed data?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears records for <code>{app.key}</code> and restores source seed records.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void resetLocalData()}
                type="button"
                variant="destructive"
              >
                Reset seed data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {schemaResetStatus.error ? (
        <p className="mt-2 text-sm text-red-700">{schemaResetStatus.error}</p>
      ) : null}
      {seedResetStatus.error ? (
        <p className="mt-2 text-sm text-red-700">{seedResetStatus.error}</p>
      ) : null}
    </section>
  );
}
