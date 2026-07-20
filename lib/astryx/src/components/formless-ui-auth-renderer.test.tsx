import { readFile } from "node:fs/promises";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiAccountGateAuthSurfaceContract,
  FormlessUiAuthActionContract,
  FormlessUiAuthFieldContract,
  FormlessUiAuthIntent,
  FormlessUiAuthPolicyContract,
  FormlessUiAuthSurfaceBaseContract,
  FormlessUiAuthSurfaceContract,
  FormlessUiButtonContract,
  FormlessUiCollaboratorInvitationAuthSurfaceContract,
  FormlessUiCreateField,
  FormlessUiOperationInputField,
  FormlessUiOwnerSetupAuthSurfaceContract,
  FormlessUiOwnerSignInAuthSurfaceContract,
  FormlessUiSignupAuthSurfaceContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiAuthSurfaceReference,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  AstryxAuthRenderer,
  AstryxSubscribedAuthRenderer,
  dispatchAstryxAuthFieldIntent,
} from "./formless-ui-auth-renderer.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

vi.mock("@astryxdesign/core/Button", () => ({
  Button: ({
    children,
    isDisabled,
    isLoading,
    label,
    onClick,
    type,
    ...props
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
    isLoading?: boolean;
    label: string;
    onClick?: () => void;
    type?: "button" | "submit";
    [key: `data-${string}`]: string | undefined;
  }) =>
    createElement(
      "button",
      {
        ...dataAttributes(props),
        "aria-busy": isLoading || undefined,
        "aria-label": label,
        disabled: isDisabled,
        onClick,
        type,
      },
      children,
    ),
}));

vi.mock("@astryxdesign/core/Spinner", () => ({
  Spinner: ({ "aria-label": label }: { "aria-label"?: string }) =>
    createElement("span", { "aria-label": label, role: "status" }),
}));

vi.mock("@astryxdesign/core/TextInput", () => ({
  TextInput: ({
    autoComplete,
    label,
    onChange,
    type,
    value,
    ...props
  }: {
    autoComplete?: string;
    label: string;
    onChange?: (value: string) => void;
    type?: string;
    value: string;
    [key: `data-${string}`]: string | undefined;
  }) =>
    createElement(
      "label",
      undefined,
      label,
      createElement("input", {
        ...dataAttributes(props),
        "aria-label": label,
        autoComplete,
        onChange: (event: { currentTarget: { value: string } }) =>
          onChange?.(event.currentTarget.value),
        type,
        value,
      }),
    ),
}));

