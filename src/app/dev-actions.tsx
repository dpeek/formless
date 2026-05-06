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
import { resetSeedData } from "../client/sync.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { getSchemaAppDefinition, type SchemaKey } from "../shared/schema-apps.ts";

type ResetStatus = {
  pending: boolean;
  error: string | null;
};

type DevActionsProps = {
  schemaKey: SchemaKey;
  onResetSourceData?: (response: BootstrapResponse) => void;
};

export function DevActions({ schemaKey, onResetSourceData }: DevActionsProps) {
  const app = getSchemaAppDefinition(schemaKey);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetStatus, setResetStatus] = useState<ResetStatus>({
    pending: false,
    error: null,
  });

  async function resetSourceData() {
    if (resetStatus.pending) {
      return;
    }

    setDialogOpen(false);
    setResetStatus({ pending: true, error: null });

    try {
      const response = await resetSeedData(schemaKey);
      onResetSourceData?.(response);
      setResetStatus({ pending: false, error: null });
    } catch (error) {
      setResetStatus({
        pending: false,
        error: error instanceof Error ? error.message : "Source reset failed.",
      });
    }
  }

  return (
    <section
      aria-label={`${app.label} route reset controls`}
      className="rounded border border-slate-200 p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger
            render={<Button disabled={resetStatus.pending} type="button" variant="destructive" />}
          >
            {resetStatus.pending ? "Resetting..." : "Reset schema and seed data"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset {app.label} schema and seed data?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears records for <code>{app.key}</code> and restores the source schema and
                source seed records.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void resetSourceData()}
                type="button"
                variant="destructive"
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {resetStatus.error ? <p className="mt-2 text-sm text-red-700">{resetStatus.error}</p> : null}
    </section>
  );
}
