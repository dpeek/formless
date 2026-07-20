import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  FormlessUiAccountGateAuthSurfaceContract,
  FormlessUiAuthFieldContract,
  FormlessUiAuthFieldAutocomplete,
  FormlessUiAuthIntent,
  FormlessUiAuthPasskeyContract,
  FormlessUiAuthSurfaceBaseContract,
  FormlessUiButtonContract,
  FormlessUiCollaboratorInvitationAuthSurfaceContract,
  FormlessUiContractIntent,
  FormlessUiCreateField,
  FormlessUiOperationInputField,
  FormlessUiOwnerSetupAuthSurfaceContract,
  FormlessUiOwnerSignInAuthSurfaceContract,
  FormlessUiSignupAuthSurfaceContract,
} from "./formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiAuthSurfaceReference,
  formlessUiShellManifestReference,
  isFormlessUiAuthIntent,
  isFormlessUiWorkspaceIntent,
  type FormlessUiAuthSurfaceNode,
  type FormlessUiContractHostNodeSet,
  type FormlessUiShellManifestNode,
} from "./formless-ui-contract-host.ts";
import {
  FormlessUiContractHostProvider,
  useFormlessUiAuthSurface,
} from "./formless-ui-contract-host-react.tsx";

const ownerSetupReference = formlessUiAuthSurfaceReference({
  surfaceId: "auth:owner-setup",
  surfaceKind: "owner-setup",
});
const ownerSignInReference = formlessUiAuthSurfaceReference({
  surfaceId: "auth:owner-sign-in",
  surfaceKind: "owner-sign-in",
});
const accountGateReference = formlessUiAuthSurfaceReference({
  surfaceId: "auth:account-gate",
  surfaceKind: "account-gate",
});
const signupReference = formlessUiAuthSurfaceReference({
  surfaceId: "auth:signup",
  surfaceKind: "signup",
});
const invitationReference = formlessUiAuthSurfaceReference({
  surfaceId: "auth:invitation",
  surfaceKind: "collaborator-invitation-acceptance",
});
const shellReference = formlessUiShellManifestReference("shell:instance");

