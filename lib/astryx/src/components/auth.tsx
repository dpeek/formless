import { useState } from "react";
import type {
  FormlessUiAuthFieldContract,
  FormlessUiAuthFieldIntent,
  FormlessUiAuthIntent,
  FormlessUiAuthSurfaceContract,
  FormlessUiAuthSurfaceReference,
  FormlessUiButtonContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiAuthSurfaceReference,
  isFormlessUiAuthIntent,
  type FormlessUiContractHostNodeSet,
  type FormlessUiMutableContractHost,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  createFormlessAuthFixtures,
  type FormlessAuthFixture,
  type FormlessAuthFixtureId,
} from "./auth.fixtures.ts";
import { FormlessFixtureFrame, FormlessFixtureSelector } from "./fixture-layout.tsx";
import { AstryxSubscribedAuthRenderer } from "./formless-ui-auth-renderer.tsx";

export function FormlessAuthLayout() {
  const [fixtureHost] = useState(() => createFormlessAuthFixtureHost(createFormlessAuthFixtures()));
  const [fixtureId, setFixtureId] = useAuthFixtureSelection(fixtureHost.fixtures);
  const selectedIndex = Math.max(
    0,
    fixtureHost.fixtures.findIndex((fixture) => fixture.id === fixtureId),
  );
  const fixture = fixtureHost.fixtures[selectedIndex];

  if (!fixture) {
    return null;
  }

  const reference = fixtureHost.referenceFor(fixture.id);
  const families = Array.from(new Set(fixtureHost.fixtures.map(({ family }) => family)));
  const familyFixtures = fixtureHost.fixtures.filter(
    (candidate) => candidate.family === fixture.family,
  );

  return (
    <FormlessFixtureFrame
      ariaLabel="Switch auth fixture"
      controls={
        <AuthFixtureSwitcher
          families={families}
          fixture={fixture}
          fixtures={familyFixtures}
          onFixtureChange={setFixtureId}
          onViewChange={(family) => {
            const nextFixture = fixtureHost.fixtures.find(
              (candidate) => candidate.family === family,
            );
            if (nextFixture) {
              setFixtureId(nextFixture.id);
            }
          }}
        />
      }
    >
      <FormlessUiContractHostProvider host={fixtureHost.host}>
        <AstryxSubscribedAuthRenderer reference={reference} />
      </FormlessUiContractHostProvider>
    </FormlessFixtureFrame>
  );
}

export type FormlessAuthFixtureHost = {
  fixtures: readonly FormlessAuthFixture[];
  getSurface(fixtureId: FormlessAuthFixtureId): FormlessUiAuthSurfaceContract;
  host: Omit<FormlessUiMutableContractHost, "dispatch"> & {
    dispatch(intent: FormlessUiAuthIntent): void;
  };
  referenceFor(fixtureId: FormlessAuthFixtureId): FormlessUiAuthSurfaceReference;
};

export function createFormlessAuthFixtureHost(
  fixtures: readonly FormlessAuthFixture[],
): FormlessAuthFixtureHost {
  const surfaces = new Map(
    fixtures.map((fixture) => [fixture.surface.id, structuredClone(fixture.surface)]),
  );
  const references = new Map(
    fixtures.map((fixture) => [fixture.id, authFixtureReference(fixture.surface)]),
  );
  const surfaceIdsByFixtureId = new Map(
    fixtures.map((fixture) => [fixture.id, fixture.surface.id]),
  );
  let host: FormlessUiMutableContractHost;

  host = createFormlessUiMemoryContractHost({
    dispatch: (intent) => {
      if (!isFormlessUiAuthIntent(intent)) {
        throw new Error("Auth fixture host received an unsupported intent.");
      }

      const surface = surfaces.get(intent.surfaceId);
      if (!surface) {
        return;
      }
      const nextSurface = applyFormlessAuthFixtureIntent(surface, intent);
      if (nextSurface === surface) {
        return;
      }

      surfaces.set(nextSurface.id, nextSurface);
      host.publish(projectFormlessAuthFixtureNodes(fixtures, surfaces));
    },
    nodes: projectFormlessAuthFixtureNodes(fixtures, surfaces),
  });

  return {
    fixtures,
    getSurface: (fixtureId) => {
      const surfaceId = surfaceIdsByFixtureId.get(fixtureId);
      const surface = surfaceId ? surfaces.get(surfaceId) : undefined;
      if (!surface) {
        throw new Error(`Missing ${fixtureId} auth fixture surface.`);
      }
      return surface;
    },
    host: host as FormlessAuthFixtureHost["host"],
    referenceFor: (fixtureId) => {
      const reference = references.get(fixtureId);
      if (!reference) {
        throw new Error(`Missing ${fixtureId} auth fixture reference.`);
      }
      return reference;
    },
  };
}

