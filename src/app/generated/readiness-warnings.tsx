import type { RecordReadinessWarning } from "../../client/readiness.ts";

export function RecordReadinessWarnings({ warnings }: { warnings: RecordReadinessWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Readiness warnings"
      className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
    >
      <p className="font-medium">Readiness warnings</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {warnings.map((warning) => (
          <li key={warning.code}>{warning.message}</li>
        ))}
      </ul>
    </div>
  );
}