describe("Formless UI auth memory contract host", () => {
  it("provides purpose-typed reads for every auth state family beside landed references", () => {
    const host = createFormlessUiMemoryContractHost({
      nodes: [...authStateFamilyNodes(), shellNode()],
    });
    const ownerSetup: FormlessUiOwnerSetupAuthSurfaceContract | undefined = host.read({
      ...ownerSetupReference,
    });
    const ownerSignIn: FormlessUiOwnerSignInAuthSurfaceContract | undefined = host.read({
      ...ownerSignInReference,
    });
    const accountGate: FormlessUiAccountGateAuthSurfaceContract | undefined = host.read({
      ...accountGateReference,
    });
    const signup: FormlessUiSignupAuthSurfaceContract | undefined = host.read({
      ...signupReference,
    });
    const invitation: FormlessUiCollaboratorInvitationAuthSurfaceContract | undefined = host.read({
      ...invitationReference,
    });

    expect(ownerSetup?.state).toBe("loading");
    expect(ownerSignIn?.state).toBe("ready");
    expect(accountGate?.gateKind).toBe("profile-completion");
    expect(accountGate?.fields[0]?.field.surface).toBe("operation");
    expect(signup?.step).toBe("email-verification");
    expect(signup?.fields[0]).toMatchObject({
      autocomplete: "one-time-code",
      purpose: "verification-token",
    });
    expect(invitation?.state).toBe("eligible");
    expect(host.read(shellReference)?.title).toBe("Formless");
  });

  it("validates auth surface, canonical field, and embedded intent identities", () => {
    const setup = ownerSetupNode();
    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: [
          {
            ...setup,
            snapshot: { ...setup.snapshot, id: "auth:other" },
          },
        ],
      }),
    ).toThrow("does not match reference");

    const signup = signupNode();
    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: [
          {
            ...signup,
            snapshot: {
              ...signup.snapshot,
              fields: signup.snapshot.fields.map((field) => ({
                ...field,
                intent: { ...field.intent, surfaceId: "auth:other" },
              })),
            },
          },
        ],
      }),
    ).toThrow("invalid field contract");

    const signIn = ownerSignInNode();
    const passkey = signIn.snapshot.passkey;
    if (passkey?.availability !== "available") {
      throw new Error("Expected an available sign-in passkey fixture.");
    }
    expect(() =>
      createFormlessUiMemoryContractHost({
        nodes: [
          {
            ...signIn,
            snapshot: {
              ...signIn.snapshot,
              passkey: {
                ...passkey,
                intent: { ...passkey.intent, passkeyId: "passkey:other" },
              },
            },
          },
        ],
      }),
    ).toThrow("invalid passkey intent");
  });

  it("reuses semantic identity and scopes auth notifications and removal", () => {
    const host = createFormlessUiMemoryContractHost({
      nodes: [ownerSignInNode(), shellNode()],
    });
    const initialAuth = host.read(ownerSignInReference);
    const initialShell = host.read(shellReference);
    const calls: string[] = [];

    host.subscribe(ownerSignInReference, () => calls.push("auth"));
    host.subscribe(shellReference, () => calls.push("shell"));

    host.publish([ownerSignInNode(), shellNode()]);

    expect(calls).toEqual([]);
    expect(host.read(ownerSignInReference)).toBe(initialAuth);
    expect(host.read(shellReference)).toBe(initialShell);

    host.publish([ownerSignInNode("submitting"), shellNode()]);

    expect(calls).toEqual(["auth"]);
    expect(host.read(shellReference)).toBe(initialShell);

    host.publish([shellNode()]);

    expect(calls).toEqual(["auth", "auth"]);
    expect(host.read(ownerSignInReference)).toBeUndefined();
    expect(host.read(shellReference)).toBe(initialShell);
  });

  it("keeps auth server snapshots stable for server rendering and hydration", () => {
    const serverNodes = [ownerSetupNode()];
    const host = createFormlessUiMemoryContractHost({
      nodes: [ownerSetupNode("ready")],
      serverNodes,
    });
    const serverSnapshot = host.getServerSnapshot(ownerSetupReference);

    expect(serverSnapshot?.state).toBe("loading");
    expect(host.read(ownerSetupReference)?.state).toBe("ready");
    expect(host.getServerSnapshot(ownerSetupReference)).toBe(serverSnapshot);
    expect(
      renderToStaticMarkup(
        <FormlessUiContractHostProvider host={host}>
          <OwnerSetupState />
        </FormlessUiContractHostProvider>,
      ),
    ).toContain("loading");
  });

  it("dispatches every canonical auth intent with exact identity", async () => {
    const calls: FormlessUiContractIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        calls.push(intent);
      },
      nodes: [ownerSetupNode("ready")],
    });
    const intents: readonly FormlessUiAuthIntent[] = [
      {
        actionId: "action:submit",
        controlId: "control:submit",
        surfaceId: ownerSetupReference.surfaceId,
        type: "authAction",
      },
      {
        destinationId: "destination:account",
        controlId: "control:continue",
        surfaceId: ownerSetupReference.surfaceId,
        type: "authContinuation",
      },
      {
        fieldId: "field:display-name",
        intent: {
          fieldName: "displayName",
          fieldValue: { kind: "input", value: "Ada Lovelace" },
          type: "createDraftChange",
        },
        surfaceId: ownerSetupReference.surfaceId,
        type: "authField",
      },
      {
        controlId: "control:passkey",
        passkeyId: "passkey:create",
        surfaceId: ownerSetupReference.surfaceId,
        type: "authPasskey",
      },
      {
        accepted: true,
        policyId: "policy:terms",
        surfaceId: ownerSetupReference.surfaceId,
        type: "authPolicySelection",
      },
    ];

    for (const intent of intents) {
      await host.dispatch(intent);
    }

    expect(calls).toEqual(intents);
    intents.forEach((intent, index) => {
      expect(calls[index]).toBe(intent);
      expect(isFormlessUiAuthIntent(intent)).toBe(true);
      expect(isFormlessUiWorkspaceIntent(intent)).toBe(false);
    });
  });

  it("serializes complete display-safe auth nodes without runtime secrets", () => {
    const serialized = JSON.stringify(authStateFamilyNodes());
    const forbiddenKeys = [
      "setupToken",
      "rawInvitationToken",
      "tokenHash",
      "challengeId",
      "credentialResponse",
      "centralSessionId",
      "sessionCookie",
      "handoffSecret",
      "storageIdentity",
      "providerResponse",
      "recoveryMaterial",
    ];

    expect(JSON.parse(serialized)).toHaveLength(5);
    forbiddenKeys.forEach((key) => expect(serialized).not.toContain(`"${key}"`));
  });
});