export function projectFormlessAuthFixtureNodes(
  fixtures: readonly FormlessAuthFixture[],
  surfaces: ReadonlyMap<string, FormlessUiAuthSurfaceContract> = new Map(
    fixtures.map((fixture) => [fixture.surface.id, fixture.surface]),
  ),
): FormlessUiContractHostNodeSet {
  return fixtures.map((fixture) => {
    const surface = surfaces.get(fixture.surface.id);
    if (!surface) {
      throw new Error(`Missing ${fixture.id} auth fixture surface.`);
    }
    return { reference: authFixtureReference(surface), snapshot: surface };
  });
}

export function applyFormlessAuthFixtureIntent(
  surface: FormlessUiAuthSurfaceContract,
  intent: FormlessUiAuthIntent,
): FormlessUiAuthSurfaceContract {
  if (surface.id !== intent.surfaceId || surface.pending) {
    return surface;
  }

  switch (intent.type) {
    case "authField":
      return applyAuthFieldIntent(surface, intent);
    case "authPolicySelection": {
      const policy = surface.policies.find(
        (candidate) =>
          candidate.id === intent.policyId &&
          candidate.selectionIntent?.surfaceId === intent.surfaceId &&
          candidate.selectionIntent.accepted === intent.accepted,
      );
      if (!policy) {
        return surface;
      }
      return {
        ...surface,
        policies: surface.policies.map((candidate) =>
          candidate.id === policy.id
            ? {
                ...candidate,
                accepted: intent.accepted,
                selectionIntent: candidate.selectionIntent
                  ? { ...candidate.selectionIntent, accepted: !intent.accepted }
                  : undefined,
              }
            : candidate,
        ),
      } as FormlessUiAuthSurfaceContract;
    }
    case "authAction": {
      const action = surface.actions.find(
        (candidate) =>
          candidate.id === intent.actionId &&
          candidate.control.id === intent.controlId &&
          candidate.intent.surfaceId === intent.surfaceId,
      );
      if (!action) {
        return surface;
      }
      return {
        ...surface,
        actions: surface.actions.map((candidate) =>
          candidate.id === action.id
            ? { ...candidate, control: markAuthButtonPending(candidate.control) }
            : candidate,
        ),
        pending: true,
      };
    }
    case "authPasskey": {
      const passkey = surface.passkey;
      if (
        passkey?.availability !== "available" ||
        passkey.id !== intent.passkeyId ||
        passkey.control.id !== intent.controlId ||
        passkey.intent.surfaceId !== intent.surfaceId
      ) {
        return surface;
      }
      return {
        ...surface,
        passkey: { ...passkey, control: markAuthButtonPending(passkey.control) },
        pending: true,
      };
    }
    case "authContinuation": {
      const continuation = surface.continuation;
      if (
        !continuation ||
        continuation.destination.id !== intent.destinationId ||
        continuation.control.id !== intent.controlId ||
        continuation.intent.surfaceId !== intent.surfaceId
      ) {
        return surface;
      }
      return {
        ...surface,
        continuation: {
          ...continuation,
          control: markAuthButtonPending(continuation.control),
        },
        pending: true,
      };
    }
  }
}