vi.mock("@astryxdesign/core/CheckboxInput", () => ({
  CheckboxInput: ({
    isDisabled,
    isReadOnly,
    isRequired,
    label,
    onChange,
    value,
  }: {
    isDisabled?: boolean;
    isReadOnly?: boolean;
    isRequired?: boolean;
    label: string;
    onChange?: (value: boolean) => void;
    value: boolean;
  }) =>
    createElement(
      "label",
      undefined,
      createElement("input", {
        "aria-label": label,
        checked: value,
        disabled: isDisabled,
        onChange: (event: { currentTarget: { checked: boolean } }) =>
          onChange?.(event.currentTarget.checked),
        readOnly: isReadOnly,
        required: isRequired,
        type: "checkbox",
      }),
      label,
    ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ownerSignInReference = formlessUiAuthSurfaceReference({
  surfaceId: "auth:test:owner-sign-in",
  surfaceKind: "owner-sign-in",
});

describe("Astryx auth renderer", () => {
  it.each([
    ["loading", ownerSignInSurface("loading", authMessage("Loading account", "info"))],
    ["blocked", accountGateSurface("blocked", authMessage("Account blocked", "warning"))],
    ["unavailable", invitationSurface("unavailable", authMessage("Invite unavailable", "warning"))],
    ["failed", signupSurface("failed", authMessage("Signup failed", "danger"))],
    ["complete", ownerSetupSurface("complete", authMessage("Setup complete", "success"))],
    ["continuing", ownerSignInSurface("continuing", authMessage("Continuing", "info"))],
  ] satisfies readonly [string, FormlessUiAuthSurfaceContract][])(
    "renders the accessible %s frame, card, and status hierarchy",
    (state, surface) => {
      const html = renderAuth(surface);

      expect(html).toContain(`aria-label="${surface.frame.accessibilityLabel}"`);
      expect(html).toContain(`data-formless-astryx-auth-surface-state="${state}"`);
      expect(html).toContain(`data-formless-astryx-auth-card="${surface.id}"`);
      expect(html).toContain("<h1");
      expect(html).toContain(`id="${surface.id}:heading"`);
      expect(html).toContain(surface.frame.brand.label);
      expect(html).toContain(surface.frame.heading.title);
      expect(html).toContain(surface.message?.title);
      expect(html).not.toContain("Choose destination");
      expect(html).not.toContain("Decline invitation");

      if (state === "loading") {
        expect(html).toContain(`data-formless-astryx-auth-loading="${surface.id}"`);
        expect(html).toContain('role="status"');
      }

      if (surface.message?.severity === "danger" || surface.message?.severity === "warning") {
        expect(html).toContain('role="alert"');
      }
    },
  );

  it("composes controlled opaque-token, policy, fact, feedback, action, and passkey primitives", () => {
    const tokenSurface = signupSurface("ready", authMessage("Enter the token", "info"), {
      actions: [authAction("auth:test:signup", "submit", "Verify")],
      facts: [authFact("email", "Email", "ada@example.com")],
      feedback: {
        detail: "Paste the complete value.",
        id: "feedback:token",
        kind: "authFeedback",
        severity: "danger",
        title: "Token invalid",
      },
      fields: [authCreateField("auth:test:signup", verificationTokenField())],
      policies: [termsPolicy("auth:test:signup")],
    });
    const passkeySurface = ownerSignInSurface("ready", undefined, {
      passkey: availablePasskey(ownerSignInReference.surfaceId),
    });
    const unavailableSurface = ownerSignInSurface(
      "passkey-unavailable",
      authMessage("Passkeys unavailable", "warning"),
      {
        passkey: {
          availability: "unavailable",
          id: "passkey:unavailable",
          kind: "authPasskey",
          purpose: "sign-in",
          unavailableReason: "This browser does not support passkeys.",
        },
      },
    );
    const tokenHtml = renderAuth(tokenSurface);
    const passkeyHtml = renderAuth(passkeySurface);
    const unavailableHtml = renderAuth(unavailableSurface);

    expect(tokenHtml).toContain('data-formless-astryx-auth-field="field:verification-token"');
    expect(tokenHtml).toMatch(/auto[Cc]omplete="one-time-code"/);
    expect(tokenHtml).toContain('value="opaque-base64url-value"');
    expect(tokenHtml).toContain('data-formless-astryx-auth-policy="policy:terms"');
    expect(tokenHtml).toContain('href="/runtime-policy/terms"');
    expect(tokenHtml).toContain('data-formless-astryx-auth-facts="auth:test:signup"');
    expect(tokenHtml).toContain("ada@example.com");
    expect(tokenHtml).toContain('data-formless-astryx-auth-status="feedback:token"');
    expect(tokenHtml).toContain('data-formless-astryx-auth-control-kind="action"');
    expect(passkeyHtml).toContain('data-formless-astryx-auth-control-kind="passkey"');
    expect(unavailableHtml).toContain('data-formless-astryx-auth-passkey="passkey:unavailable"');
    expect(unavailableHtml).toContain("This browser does not support passkeys.");
    expect(unavailableHtml).not.toContain("Passkeys unavailable");
    expect(unavailableHtml).not.toContain('data-formless-astryx-auth-control-kind="passkey"');
    expect(`${tokenHtml}${passkeyHtml}${unavailableHtml}`).not.toContain("raw-invitation-token");
    expect(`${tokenHtml}${passkeyHtml}${unavailableHtml}`).not.toContain("central-session-secret");
  });

  it("dispatches exact controlled field, policy, submit, retry, passkey, and continuation intents", async () => {
    const intents: FormlessUiAuthIntent[] = [];
    const onIntent = (intent: FormlessUiAuthIntent) => {
      intents.push(intent);
    };
    const tokenSurface = signupSurface("ready", undefined, {
      actions: [authAction("auth:test:signup", "submit", "Verify")],
      fields: [authCreateField("auth:test:signup", verificationTokenField())],
      policies: [termsPolicy("auth:test:signup")],
    });
    const tokenRenderer = await mount(
      <AstryxAuthRenderer onIntent={onIntent} surface={tokenSurface} />,
    );

    await act(async () => {
      tokenRenderer.root.findByType(TextInput).props.onChange("next-opaque-token");
      tokenRenderer.root.findByType(CheckboxInput).props.onChange(true);
      tokenRenderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined });
    });

    const retrySurface = signupSurface("failed", authMessage("Failed", "danger"), {
      actions: [authAction("auth:test:signup", "retry", "Try again")],
    });
    const retryRenderer = await mount(
      <AstryxAuthRenderer onIntent={onIntent} surface={retrySurface} />,
    );
    await act(async () => {
      authButtonByControlId(retryRenderer, "auth:test:signup:action:retry:control").props.onClick();
    });

    const passkeySurface = ownerSignInSurface("ready", undefined, {
      passkey: availablePasskey(ownerSignInReference.surfaceId),
    });
    const passkeyRenderer = await mount(
      <AstryxAuthRenderer onIntent={onIntent} surface={passkeySurface} />,
    );
    await act(async () => {
      passkeyRenderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined });
    });

    const continuingSurface = ownerSignInSurface("continuing", undefined, {
      continuation: authContinuation(ownerSignInReference.surfaceId),
    });
    const continuingRenderer = await mount(
      <AstryxAuthRenderer onIntent={onIntent} surface={continuingSurface} />,
    );
    await act(async () => {
      authButtonByControlId(
        continuingRenderer,
        `${ownerSignInReference.surfaceId}:destination:account:control`,
      ).props.onClick();
    });

    expect(intents).toEqual([
      {
        fieldId: "field:verification-token",
        intent: {
          fieldName: "verificationToken",
          fieldValue: { kind: "input", value: "next-opaque-token" },
          type: "createDraftChange",
        },
        surfaceId: "auth:test:signup",
        type: "authField",
      },
      {
        accepted: true,
        policyId: "policy:terms",
        surfaceId: "auth:test:signup",
        type: "authPolicySelection",
      },
      {
        actionId: "auth:test:signup:action:submit",
        controlId: "auth:test:signup:action:submit:control",
        surfaceId: "auth:test:signup",
        type: "authAction",
      },
      {
        actionId: "auth:test:signup:action:retry",
        controlId: "auth:test:signup:action:retry:control",
        surfaceId: "auth:test:signup",
        type: "authAction",
      },
      {
        controlId: `${ownerSignInReference.surfaceId}:passkey:control`,
        passkeyId: `${ownerSignInReference.surfaceId}:passkey`,
        surfaceId: ownerSignInReference.surfaceId,
        type: "authPasskey",
      },
      {
        controlId: `${ownerSignInReference.surfaceId}:destination:account:control`,
        destinationId: `${ownerSignInReference.surfaceId}:destination:account`,
        surfaceId: ownerSignInReference.surfaceId,
        type: "authContinuation",
      },
    ]);

    const operationField = authOperationField("auth:test:account-gate", operationTextField());
    await dispatchAstryxAuthFieldIntent(onIntent, operationField, {
      inputName: "displayName",
      inputValue: { kind: "input", value: "Ada Byron" },
      type: "operationDraftChange",
    });
    expect(intents.at(-1)).toEqual({
      fieldId: "field:profile-display-name",
      intent: {
        inputName: "displayName",
        inputValue: { kind: "input", value: "Ada Byron" },
        type: "operationDraftChange",
      },
      surfaceId: "auth:test:account-gate",
      type: "authField",
    });

    await unmountAll(tokenRenderer, retryRenderer, passkeyRenderer, continuingRenderer);
  });

  it("keeps pending controls disabled and omits unavailable actions", async () => {
    const intents: FormlessUiAuthIntent[] = [];
    const pendingSurface = signupSurface("submitting", undefined, {
      actions: [authAction("auth:test:signup", "submit", "Verifying", true)],
      fields: [authCreateField("auth:test:signup", verificationTokenField())],
      pending: true,
    });
    const renderer = await mount(
      <AstryxAuthRenderer
        onIntent={(intent) => {
          intents.push(intent);
        }}
        surface={pendingSurface}
      />,
    );
    const submitButton = authButtonByControlId(renderer, "auth:test:signup:action:submit:control");

    expect(submitButton.props.isDisabled).toBe(true);
    expect(submitButton.props.isLoading).toBe(true);
    expect(submitButton.props.onClick).toBeUndefined();
    expect(renderer.root.findByType("input").props["aria-busy"]).toBeUndefined();
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined });
    });
    expect(intents).toEqual([]);
    expect(renderer.root.findAllByType(Button)).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Contact owner");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Decline");

    await unmountAll(renderer);
  });

  it("subscribes to one auth host boundary and dispatches through that host", async () => {
    const intents: FormlessUiAuthIntent[] = [];
    const host = createFormlessUiMemoryContractHost({
      dispatch: (intent) => {
        if (intent.type.startsWith("auth")) intents.push(intent as FormlessUiAuthIntent);
      },
      nodes: [
        {
          reference: ownerSignInReference,
          snapshot: ownerSignInSurface("loading", authMessage("Loading account", "info")),
        },
      ],
    });
    const renderer = await mount(
      <FormlessUiContractHostProvider host={host}>
        <AstryxSubscribedAuthRenderer reference={ownerSignInReference} />
      </FormlessUiContractHostProvider>,
    );

    expect(authSurfaceNode(renderer).props["data-formless-astryx-auth-surface-state"]).toBe(
      "loading",
    );
    await act(async () => {
      host.publish([
        {
          reference: ownerSignInReference,
          snapshot: ownerSignInSurface("continuing", undefined, {
            continuation: authContinuation(ownerSignInReference.surfaceId),
          }),
        },
      ]);
    });
    expect(authSurfaceNode(renderer).props["data-formless-astryx-auth-surface-state"]).toBe(
      "continuing",
    );
    await act(async () => {
      authButtonByControlId(
        renderer,
        `${ownerSignInReference.surfaceId}:destination:account:control`,
      ).props.onClick();
    });
    expect(intents).toEqual([authContinuation(ownerSignInReference.surfaceId).intent]);

    await unmountAll(renderer);
  });

  it("stays runtime-free", async () => {
    const rendererSource = await readFile(
      new URL("./formless-ui-auth-renderer.tsx", import.meta.url),
      "utf8",
    );
    const imports = importSpecifiers(rendererSource);

    expect(
      imports.filter((specifier) =>
        /(?:^|\/)(?:src\/app|src\/client|instance-auth|gateway|storage|replica|routing|operation-controller)(?:\/|$)|\bwouter\b/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
    expect(rendererSource).not.toMatch(
      /\bclassName\b|\buseEffect\b|\buseState\b|\blocalStorage\b|\bsessionStorage\b|\bdocument\.|\bwindow\.|\bfetch\(|\bcredentials\.|\bnavigator\./,
    );
  });
});

function ownerSetupSurface(
  state: FormlessUiOwnerSetupAuthSurfaceContract["state"],
  message?: FormlessUiOwnerSetupAuthSurfaceContract["message"],
  overrides: Partial<FormlessUiAuthSurfaceBaseContract> = {},
): FormlessUiOwnerSetupAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:owner-setup", "Owner setup", message),
    ...overrides,
    state,
    surfaceKind: "owner-setup",
  };
}