function OwnerSetupState() {
  const surface = useFormlessUiAuthSurface(ownerSetupReference);
  return <span>{surface?.state}</span>;
}

function authStateFamilyNodes() {
  return [
    ownerSetupNode(),
    ownerSignInNode(),
    accountGateNode(),
    signupNode(),
    invitationNode(),
  ] satisfies FormlessUiContractHostNodeSet;
}

function ownerSetupNode(
  state: FormlessUiOwnerSetupAuthSurfaceContract["state"] = "loading",
): FormlessUiAuthSurfaceNode & { snapshot: FormlessUiOwnerSetupAuthSurfaceContract } {
  return {
    reference: ownerSetupReference,
    snapshot: {
      ...authSurfaceBase(ownerSetupReference.surfaceId, "Owner setup"),
      fields:
        state === "ready"
          ? [
              authCreateField(
                ownerSetupReference.surfaceId,
                "display-name",
                createTextField("field:display-name", "displayName", "Name", "Ada Lovelace"),
                "name",
              ),
            ]
          : [],
      state,
      surfaceKind: "owner-setup",
    },
  };
}

function ownerSignInNode(
  state: FormlessUiOwnerSignInAuthSurfaceContract["state"] = "ready",
): FormlessUiAuthSurfaceNode & { snapshot: FormlessUiOwnerSignInAuthSurfaceContract } {
  return {
    reference: ownerSignInReference,
    snapshot: {
      ...authSurfaceBase(ownerSignInReference.surfaceId, "Sign in"),
      passkey: authPasskey(ownerSignInReference.surfaceId, "sign-in"),
      pending: state === "submitting",
      state,
      surfaceKind: "owner-sign-in",
    },
  };
}

function accountGateNode(): FormlessUiAuthSurfaceNode & {
  snapshot: FormlessUiAccountGateAuthSurfaceContract;
} {
  const field = operationTextField(
    "field:profile-display-name",
    "displayName",
    "Display name",
    "Ada Lovelace",
  );
  return {
    reference: accountGateReference,
    snapshot: {
      ...authSurfaceBase(accountGateReference.surfaceId, "Complete your profile"),
      fields: [authOperationField(accountGateReference.surfaceId, field)],
      gateKind: "profile-completion",
      state: "ready",
      surfaceKind: "account-gate",
    },
  };
}

function signupNode(): FormlessUiAuthSurfaceNode & {
  snapshot: FormlessUiSignupAuthSurfaceContract;
} {
  const field = createTextField(
    "field:verification-token",
    "verificationToken",
    "Verification token",
    "opaque-base64url-value",
  );
  return {
    reference: signupReference,
    snapshot: {
      ...authSurfaceBase(signupReference.surfaceId, "Verify your email"),
      fields: [
        authCreateField(signupReference.surfaceId, "verification-token", field, "one-time-code"),
      ],
      state: "ready",
      step: "email-verification",
      surfaceKind: "signup",
    },
  };
}

