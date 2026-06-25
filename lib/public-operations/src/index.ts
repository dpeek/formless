export const PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX = "/public/operations" as const;

export type PublicOperationRouteParts = {
  entityKey: string;
  operationKey: string;
};

export type PublicOperationRouteSuffix =
  `${typeof PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX}/${string}/${string}`;

export type PublicOperationTargetRouteInput = PublicOperationRouteParts & {
  targetApiRoutePrefix: `/${string}`;
};

export type PublicOperationRouteErrorCode = "empty-segment" | "invalid-escape" | "invalid-shape";

export class PublicOperationRouteError extends Error {
  readonly code: PublicOperationRouteErrorCode;

  constructor(code: PublicOperationRouteErrorCode, message: string) {
    super(message);
    this.name = "PublicOperationRouteError";
    this.code = code;
  }
}

export function buildPublicOperationRouteSuffix(
  input: PublicOperationRouteParts,
): PublicOperationRouteSuffix {
  return `${PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX}/${encodePublicOperationRouteSegment(
    input.entityKey,
  )}/${encodePublicOperationRouteSegment(input.operationKey)}`;
}

export function parsePublicOperationRouteSuffix(path: string): PublicOperationRouteParts {
  const prefix = `${PUBLIC_OPERATION_ROUTE_SUFFIX_PREFIX}/`;

  if (!path.startsWith(prefix)) {
    throw invalidShape();
  }

  const segments = path.slice(prefix.length).split("/");

  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw invalidShape();
  }

  return {
    entityKey: decodePublicOperationRouteSegment(segments[0]),
    operationKey: decodePublicOperationRouteSegment(segments[1]),
  };
}

export function buildPublicOperationTargetRoute(
  input: PublicOperationTargetRouteInput,
): `/${string}` {
  return `${input.targetApiRoutePrefix}${buildPublicOperationRouteSuffix(input)}`;
}

export function encodePublicOperationRouteSegment(segment: string): string {
  assertNonEmptyRouteSegment(segment);

  return encodeURIComponent(segment);
}

export function decodePublicOperationRouteSegment(segment: string): string {
  let decoded: string;

  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new PublicOperationRouteError(
      "invalid-escape",
      "Public operation route suffix segments must be valid URL path text.",
    );
  }

  assertNonEmptyRouteSegment(decoded);

  return decoded;
}

function assertNonEmptyRouteSegment(segment: string): void {
  if (segment.trim() === "") {
    throw new PublicOperationRouteError(
      "empty-segment",
      "Public operation route suffix entity and operation keys must be non-empty.",
    );
  }
}

function invalidShape(): PublicOperationRouteError {
  return new PublicOperationRouteError(
    "invalid-shape",
    "Public operation route suffix must use /public/operations/:entityKey/:operationKey.",
  );
}