function ownerSignInSurface(
  state: FormlessUiOwnerSignInAuthSurfaceContract["state"],
  message?: FormlessUiOwnerSignInAuthSurfaceContract["message"],
  overrides: Partial<FormlessUiAuthSurfaceBaseContract> = {},
): FormlessUiOwnerSignInAuthSurfaceContract {
  return {
    ...authSurfaceBase(ownerSignInReference.surfaceId, "Owner sign in", message),
    ...overrides,
    state,
    surfaceKind: "owner-sign-in",
  };
}

function accountGateSurface(
  state: Exclude<
    FormlessUiAccountGateAuthSurfaceContract["state"],
    "complete" | "continuing" | "failed" | "loading"
  >,
  message?: FormlessUiAccountGateAuthSurfaceContract["message"],
  overrides: Partial<FormlessUiAuthSurfaceBaseContract> = {},
): FormlessUiAccountGateAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:account-gate", "Account gate", message),
    ...overrides,
    gateKind: "role-review",
    state,
    surfaceKind: "account-gate",
  };
}

function signupSurface(
  state: Exclude<FormlessUiSignupAuthSurfaceContract["state"], "loading">,
  message?: FormlessUiSignupAuthSurfaceContract["message"],
  overrides: Partial<FormlessUiAuthSurfaceBaseContract> = {},
): FormlessUiSignupAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:signup", "Sign up", message),
    ...overrides,
    state,
    step: "email-verification",
    surfaceKind: "signup",
  };
}