function invitationNode(): FormlessUiAuthSurfaceNode & {
  snapshot: FormlessUiCollaboratorInvitationAuthSurfaceContract;
} {
  return {
    reference: invitationReference,
    snapshot: {
      ...authSurfaceBase(invitationReference.surfaceId, "Accept invitation"),
      facts: [
        {
          id: "fact:target-email",
          kind: "authFact",
          label: "Email",
          value: "ada@example.com",
        },
      ],
      passkey: authPasskey(invitationReference.surfaceId, "accept-invitation"),
      state: "eligible",
      surfaceKind: "collaborator-invitation-acceptance",
    },
  };
}

function authSurfaceBase(surfaceId: string, title: string): FormlessUiAuthSurfaceBaseContract {
  return {
    actions: [],
    facts: [],
    fields: [],
    frame: {
      accessibilityLabel: title,
      brand: { kind: "authBrand", label: "Formless" },
      heading: { kind: "authHeading", title },
      kind: "authFrame",
    },
    id: surfaceId,
    kind: "authSurface",
    pending: false,
    policies: [],
  };
}

function authCreateField(
  surfaceId: string,
  purpose: Exclude<FormlessUiAuthFieldContract["purpose"], "profile-input">,
  field: FormlessUiCreateField,
  autocomplete?: FormlessUiAuthFieldAutocomplete,
): FormlessUiAuthFieldContract {
  return {
    autocomplete,
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose,
  };
}

function authOperationField(
  surfaceId: string,
  field: FormlessUiOperationInputField,
): FormlessUiAuthFieldContract {
  return {
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: "profile-input",
  };
}

function authPasskey(
  surfaceId: string,
  purpose: FormlessUiAuthPasskeyContract["purpose"],
): FormlessUiAuthPasskeyContract & { availability: "available" } {
  const id = `passkey:${purpose}`;
  const control = button(`control:${id}`, "Continue with a passkey", "primary");
  return {
    availability: "available",
    control,
    id,
    intent: { controlId: control.id, passkeyId: id, surfaceId, type: "authPasskey" },
    kind: "authPasskey",
    purpose,
  };
}

function createTextField(
  fieldId: string,
  fieldName: string,
  label: string,
  value: string,
): FormlessUiCreateField {
  const field = { label, required: true, type: "text" as const };
  return {
    access: { canPatch: true, kind: "editable", writable: true },
    commit: "submit",
    control: {
      control: { inputType: "text", kind: "input" },
      controlKind: "text",
      createDefaultChecked: false,
      createDefaultValue: undefined,
      editor: "text",
      field,
      inputAttributes: {},
      kind: "text",
      label,
      required: true,
    },
    density: "default",
    draftInput: { kind: "input", value },
    editor: "text",
    field,
    fieldId,
    fieldName,
    label,
    labelVisibility: "visible",
    mode: "editor",
    required: true,
    surface: "create",
    value,
  };
}

function operationTextField(
  fieldId: string,
  fieldName: string,
  label: string,
  value: string,
): FormlessUiOperationInputField {
  const field = createTextField(fieldId, fieldName, label, value);
  return {
    ...field,
    input: { control: "text", label, name: fieldName, required: true },
    inputName: fieldName,
    surface: "operation",
  };
}

function button(
  id: string,
  label: string,
  prominence: FormlessUiButtonContract["prominence"] = "secondary",
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    prominence,
    type: "button",
  };
}

function shellNode(): FormlessUiShellManifestNode {
  return {
    reference: shellReference,
    snapshot: {
      accessibilityLabel: "Formless application shell",
      activeDestination: null,
      id: shellReference.shellId,
      kind: "shellManifest",
      navigationSections: [],
      scope: "multiApp",
      title: "Formless",
    },
  };
}
