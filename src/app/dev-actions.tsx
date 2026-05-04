import { useState } from "react";
import { Button } from "@formless/ui/button";
import { resetRemoteData, type DevResetSchema } from "../client/sync.ts";

export function DevActions() {
  const [resettingSchema, setResettingSchema] = useState<DevResetSchema | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resetLocalData(schema: DevResetSchema) {
    if (resettingSchema) {
      return;
    }

    setResettingSchema(schema);
    setError(null);

    try {
      await resetRemoteData(schema);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setResettingSchema(null);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <Button disabled={resettingSchema !== null} onClick={() => void resetLocalData("default")}>
        {resettingSchema === "default" ? "Resetting..." : "Reset task schema"}
      </Button>
      <Button
        disabled={resettingSchema !== null}
        onClick={() => void resetLocalData("rate-card")}
        variant="outline"
      >
        {resettingSchema === "rate-card" ? "Resetting..." : "Reset rate-card schema"}
      </Button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}
