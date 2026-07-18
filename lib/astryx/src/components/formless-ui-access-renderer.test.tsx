import { readFile } from "node:fs/promises";
import { Dialog } from "@astryxdesign/core/Dialog";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiAccessActionContract,
  FormlessUiAccessConfirmationContract,
  FormlessUiAccessControlledFieldContract,
  FormlessUiAccessDisplayFactContract,
  FormlessUiAccessFeedbackContract,
  FormlessUiAccessGrantOptionGroupContract,
  FormlessUiAccessGrantSelectionContract,
  FormlessUiAccessIntent,
  FormlessUiAccessInvitationAuthoringContract,
  FormlessUiAccessInvitationContract,
  FormlessUiAccessManifestContract,
  FormlessUiAccessPersonContract,
  FormlessUiAccessReadyContract,
  FormlessUiButtonContract,
} from "../formless-ui-contract.ts";
import {
  createFormlessUiMemoryContractHost,
  formlessUiAccessInvitationAuthoringReference,
  formlessUiAccessManifestReference,
} from "../formless-ui-contract-host.ts";
import { FormlessUiContractHostProvider } from "../formless-ui-contract-host-react.tsx";
import {
  AstryxAccessInvitationAuthoring,
  AstryxAccessInvitationAuthoringContent,
  AstryxAccessRenderer,
  AstryxSubscribedAccessRenderer,
  astryxAccessFeedbackToastOptions,
} from "./formless-ui-access-renderer.tsx";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  keyframes: () => "animation",
  props: () => ({}),
}));

