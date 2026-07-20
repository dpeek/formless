export type IdentityReferenceTargetLookup = {
  id: string;
  target: string;
};

export type IdentityReferenceTargetResolution =
  | { kind: "active" }
  | { kind: "missing" }
  | { kind: "tombstoned" }
  | { kind: "wrong-entity" }
  | { kind: "unsupported" }
  | { kind: "unavailable" };

export type IdentityReferenceTargetResolver = (
  lookup: IdentityReferenceTargetLookup,
) => Promise<IdentityReferenceTargetResolution>;

export function isIdentityReferenceTargetResolution(
  value: unknown,
): value is IdentityReferenceTargetResolution {
  return (
    isResolutionKind(value, "active") ||
    isResolutionKind(value, "missing") ||
    isResolutionKind(value, "tombstoned") ||
    isResolutionKind(value, "wrong-entity") ||
    isResolutionKind(value, "unsupported") ||
    isResolutionKind(value, "unavailable")
  );
}

function isResolutionKind(
  value: unknown,
  kind: IdentityReferenceTargetResolution["kind"],
): value is IdentityReferenceTargetResolution {
  return isRecord(value) && value.kind === kind;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