function invitationSurface(
  state: FormlessUiCollaboratorInvitationAuthSurfaceContract["state"],
  message?: FormlessUiCollaboratorInvitationAuthSurfaceContract["message"],
  overrides: Partial<FormlessUiAuthSurfaceBaseContract> = {},
): FormlessUiCollaboratorInvitationAuthSurfaceContract {
  return {
    ...authSurfaceBase("auth:test:invitation", "Accept invitation", message),
    ...overrides,
    state,
    surfaceKind: "collaborator-invitation-acceptance",
  };
}

function authSurfaceBase(
  id: string,
  title: string,
  message?: FormlessUiAuthSurfaceBaseContract["message"],
): FormlessUiAuthSurfaceBaseContract {
  return {
    actions: [],
    facts: [],
    fields: [],
    frame: {
      accessibilityLabel: `${title} authentication`,
      brand: { kind: "authBrand", label: "Formless" },
      heading: { description: `${title} description`, kind: "authHeading", title },
      kind: "authFrame",
    },
    id,
    kind: "authSurface",
    message,
    pending: false,
    policies: [],
  };
}

function authMessage(
  title: string,
  severity: NonNullable<FormlessUiAuthSurfaceBaseContract["message"]>["severity"],
) {
  return {
    id: `message:${title.toLowerCase().replaceAll(" ", "-")}`,
    kind: "authMessage" as const,
    severity,
    title,
  };
}

