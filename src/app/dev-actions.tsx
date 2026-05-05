import { useState } from "react";
import { Button } from "@formless/ui/button";
import { resetSeedData } from "../client/sync.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";

export function DevActions() {
  const [resettingSchema, setResettingSchema] = useState<SchemaKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resetLocalData(schemaKey: SchemaKey) {
    if (resettingSchema) {
      return;
    }

    setResettingSchema(schemaKey);
    setError(null);

    try {
      await resetSeedData(schemaKey);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setResettingSchema(null);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <Button disabled={resettingSchema !== null} onClick={() => void resetLocalData("tasks")}>
        {resettingSchema === "tasks" ? "Resetting..." : "Reset task seed data"}
      </Button>
      <Button
        disabled={resettingSchema !== null}
        onClick={() => void resetLocalData("rates")}
        variant="outline"
      >
        {resettingSchema === "rates" ? "Resetting..." : "Reset rate-card seed data"}
      </Button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}