function applyAuthFieldIntent(
  surface: FormlessUiAuthSurfaceContract,
  intent: FormlessUiAuthFieldIntent,
): FormlessUiAuthSurfaceContract {
  const target = surface.fields.find(
    (candidate) =>
      candidate.field.fieldId === intent.fieldId && candidate.intent.surfaceId === intent.surfaceId,
  );
  if (!target) {
    return surface;
  }

  const nextTarget = applyAuthFieldDraft(target, intent);
  if (nextTarget === target) {
    return surface;
  }
  return {
    ...surface,
    fields: surface.fields.map((candidate) =>
      candidate.field.fieldId === target.field.fieldId ? nextTarget : candidate,
    ),
  } as FormlessUiAuthSurfaceContract;
}

function applyAuthFieldDraft(
  authField: FormlessUiAuthFieldContract,
  intent: FormlessUiAuthFieldIntent,
): FormlessUiAuthFieldContract {
  const field = authField.field;
  if (
    authField.purpose !== "profile-input" &&
    field.surface === "create" &&
    intent.intent.type === "createDraftChange" &&
    field.fieldName === intent.intent.fieldName
  ) {
    return {
      ...authField,
      field: {
        ...field,
        draftInput: intent.intent.fieldValue,
        value: intent.intent.fieldValue.value,
      },
    };
  }
  if (
    authField.purpose === "profile-input" &&
    field.surface === "operation" &&
    intent.intent.type === "operationDraftChange" &&
    intent.intent.inputValue &&
    field.inputName === intent.intent.inputName
  ) {
    return {
      ...authField,
      field: {
        ...field,
        draftInput: intent.intent.inputValue,
        value: intent.intent.inputValue.value,
      },
    };
  }
  return authField;
}

function markAuthButtonPending(button: FormlessUiButtonContract): FormlessUiButtonContract {
  if (button.pending?.isPending) {
    return button;
  }
  return {
    ...button,
    pending: { isPending: true, label: button.accessibilityLabel },
  };
}

function authFixtureReference(
  surface: FormlessUiAuthSurfaceContract,
): FormlessUiAuthSurfaceReference {
  return formlessUiAuthSurfaceReference({
    surfaceId: surface.id,
    surfaceKind: surface.surfaceKind,
  });
}

function AuthFixtureSwitcher({
  families,
  fixture,
  fixtures,
  onFixtureChange,
  onViewChange,
}: {
  families: readonly string[];
  fixture: FormlessAuthFixture;
  fixtures: readonly FormlessAuthFixture[];
  onFixtureChange: (fixtureId: FormlessAuthFixtureId) => void;
  onViewChange: (family: string) => void;
}) {
  return (
    <>
      <FormlessFixtureSelector
        label="Auth view"
        onSelectionChange={onViewChange}
        options={families.map((family) => ({ id: family, label: family }))}
        selectedId={fixture.family}
      />
      <FormlessFixtureSelector
        label={`${fixture.family} state`}
        onSelectionChange={onFixtureChange}
        options={fixtures}
        selectedId={fixture.id}
      />
    </>
  );
}

function useAuthFixtureSelection(fixtures: readonly FormlessAuthFixture[]) {
  const defaultFixtureId = fixtures[0]?.id ?? "owner-setup:loading";
  const [fixtureId, setFixtureIdState] = useState(() =>
    resolveFixtureId(readAuthFixtureParam(), fixtures, defaultFixtureId),
  );
  const setFixtureId = (candidate: FormlessAuthFixtureId) => {
    const resolvedFixtureId = resolveFixtureId(candidate, fixtures, defaultFixtureId);
    setFixtureIdState(resolvedFixtureId);
    writeAuthFixtureParam(resolvedFixtureId);
  };
  return [fixtureId, setFixtureId] as const;
}

function resolveFixtureId(
  candidate: string | null,
  fixtures: readonly FormlessAuthFixture[],
  defaultFixtureId: FormlessAuthFixtureId,
) {
  return candidate && fixtures.some((fixture) => fixture.id === candidate)
    ? candidate
    : defaultFixtureId;
}

function readAuthFixtureParam() {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("authFixture");
}

function writeAuthFixtureParam(fixtureId: string) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("authFixture", fixtureId);
  window.history.replaceState(null, "", url);
}
