import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import type {
  SiteBlockNode,
  SitePublicFormSession,
  SitePublicFormStatus,
} from "@dpeek/formless-site-app";

import {
  createAstryxPublicFormFixtureController,
  createAstryxPublicFormFixtureControllers,
  publicSiteFormFixtureLayouts,
  publicSiteMultipleFormFixtureLayout,
  type AstryxPublicSiteFormFixtureLayout,
  type AstryxPublicSiteFormFixtureLayoutId,
} from "./public-site-forms.ts";

const fixtureSource = readFileSync(new URL("./public-site-forms.ts", import.meta.url), "utf8");

describe("canonical public Site form fixture layouts", () => {
  it("covers fixed, generic, unavailable, validation, submission, outcome, and multiple-form layouts", () => {
    expect(publicSiteFormFixtureLayouts.map(({ id }) => id)).toEqual([
      "fixed-missing-operation",
      "fixed-missing-site-key",
      "fixed-ready",
      "fixed-invalid",
      "fixed-submitting",
      "fixed-success",
      "fixed-failure",
      "generic-ready",
      "generic-invalid",
      "generic-submitting",
      "generic-success",
      "generic-failure",
      "multiple",
    ]);

    expect(
      new Set(
        publicSiteFormFixtureLayouts.flatMap(({ sessions }) => sessions.map(({ kind }) => kind)),
      ),
    ).toEqual(new Set(["subscribe", "contact", "publicOperation"]));
    expect(
      new Set(
        publicSiteFormFixtureLayouts.flatMap(({ sessions }) =>
          sessions.map(({ status }) => status),
        ),
      ),
    ).toEqual(
      new Set<SitePublicFormStatus>(["unavailable", "ready", "submitting", "success", "failed"]),
    );
    expect(publicSiteMultipleFormFixtureLayout.sessions).toHaveLength(4);
    expect(publicSiteMultipleFormFixtureLayout.sessions.map(({ kind }) => kind)).toEqual([
      "subscribe",
      "contact",
      "publicOperation",
      "contact",
    ]);
  });

  it("keeps canonical sessions aligned with canonical form blocks and renderer props", () => {
    for (const fixture of publicSiteFormFixtureLayouts) {
      const blocks = collectBlocks(fixture.rendererProps.tree.page);
      const blockById = new Map(blocks.map((block) => [block.id, block]));

      expect(Object.keys(fixture.rendererProps).sort()).toEqual(
        fixture.id === "multiple" ? ["linkMode", "routeBase", "tree"] : ["linkMode", "tree"],
      );
      expect(fixture.rendererProps).not.toHaveProperty("formSessions");
      expect(fixture.rendererProps).not.toHaveProperty("formStates");

      for (const session of fixture.sessions) {
        const block = blockById.get(session.blockId);
        expect(block).toBeDefined();
        expect(blockKind(block)).toBe(session.kind);
        if (session.kind === "publicOperation") {
          expect(session.fields.map(({ name }) => name)).toEqual(
            block?.publicOperation?.fields?.map(({ name }) => name),
          );
        }
        expect(session.formId).toBe(`site-public-form:${session.blockId}`);
        expect(session.fields.every((field) => field.changeIntent.formId === session.formId)).toBe(
          true,
        );
        expect(session.submit.intent).toEqual({ type: "submit", formId: session.formId });
      }
    }
  });

  it("covers missing operation and public challenge facts without inventing submit targets", () => {
    const missingOperation = requiredLayout("fixed-missing-operation");
    const missingOperationBlock = onlyFormBlock(missingOperation);
    const missingOperationSession = onlySession(missingOperation);
    const missingSiteKey = requiredLayout("fixed-missing-site-key");
    const missingSiteKeyBlock = onlyFormBlock(missingSiteKey);
    const missingSiteKeySession = onlySession(missingSiteKey);

    expect(missingOperationBlock.publicOperation).toBeUndefined();
    expect(missingOperationSession).toMatchObject({
      status: "unavailable",
      disabled: true,
      feedback: { kind: "unavailable", message: "Subscribe form unavailable." },
      submit: { ready: false },
    });
    expect(missingOperationSession.challenge).toBeUndefined();

    expect(missingSiteKeyBlock.publicOperation?.challenge).toEqual({ kind: "turnstile" });
    expect(missingSiteKeySession.status).toBe("unavailable");
    expect(missingSiteKeySession.challenge).toBeUndefined();
  });

  it("covers controlled fixed-form validation, pending, configured success, retry, and reset facts", () => {
    const invalid = onlySession(requiredLayout("fixed-invalid"));
    const submitting = onlySession(requiredLayout("fixed-submitting"));
    const success = onlySession(requiredLayout("fixed-success"));
    const failure = onlySession(requiredLayout("fixed-failure"));

    expect(invalid.fields.map(({ name, required }) => [name, required])).toEqual([
      ["name", true],
      ["email", true],
      ["message", true],
    ]);
    expect(invalid.fields.find(({ name }) => name === "email")?.error).toBe(
      "Enter a valid email address.",
    );
    expect(invalid.submit.ready).toBe(false);
    expect(submitting).toMatchObject({ status: "submitting", disabled: true });
    expect(submitting.fields.every(({ disabled }) => disabled)).toBe(true);
    expect(success.feedback).toEqual({
      kind: "success",
      message: "You're on the studio list.",
    });
    expect(failure.feedback).toEqual({ kind: "failure", message: "Please try again later." });
    expect(failure.retryIntent).toEqual({ type: "retry", formId: failure.formId });
    expect(failure.challenge).toMatchObject({ ready: false, resetSignal: 1 });
  });

  it("covers every generic scalar control, format, suggestion, option, and required variant", () => {
    const ready = onlySession(requiredLayout("generic-ready"));
    const invalid = onlySession(requiredLayout("generic-invalid"));
    const success = onlySession(requiredLayout("generic-success"));
    const failure = onlySession(requiredLayout("generic-failure"));

    expect(ready.fields.map(({ control }) => control)).toEqual([
      "text",
      "longText",
      "boolean",
      "date",
      "number",
      "enum",
      "text",
      "text",
      "text",
    ]);
    expect(ready.fields.filter(({ format }) => format).map(({ format }) => format)).toEqual([
      "email",
      "phone",
    ]);
    expect(ready.fields.find(({ name }) => name === "topic")?.suggestions).toEqual([
      "Research",
      "Delivery",
    ]);
    expect(ready.fields.find(({ name }) => name === "topic")?.value).toBe("Custom research");
    expect(ready.fields.find(({ name }) => name === "tier")?.options).toEqual([
      { value: "standard", label: "Standard" },
      { value: "enterprise", label: "Enterprise" },
    ]);
    expect(new Set(ready.fields.map(({ required }) => required))).toEqual(new Set([true, false]));
    expect(ready.submit.ready).toBe(true);
    expect(invalid.fields.filter(({ error }) => error).map(({ name }) => name)).toEqual([
      "quantity",
      "email",
    ]);
    expect(success.feedback).toEqual({ kind: "success", message: "Review request received." });
    expect(failure.feedback).toEqual({
      kind: "failure",
      message: "Please try the request again.",
    });
    expect(failure.challenge?.resetSignal).toBe(2);
  });

  it("keeps canonical fixture facts serializable and excludes runtime and private submission state", () => {
    for (const fixture of publicSiteFormFixtureLayouts) {
      expect(structuredClone(fixture.rendererProps)).toEqual(fixture.rendererProps);
      expect(structuredClone(fixture.sessions)).toEqual(fixture.sessions);
      expect(JSON.parse(JSON.stringify(fixture.rendererProps))).toEqual(fixture.rendererProps);
      expect(JSON.parse(JSON.stringify(fixture.sessions))).toEqual(fixture.sessions);
    }

    expect(JSON.stringify(publicSiteFormFixtureLayouts)).not.toMatch(
      /"(?:idempotencyKey|request|response|records|createdRecord|provider|proof|token|turnstileSecret)"\s*:/,
    );
    expect(fixtureSource).not.toMatch(
      /from ["'][^"']*(?:generated|runtime|storage|replica|sync|public-operations)[^"']*["']/,
    );
  });
});

describe("public Site form fixture intent controller", () => {
  it("reduces controlled field, challenge, and submit intents without retaining challenge input", async () => {
    const initial = onlySession(requiredLayout("fixed-ready"));
    const controller = createAstryxPublicFormFixtureController(initial);
    let notifications = 0;
    const unsubscribe = controller.subscribe(() => {
      notifications += 1;
    });
    const email = controller.getSnapshot().fields[0];

    await controller.dispatch({ ...email.changeIntent, value: "reader@example.com" });
    expect(controller.getSnapshot().fields[0]?.value).toBe("reader@example.com");
    expect(controller.getSnapshot().submit.ready).toBe(false);

    const challenge = requiredChallenge(controller.getSnapshot());
    await controller.dispatch({ ...challenge.tokenChangeIntent, token: "private-fixture-token" });
    expect(controller.getSnapshot().challenge?.ready).toBe(true);
    expect(controller.getSnapshot().submit.ready).toBe(true);
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("private-fixture-token");

    await controller.dispatch(controller.getSnapshot().submit.intent);
    expect(controller.getSnapshot().status).toBe("submitting");
    expect(controller.getSnapshot().disabled).toBe(true);
    expect(controller.getSnapshot().fields.every(({ disabled }) => disabled)).toBe(true);
    expect(notifications).toBe(3);

    unsubscribe();
  });

  it("clears display errors, recomputes readiness, and reduces retry without execution effects", async () => {
    const invalidController = createAstryxPublicFormFixtureController(
      onlySession(requiredLayout("generic-invalid")),
    );
    const quantity = requiredField(invalidController.getSnapshot(), "quantity");
    const email = requiredField(invalidController.getSnapshot(), "email");

    await invalidController.dispatch({ ...quantity.changeIntent, value: 12.5 });
    expect(requiredField(invalidController.getSnapshot(), "quantity").error).toBeUndefined();
    expect(invalidController.getSnapshot().submit.ready).toBe(false);
    await invalidController.dispatch({ ...email.changeIntent, value: "ada@example.com" });
    expect(requiredField(invalidController.getSnapshot(), "email").error).toBeUndefined();
    expect(invalidController.getSnapshot().submit.ready).toBe(true);

    const failureController = createAstryxPublicFormFixtureController(
      onlySession(requiredLayout("generic-failure")),
    );
    const retry = failureController.getSnapshot().retryIntent;
    expect(retry).toBeDefined();
    await failureController.dispatch(required(retry));
    expect(failureController.getSnapshot()).toMatchObject({ status: "ready", disabled: false });
    expect(failureController.getSnapshot().feedback).toBeUndefined();
    expect(failureController.getSnapshot().retryIntent).toBeUndefined();
    expect(failureController.getSnapshot().challenge).toMatchObject({
      ready: false,
      resetSignal: 2,
    });
  });

  it("isolates controllers for every form occurrence on one page", async () => {
    const controllers = createAstryxPublicFormFixtureControllers(
      publicSiteMultipleFormFixtureLayout,
    );
    const subscribe = required(controllers.get("block-form-subscribe"));
    const contact = required(controllers.get("block-form-contact"));
    const contactBefore = contact.getSnapshot();

    await subscribe.dispatch({
      ...requiredField(subscribe.getSnapshot(), "email").changeIntent,
      value: "reader@example.com",
    });

    expect(subscribe.getSnapshot().fields[0]?.value).toBe("reader@example.com");
    expect(contact.getSnapshot()).toBe(contactBefore);
    expect(controllers.size).toBe(4);
  });
});

function requiredLayout(id: AstryxPublicSiteFormFixtureLayoutId) {
  return required(publicSiteFormFixtureLayouts.find((fixture) => fixture.id === id));
}

function onlySession(fixture: AstryxPublicSiteFormFixtureLayout): SitePublicFormSession {
  expect(fixture.sessions).toHaveLength(1);
  return required(fixture.sessions[0]);
}

function onlyFormBlock(fixture: AstryxPublicSiteFormFixtureLayout): SiteBlockNode {
  return required(
    collectBlocks(fixture.rendererProps.tree.page).find((block) => block.type.endsWith("Form")),
  );
}

function collectBlocks(root: SiteBlockNode): SiteBlockNode[] {
  return [
    root,
    ...root.placements.flatMap(({ block }) => collectBlocks(block)),
    ...(root.query?.items.flatMap(collectBlocks) ?? []),
  ];
}

function blockKind(block: SiteBlockNode | undefined) {
  if (block?.type === "subscribeForm") {
    return "subscribe";
  }
  if (block?.type === "contactForm") {
    return "contact";
  }
  if (block?.type === "publicOperationForm") {
    return "publicOperation";
  }
  return undefined;
}

function requiredField(session: SitePublicFormSession, name: string) {
  return required(session.fields.find((field) => field.name === name));
}

function requiredChallenge(session: SitePublicFormSession) {
  return required(session.challenge);
}

function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error("Required fixture value is missing.");
  }
  return value;
}