vi.mock("@astryxdesign/core/AlertDialog", () => ({
  AlertDialog: ({
    actionLabel,
    cancelLabel,
    description,
    isOpen,
    onAction,
    onOpenChange,
    title,
    ...props
  }: {
    actionLabel: string;
    cancelLabel?: string;
    description: string;
    isOpen: boolean;
    onAction: () => void;
    onOpenChange: (open: boolean) => void;
    title: string;
    [key: `data-${string}`]: string | undefined;
  }) =>
    isOpen
      ? createElement(
          "div",
          {
            ...dataAttributes(props),
            "aria-label": title,
            onAction,
            onOpenChange,
            role: "alertdialog",
          },
          createElement("h2", undefined, title),
          createElement("p", undefined, description),
          createElement("button", { onClick: () => onOpenChange(false) }, cancelLabel),
          createElement("button", { onClick: onAction }, actionLabel),
        )
      : null,
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

vi.mock("@astryxdesign/core/Dialog", () => ({
  Dialog: ({
    children,
    isOpen,
    ...props
  }: {
    children: ReactNode;
    isOpen: boolean;
    [key: string]: unknown;
  }) =>
    isOpen ? createElement("dialog", { ...props, open: true, role: "dialog" }, children) : null,
  DialogHeader: ({
    subtitle,
    title,
  }: {
    onOpenChange: (open: boolean) => void;
    subtitle?: string;
    title: string;
  }) =>
    createElement(
      "header",
      undefined,
      createElement("h2", undefined, title),
      subtitle ? createElement("p", undefined, subtitle) : null,
    ),
}));

vi.mock("@astryxdesign/core/TextInput", () => ({
  TextInput: ({
    label,
    value,
    ...props
  }: {
    label: string;
    value: string;
    [key: string]: unknown;
  }) =>
    createElement(
      "label",
      undefined,
      label,
      createElement("input", { ...dataAttributes(props), "aria-label": label, value }),
    ),
}));

vi.mock("@astryxdesign/core/DateTimeInput", () => ({
  DateTimeInput: ({
    label,
    value,
    ...props
  }: {
    label: string;
    value?: string;
    [key: string]: unknown;
  }) =>
    createElement(
      "label",
      undefined,
      label,
      createElement("input", {
        ...dataAttributes(props),
        "aria-label": label,
        type: "datetime-local",
        value,
      }),
    ),
}));

vi.mock("@astryxdesign/core/Selector", () => ({
  Selector: ({
    label,
    value,
    ...props
  }: {
    label: string;
    value?: string;
    [key: string]: unknown;
  }) =>
    createElement(
      "div",
      { ...dataAttributes(props), "aria-label": label, role: "combobox" },
      value,
    ),
}));

vi.mock("@astryxdesign/core/MultiSelector", () => ({
  MultiSelector: ({
    label,
    value,
    ...props
  }: {
    label: string;
    value: readonly string[];
    [key: string]: unknown;
  }) =>
    createElement(
      "div",
      { ...dataAttributes(props), "aria-label": label, role: "combobox" },
      value.join(", "),
    ),
}));

vi.mock("@astryxdesign/core/Spinner", () => ({
  Spinner: ({ "aria-label": label }: { "aria-label"?: string }) =>
    createElement("span", { "aria-label": label, role: "status" }),
}));

vi.mock("@astryxdesign/core/Toast", () => ({
  useToast: () => () => undefined,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const accessReference = formlessUiAccessManifestReference("access:test");
const authoringReference = formlessUiAccessInvitationAuthoringReference(
  accessReference.accessId,
  "access:test:authoring",
);

describe("Astryx access renderer", () => {
  it("renders loading, unauthorized, failed, empty, populated, feedback, and confirmation states", () => {
    const loadingHtml = renderAccess(manifestState("loading"));
    const unauthorizedHtml = renderAccess(manifestState("unauthorized"));
    const failedHtml = renderAccess(manifestState("failed"));
    const emptyHtml = renderAccess(readyManifest({ empty: true }));
    const populatedHtml = renderAccess(
      readyManifest({
        confirmation: revocationConfirmation(),
        feedback: accessFeedback("success"),
      }),
      invitationAuthoring(),
    );

    expect(loadingHtml).toContain('data-formless-astryx-access-state="loading"');
    expect(loadingHtml).toContain('role="status"');
    expect(loadingHtml).toContain("Loading access summary");
    expect(unauthorizedHtml).toContain('data-formless-astryx-access-state="unauthorized"');
    expect(unauthorizedHtml).toContain("Access unavailable");
    expect(failedHtml).toContain('data-formless-astryx-access-state="failed"');
    expect(failedHtml).toContain('role="alert"');
    expect(failedHtml).toContain("Access failed");
    expect(emptyHtml).toContain('data-formless-astryx-access-empty="access:test:people:empty"');
    expect(emptyHtml).toContain(
      'data-formless-astryx-access-empty="access:test:invitations:empty"',
    );
    expect(emptyHtml).toContain("No people");
    expect(emptyHtml).toContain("No invitations");
    expect(populatedHtml.match(/<table/g)).toHaveLength(2);
    expect(populatedHtml.match(/<thead/g)).toHaveLength(2);
    expect(populatedHtml.match(/<tbody/g)).toHaveLength(2);
    expect(populatedHtml).toContain("People");
    expect(populatedHtml).toContain("Invitations");
    expect(populatedHtml).toContain("Ada Lovelace");
    expect(populatedHtml).toContain("ada@example.com");
    expect(populatedHtml).toContain("Owner");
    expect(populatedHtml).toContain("pending@example.com");
    expect(populatedHtml).toContain('data-formless-astryx-access-fact="person:ada:status"');
    expect(populatedHtml).toContain(
      'data-formless-astryx-access-fact="invitation:pending:expires"',
    );
    expect(populatedHtml).not.toContain("Invitation created");
    expect(populatedHtml).toContain('role="alertdialog"');
    expect(populatedHtml).toContain("Revoke invitation?");
    expect(populatedHtml).toContain("Revoke invitation");
    expect(populatedHtml).not.toContain("raw-invitation-token");
    expect(populatedHtml).not.toContain("owner-secret");
  });

  it("maps invitation results to operation-style toast behavior", () => {
    expect(astryxAccessFeedbackToastOptions(accessFeedback("success"))).toMatchObject({
      autoHideDuration: 5_000,
      body: "Invitation created",
      isAutoHide: true,
      type: "info",
    });
    expect(astryxAccessFeedbackToastOptions(accessFeedback("danger"))).toMatchObject({
      body: "Invitation failed",
      isAutoHide: false,
      type: "error",
    });
  });

  it("composes an accessible controlled form dialog with separate sectioned grant selectors", async () => {
    const emailError = "Email must be valid.";
    const roleError = "Choose at least one available role.";
    const authoringBase = invitationAuthoring({
      errors: [emailError, roleError, "Review the invitation."],
      feedback: accessFeedback("danger"),
      pending: { isPending: true, label: "Sending invitation" },
    });
    const authoring: FormlessUiAccessInvitationAuthoringContract = {
      ...authoringBase,
      fields: {
        ...authoringBase.fields,
        targetEmail: { ...authoringBase.fields.targetEmail, errors: [emailError] },
      },
      grantSelections: [
        { ...authoringBase.grantSelections[0], errors: [roleError] },
        authoringBase.grantSelections[1],
      ],
    };
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={() => undefined} />,
      );
    });

    const mounted = required(renderer);
    const dialog = mounted.root.findByType(Dialog);
    const textFields = mounted.root.findAllByType(TextInput);
    const selectors = mounted.root.findAllByType(Selector);
    const grantSelectors = mounted.root.findAllByType(MultiSelector);

    expect(dialog.props["aria-label"]).toBe("Invite person");
    expect(dialog.props.isOpen).toBe(true);
    expect(dialog.props.purpose).toBe("form");
    expect(textFields.map((field) => [field.props.label, field.props.value])).toEqual([
      ["Email", "invitee@example.com"],
      ["Name", "Grace Hopper"],
    ]);
    expect(textFields.find((field) => field.props.label === "Email")?.props.status).toEqual({
      message: emailError,
      type: "error",
    });
    expect(selectors.map((selector) => [selector.props.label, selector.props.value])).toEqual([
      ["Surface", "organization"],
      ["Scope", "analytical-engine"],
    ]);
    expect(selectors.find((selector) => selector.props.label === "Surface")?.props.isRequired).toBe(
      false,
    );
    expect(selectors.find((selector) => selector.props.label === "Scope")?.props.isRequired).toBe(
      false,
    );
    expect(grantSelectors).toHaveLength(2);
    expect(grantSelectors[0]?.props.label).toBe("Roles");
    expect(grantSelectors[0]?.props.options.map((group: { title: string }) => group.title)).toEqual(
      ["Instance", "Organization"],
    );
    expect(grantSelectors[0]?.props.hasSearch).toBe(false);
    expect(grantSelectors[0]?.props.hasSelectAll).toBe(false);
    expect(grantSelectors[0]?.props.status).toEqual({ message: roleError, type: "error" });
    expect(grantSelectors[0]?.props.description).toBe(
      "Instance role 6: Instance administrators cannot be invited.",
    );
    expect(grantSelectors[1]?.props.label).toBe("Memberships");
    expect(grantSelectors[1]?.props.options.map((group: { title: string }) => group.title)).toEqual(
      ["Organizations", "Groups"],
    );
    expect(grantSelectors[1]?.props.hasSelectAll).toBe(false);
    expect(grantSelectors[1]?.props.description).toBe(
      "Membership grants are unavailable while sending.",
    );

    const html = renderToStaticMarkup(
      <AstryxAccessInvitationAuthoringContent authoring={authoring} onIntent={() => undefined} />,
    );
    expect(html).toContain('data-formless-astryx-access-authoring="access:test:authoring"');
    expect(html).toContain('data-formless-astryx-access-grants="roles"');
    expect(html).toContain('data-formless-astryx-access-grants="memberships"');
    expect(html).toContain("Review the invitation.");
    expect(html).not.toContain("Invitation failed");
    expect(html).toContain("Sending invitation");

    const appInstallHtml = renderToStaticMarkup(
      <AstryxAccessInvitationAuthoringContent
        authoring={{
          ...authoring,
          fields: {
            ...authoring.fields,
            targetSurface: { ...authoring.fields.targetSurface, value: "app-install" },
          },
        }}
        onIntent={() => undefined}
      />,
    );
    expect(appInstallHtml).toContain(
      'data-formless-astryx-access-field="field:target-app-install"',
    );
    expect(appInstallHtml).not.toContain(
      'data-formless-astryx-access-field="field:target-organization"',
    );

    const instanceHtml = renderToStaticMarkup(
      <AstryxAccessInvitationAuthoringContent
        authoring={{
          ...authoring,
          fields: {
            ...authoring.fields,
            targetSurface: { ...authoring.fields.targetSurface, value: "instance" },
          },
        }}
        onIntent={() => undefined}
      />,
    );
    expect(instanceHtml).not.toContain(
      'data-formless-astryx-access-field="field:target-app-install"',
    );
    expect(instanceHtml).not.toContain(
      'data-formless-astryx-access-field="field:target-organization"',
    );

    await act(async () => mounted.unmount());
  });

  it("dispatches exact field, selection, dialog, submit, confirmation, and revoke intents", async () => {
    const authoring = invitationAuthoring();
    const confirmation = revocationConfirmation();
    const manifest = readyManifest({ confirmation });
    const intents: FormlessUiAccessIntent[] = [];
    const onIntent = (intent: FormlessUiAccessIntent) => {
      intents.push(intent);
    };
    let authoringRenderer: ReactTestRenderer | undefined;
    let accessRenderer: ReactTestRenderer | undefined;

    await act(async () => {
      authoringRenderer = create(
        <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={onIntent} />,
      );
      accessRenderer = create(
        <AstryxAccessRenderer authoring={authoring} manifest={manifest} onIntent={onIntent} />,
      );
    });

    const authoringMounted = required(authoringRenderer);
    const accessMounted = required(accessRenderer);
    const email = authoringMounted.root
      .findAllByType(TextInput)
      .find((field) => field.props.label === "Email");
    const targetSurface = authoringMounted.root
      .findAllByType(Selector)
      .find((field) => field.props.label === "Surface");
    const roles = authoringMounted.root
      .findAllByType(MultiSelector)
      .find((selection) => selection.props.label === "Roles");
    const form = authoringMounted.root.findByType("form");
    const authoringDialog = authoringMounted.root.findByType(Dialog);
    const confirmationDialog = accessMounted.root.findByProps({
      "data-formless-astryx-access-confirmation": confirmation.id,
    });

    await act(async () => {
      required(email).props.onChange("next@example.com");
      required(targetSurface).props.onChange("app-install");
      required(roles).props.onChange(["role:instance:0", "role:instance:1"]);
      form.props.onSubmit({ preventDefault: () => undefined });
      authoringDialog.props.onOpenChange(false);
      confirmationDialog.props.onOpenChange(false);
      confirmationDialog.props.onAction();
    });

    expect(intents).toEqual([
      {
        accessId: "access:test",
        authoringId: "access:test:authoring",
        fieldId: "field:target-email",
        type: "accessInvitationFieldChange",
        value: "next@example.com",
      },
      {
        accessId: "access:test",
        authoringId: "access:test:authoring",
        fieldId: "field:target-surface",
        type: "accessInvitationFieldChange",
        value: "app-install",
      },
      {
        accessId: "access:test",
        authoringId: "access:test:authoring",
        controlId: "access:test:roles",
        groupId: "roles:instance",
        optionId: "role:instance:1",
        selected: true,
        type: "accessInvitationGrantSelection",
      },
      authoring.submit.intent,
      { ...authoring.cancel.intent, open: false },
      { ...confirmation.cancel.intent, open: false },
      confirmation.action.intent,
    ]);

    await act(async () => {
      authoringMounted.unmount();
      accessMounted.unmount();
    });
  });

  it("subscribes to manifest and authoring snapshots through one contract host", () => {
    const manifest = readyManifest();
    const authoring = invitationAuthoring();
    const host = createFormlessUiMemoryContractHost({
      nodes: [
        { reference: accessReference, snapshot: manifest },
        { reference: authoringReference, snapshot: authoring },
      ],
    });
    const html = renderToStaticMarkup(
      <FormlessUiContractHostProvider host={host}>
        <AstryxSubscribedAccessRenderer accessReference={accessReference} />
      </FormlessUiContractHostProvider>,
    );

    expect(html).toContain('data-formless-astryx-access-state="ready"');
    expect(html).toContain('data-formless-astryx-access-authoring="access:test:authoring"');
    expect(html).toContain('value="invitee@example.com"');
    expect(html).not.toContain("data-formless-access-state");
  });

  it("stays package-local, runtime-free, and inactive in production", async () => {
    const rendererSource = await readFile(
      new URL("./formless-ui-access-renderer.tsx", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { exports?: Record<string, string> };
    const productionAppSource = await readFile(
      new URL("../../../../src/app.tsx", import.meta.url),
      "utf8",
    );

    expect(rendererSource).toContain('from "@astryxdesign/core/Table"');
    expect(rendererSource).toContain('from "@astryxdesign/core/MultiSelector"');
    expect(rendererSource).toContain('from "@astryxdesign/core/AlertDialog"');
    expect(rendererSource).not.toMatch(/@dpeek\/formless-ui\//);
    expect(rendererSource).not.toContain("legacy-access-renderer");
    expect(rendererSource).not.toContain("access-runtime");
    expect(rendererSource).not.toContain("access-projection");
    expect(rendererSource).not.toContain("fetch(");
    expect(rendererSource).not.toContain("global.css");
    expect(rendererSource).not.toContain("CheckboxInput");
    expect(rendererSource).not.toContain("<Checkbox");
    expect(rendererSource).not.toContain("hasSelectAll={true}");
    expect(Object.values(packageJson.exports ?? {})).not.toContain(
      "./src/components/formless-ui-access-renderer.tsx",
    );
    expect(productionAppSource).not.toContain("AstryxAccessRenderer");
    expect(productionAppSource).not.toContain("AstryxSubscribedAccessRenderer");
  });
});

function renderAccess(
  manifest: FormlessUiAccessManifestContract,
  authoring?: FormlessUiAccessInvitationAuthoringContract,
) {
  return renderToStaticMarkup(
    <AstryxAccessRenderer authoring={authoring} manifest={manifest} onIntent={() => undefined} />,
  );
}

function manifestState(
  state: "failed" | "loading" | "unauthorized",
): FormlessUiAccessManifestContract {
  const base = {
    accessibilityLabel: "Instance access",
    id: accessReference.accessId,
    kind: "accessManifest" as const,
    title: "Access",
  };

  return state === "loading"
    ? { ...base, message: "Loading access summary", state }
    : {
        ...base,
        feedback:
          state === "failed"
            ? accessFeedback("danger", "Access failed")
            : accessFeedback("warning", "Access unavailable"),
        state,
      };
}

function readyManifest({
  confirmation,
  empty = false,
  feedback,
}: {
  confirmation?: FormlessUiAccessConfirmationContract;
  empty?: boolean;
  feedback?: FormlessUiAccessFeedbackContract;
} = {}): FormlessUiAccessReadyContract {
  return {
    accessibilityLabel: "Instance access",
    authoring: authoringReference,
    ...(confirmation ? { confirmation } : {}),
    ...(empty
      ? {
          invitationsEmptyState: {
            description: "Invite someone to begin sharing access.",
            id: "access:test:invitations:empty",
            kind: "accessEmptyState" as const,
            title: "No invitations",
          },
          peopleEmptyState: {
            description: "Invite someone to begin sharing access.",
            id: "access:test:people:empty",
            kind: "accessEmptyState" as const,
            title: "No people",
          },
        }
      : {}),
    ...(feedback ? { feedback } : {}),
    id: accessReference.accessId,
    invitations: empty ? [] : [pendingInvitation()],
    invite: accessAction("authoring-open", "Invite person", {
      accessId: accessReference.accessId,
      actionId: "action:invite",
      authoringId: authoringReference.authoringId,
      controlId: "control:invite",
      open: true,
      type: "accessInvitationAuthoringOpenChange",
    }),
    kind: "accessManifest",
    people: empty ? [] : [accessPerson()],
    state: "ready",
    title: "Access",
  };
}

function accessPerson(): FormlessUiAccessPersonContract {
  return {
    displayName: "Ada Lovelace",
    id: "person:ada",
    kind: "accessPerson",
    primaryEmail: "ada@example.com",
    roles: [
      {
        id: "role:owner",
        kind: "accessRole",
        label: "Owner",
        scope: accessFact("role:owner:scope", "Scope", "Instance", "text"),
      },
    ],
    status: accessFact("person:ada:status", "Status", "Active", "status", "success"),
  };
}

function pendingInvitation(): FormlessUiAccessInvitationContract {
  return {
    expiresAt: accessFact(
      "invitation:pending:expires",
      "Expires",
      "2026-07-24T12:30:00.000Z",
      "timestamp",
    ),
    id: "invitation:pending",
    inviter: accessFact("invitation:pending:inviter", "Inviter", "Ada Lovelace", "text"),
    kind: "accessInvitation",
    revocation: {
      action: accessAction("revocation-open", "Revoke invitation", {
        accessId: accessReference.accessId,
        actionId: "action:revocation-open",
        confirmationId: "confirmation:revoke",
        controlId: "control:revocation-open",
        invitationId: "invitation:pending",
        open: true,
        type: "accessInvitationRevocationConfirmationOpenChange",
      }),
      availability: "available",
    },
    scope: accessFact("invitation:pending:scope", "Scope", "Analytical Engine", "text"),
    status: accessFact("invitation:pending:status", "Status", "Pending", "status", "warning"),
    target: accessFact("invitation:pending:target", "Target", "Organization", "text"),
    targetEmail: "pending@example.com",
  };
}

function invitationAuthoring({
  errors = [],
  feedback,
  pending,
}: {
  errors?: readonly string[];
  feedback?: FormlessUiAccessFeedbackContract;
  pending?: FormlessUiAccessInvitationAuthoringContract["pending"];
} = {}): FormlessUiAccessInvitationAuthoringContract {
  const fields = {
    displayName: accessField("display-name", "Name", "text", "Grace Hopper"),
    targetAppInstall: accessField("target-app-install", "Scope", "select", "site", {
      options: [
        {
          disabledReason: "The CRM install is paused.",
          id: "app:crm",
          label: "CRM",
          selected: false,
          value: "crm",
        },
        { id: "app:site", label: "Site", selected: true, value: "site" },
      ],
      required: false,
    }),
    targetEmail: accessField("target-email", "Email", "email", "invitee@example.com"),
    targetOrganization: accessField("target-organization", "Scope", "select", "analytical-engine", {
      options: [
        {
          id: "organization:analytical-engine",
          label: "Analytical Engine",
          selected: true,
          value: "analytical-engine",
        },
      ],
      required: false,
    }),
    targetSurface: accessField("target-surface", "Surface", "select", "organization", {
      options: [
        { id: "surface:instance", label: "Instance", selected: false, value: "instance" },
        {
          id: "surface:app",
          label: "App install",
          selected: false,
          value: "app-install",
        },
        {
          id: "surface:organization",
          label: "Organization",
          selected: true,
          value: "organization",
        },
      ],
      required: false,
    }),
  } satisfies FormlessUiAccessInvitationAuthoringContract["fields"];

  return {
    accessId: accessReference.accessId,
    cancel: accessAction("authoring-cancel", "Cancel", {
      accessId: accessReference.accessId,
      actionId: "action:authoring-cancel",
      authoringId: authoringReference.authoringId,
      controlId: "control:authoring-cancel",
      open: false,
      type: "accessInvitationAuthoringOpenChange",
    }),
    description: "Invite a person and assign access.",
    errors,
    ...(feedback ? { feedback } : {}),
    fields,
    grantSelections: [roleSelection(), membershipSelection(pending !== undefined)],
    id: authoringReference.authoringId,
    kind: "accessInvitationAuthoring",
    open: true,
    ...(pending ? { pending } : {}),
    submit: accessAction(
      "invitation-submit",
      pending ? "Sending invitation" : "Send invitation",
      {
        accessId: accessReference.accessId,
        actionId: "action:authoring-submit",
        authoringId: authoringReference.authoringId,
        controlId: "control:authoring-submit",
        type: "accessInvitationSubmit",
      },
      pending?.label,
      "submit",
    ),
    title: "Invite person",
  };
}

function roleSelection(): FormlessUiAccessGrantSelectionContract & { purpose: "roles" } {
  const instanceGroup = roleGroup("roles:instance", "Instance", 6);
  const groups = [
    {
      ...instanceGroup,
      options: instanceGroup.options.map((option, index) => ({
        ...option,
        ...(index === 0
          ? {
              selected: true,
              selectionIntent: { ...option.selectionIntent, selected: false },
            }
          : {}),
        ...(index === 5 ? { disabledReason: "Instance administrators cannot be invited." } : {}),
      })),
    },
    roleGroup("roles:app-install", "App install", 5),
    roleGroup("roles:organization", "Organization", 5),
  ];

  return {
    errors: [],
    groups,
    id: "access:test:roles",
    kind: "accessGrantSelection",
    label: "Roles",
    purpose: "roles",
    selectedOptionIds: ["role:instance:0"],
  };
}

function membershipSelection(
  pending: boolean,
): FormlessUiAccessGrantSelectionContract & { purpose: "memberships" } {
  const disabledReason = pending ? "Membership grants are unavailable while sending." : undefined;
  return {
    ...(disabledReason ? { disabledReason } : {}),
    errors: [],
    groups: [
      grantGroup("memberships:organizations", "Organizations", ["Analytical Engine"]),
      grantGroup("memberships:groups", "Groups", ["Research"]),
    ],
    id: "access:test:memberships",
    kind: "accessGrantSelection",
    label: "Memberships",
    purpose: "memberships",
    selectedOptionIds: [],
  };
}

function roleGroup(
  id: string,
  label: string,
  optionCount: number,
): FormlessUiAccessGrantOptionGroupContract {
  return {
    id,
    kind: "accessGrantOptionGroup",
    label,
    options: Array.from({ length: optionCount }, (_, index) => {
      const optionId = `role:${id.split(":")[1]}:${index}`;
      return {
        id: optionId,
        label: `${label} role ${index + 1}`,
        selected: false,
        selectionIntent: {
          accessId: accessReference.accessId,
          authoringId: authoringReference.authoringId,
          controlId: "access:test:roles",
          groupId: id,
          optionId,
          selected: true,
          type: "accessInvitationGrantSelection",
        },
      };
    }),
  };
}

function grantGroup(
  id: string,
  label: string,
  optionLabels: readonly string[],
): FormlessUiAccessGrantOptionGroupContract {
  return {
    id,
    kind: "accessGrantOptionGroup",
    label,
    options: optionLabels.map((optionLabel, index) => {
      const optionId = `${id}:option:${index}`;
      return {
        id: optionId,
        label: optionLabel,
        selected: false,
        selectionIntent: {
          accessId: accessReference.accessId,
          authoringId: authoringReference.authoringId,
          controlId: "access:test:memberships",
          groupId: id,
          optionId,
          selected: true,
          type: "accessInvitationGrantSelection",
        },
      };
    }),
  };
}

function accessField(
  purpose: FormlessUiAccessControlledFieldContract["purpose"],
  label: string,
  inputKind: FormlessUiAccessControlledFieldContract["inputKind"],
  value: string,
  options: Partial<Pick<FormlessUiAccessControlledFieldContract, "options" | "required">> = {},
): FormlessUiAccessControlledFieldContract {
  const id = `field:${purpose}`;
  return {
    changeIntent: {
      accessId: accessReference.accessId,
      authoringId: authoringReference.authoringId,
      fieldId: id,
      type: "accessInvitationFieldChange",
    },
    errors: [],
    id,
    inputKind,
    kind: "accessControlledField",
    label,
    ...options,
    purpose,
    required: options.required ?? true,
    value,
  };
}

function revocationConfirmation(): FormlessUiAccessConfirmationContract {
  return {
    action: accessAction("invitation-revoke", "Revoke invitation", {
      accessId: accessReference.accessId,
      actionId: "action:revoke",
      confirmationId: "confirmation:revoke",
      controlId: "control:revoke",
      invitationId: "invitation:pending",
      type: "accessInvitationRevoke",
    }),
    cancel: accessAction("revocation-cancel", "Cancel", {
      accessId: accessReference.accessId,
      actionId: "action:revocation-cancel",
      confirmationId: "confirmation:revoke",
      controlId: "control:revocation-cancel",
      invitationId: "invitation:pending",
      open: false,
      type: "accessInvitationRevocationConfirmationOpenChange",
    }),
    description: "The pending invitation for pending@example.com will no longer be usable.",
    id: "confirmation:revoke",
    invitationId: "invitation:pending",
    kind: "accessConfirmation",
    open: true,
    title: "Revoke invitation?",
  };
}

function accessAction<Intent extends FormlessUiAccessActionContract["intent"]>(
  purpose: FormlessUiAccessActionContract<Intent>["purpose"],
  label: string,
  intent: Intent,
  disabledReason?: string,
  type: FormlessUiButtonContract["type"] = "button",
): FormlessUiAccessActionContract<Intent> {
  return {
    control: accessButton(intent.controlId, label, disabledReason, type),
    id: intent.actionId,
    intent,
    kind: "accessAction",
    purpose,
  };
}

function accessButton(
  id: string,
  label: string,
  disabledReason?: string,
  type: FormlessUiButtonContract["type"] = "button",
): FormlessUiButtonContract {
  return {
    accessibilityLabel: label,
    content: { kind: "label", label },
    density: "default",
    ...(disabledReason ? { disabled: true, disabledReason } : {}),
    id,
    kind: "button",
    prominence: type === "submit" ? "primary" : "secondary",
    type,
  };
}

function accessFact(
  id: string,
  label: string,
  value: string,
  presentation: FormlessUiAccessDisplayFactContract["presentation"],
  intent?: FormlessUiAccessDisplayFactContract["intent"],
): FormlessUiAccessDisplayFactContract {
  return {
    id,
    ...(intent ? { intent } : {}),
    kind: "accessDisplayFact",
    label,
    presentation,
    value,
  };
}

function accessFeedback(
  intent: FormlessUiAccessFeedbackContract["intent"],
  title = intent === "danger" ? "Invitation failed" : "Invitation created",
): FormlessUiAccessFeedbackContract {
  return {
    detail: intent === "danger" ? "Try again later." : "An invitation email was sent.",
    id: `feedback:${intent}`,
    intent,
    kind: "accessFeedback",
    title,
  };
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}

function dataAttributes(props: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith("data-")));
}