function authFact(id: string, label: string, value: string) {
  return { id: `fact:${id}`, kind: "authFact" as const, label, value };
}

function authCreateField(
  surfaceId: string,
  field: FormlessUiCreateField,
): FormlessUiAuthFieldContract {
  return {
    autocomplete: "one-time-code",
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: "verification-token",
  };
}

function authOperationField(
  surfaceId: string,
  field: FormlessUiOperationInputField,
): FormlessUiAuthFieldContract {
  return {
    autocomplete: "name",
    field,
    intent: { fieldId: field.fieldId, surfaceId, type: "authField" },
    kind: "authField",
    purpose: "profile-input",
  };
}

function verificationTokenField(): FormlessUiCreateField {
  return createTextField(
    "field:verification-token",
    "verificationToken",
    "Verification token",
    "opaque-base64url-value",
  );
}

function operationTextField(): FormlessUiOperationInputField {
  const field = createTextField(
    "field:profile-display-name",
    "displayName",
    "Display name",
    "Ada Lovelace",
  );
  return {
    ...field,
    input: { control: "text", label: "Display name", name: "displayName", required: true },
    inputName: "displayName",
    surface: "operation",
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

function termsPolicy(surfaceId: string): FormlessUiAuthPolicyContract {
  return {
    accepted: false,
    description: "Required to continue.",
    destination: {
      href: "/runtime-policy/terms",
      kind: "authPolicyDestination",
      label: "Read terms",
    },
    id: "policy:terms",
    kind: "authPolicy",
    label: "Accept terms",
    required: true,
    selectionIntent: {
      accepted: true,
      policyId: "policy:terms",
      surfaceId,
      type: "authPolicySelection",
    },
  };
}

function authAction(
  surfaceId: string,
  purpose: FormlessUiAuthActionContract["purpose"],
  label: string,
  pending = false,
): FormlessUiAuthActionContract {
  const id = `${surfaceId}:action:${purpose}`;
  const control = authButton(
    `${id}:control`,
    label,
    purpose === "submit" ? "primary" : "secondary",
    purpose === "submit" ? "submit" : "button",
    pending,
  );
  return {
    control,
    id,
    intent: { actionId: id, controlId: control.id, surfaceId, type: "authAction" },
    kind: "authAction",
    purpose,
  };
}

function availablePasskey(surfaceId: string) {
  const id = `${surfaceId}:passkey`;
  const control = authButton(`${id}:control`, "Continue with a passkey", "primary", "submit");
  return {
    availability: "available" as const,
    control,
    id,
    intent: { controlId: control.id, passkeyId: id, surfaceId, type: "authPasskey" as const },
    kind: "authPasskey" as const,
    purpose: "sign-in" as const,
  };
}

function authContinuation(surfaceId: string) {
  const destinationId = `${surfaceId}:destination:account`;
  const control = authButton(`${destinationId}:control`, "Continue", "primary", "button");
  return {
    control,
    destination: {
      detail: "/formless/auth",
      id: destinationId,
      kind: "authContinuationDestination" as const,
      label: "Account",
    },
    intent: {
      controlId: control.id,
      destinationId,
      surfaceId,
      type: "authContinuation" as const,
    },
    kind: "authContinuation" as const,
  };
}

function authButton(
  id: string,
  label: string,
  prominence: FormlessUiButtonContract["prominence"],
  type: FormlessUiButtonContract["type"],
  pending = false,
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    id,
    kind: "button",
    ...(pending ? { pending: { isPending: true, label } } : {}),
    prominence,
    type,
  };
}

function renderAuth(surface: FormlessUiAuthSurfaceContract) {
  return renderToStaticMarkup(<AstryxAuthRenderer onIntent={() => undefined} surface={surface} />);
}

async function mount(element: ReactElement) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(element);
  });
  if (!renderer) throw new Error("Expected renderer to mount.");
  return renderer;
}

async function unmountAll(...renderers: ReactTestRenderer[]) {
  await act(async () => {
    renderers.forEach((renderer) => renderer.unmount());
  });
}

function authButtonByControlId(renderer: ReactTestRenderer, controlId: string) {
  return renderer.root
    .findAllByType(Button)
    .find((button) => button.props["data-formless-astryx-auth-control"] === controlId)!;
}

function authSurfaceNode(renderer: ReactTestRenderer) {
  return renderer.root.findByProps({
    "data-formless-astryx-auth-surface": ownerSignInReference.surfaceId,
  });
}

function importSpecifiers(source: string) {
  return Array.from(source.matchAll(/\bfrom\s+["']([^"']+)["']/g), (match) => match[1]!);
}

function dataAttributes(props: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith("data-")));
}
