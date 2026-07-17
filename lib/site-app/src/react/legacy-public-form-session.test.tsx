import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  SiteBlockNode,
  SitePlacementNode,
  SitePublicOperationInputFieldNode,
  SitePublicOperationNode,
} from "../types.ts";
import { sitePageRendererParts } from "./blocks.tsx";
import { TurnstileChallenge } from "./turnstile.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("legacy public Site form session adapter", () => {
  it("dispatches controlled subscribe and challenge intents into the preserved browser request and outcome", async () => {
    const response = deferred<Response>();
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return response.promise;
    });
    const renderer = await renderForm(
      formBlock("subscribe-block", "subscribeForm", {
        buttonLabel: "Join",
        publicOperation: publicOperation({
          entityName: "subscription",
          operationName: "subscribe",
        }),
      }),
    );

    await changeField(renderer, "email", "reader@example.com");
    await solveChallenge(renderer, "private-turnstile-token");

    let submission!: Promise<void>;
    act(() => {
      submission = submitForm(renderer, "data-site-subscribe-form");
    });

    expect(button(renderer).props.disabled).toBe(true);
    expect(button(renderer).children).toEqual(["Subscribing..."]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("/api/site/public/operations/subscription/subscribe");
    expect(requestBody(requests[0])).toEqual({
      input: { email: "reader@example.com" },
      proof: { turnstileToken: "private-turnstile-token" },
      source: { siteBlockId: "subscribe-block" },
      idempotencyKey: expect.stringMatching(/^site-subscribe:subscribe-block:/),
    });

    response.resolve(Response.json(publicCommandResponse()));
    await act(async () => submission);

    expect(renderedText(renderer)).toContain("You're subscribed.");
    expect(button(renderer).props.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("private-turnstile-token");
    await act(async () => renderer.unmount());
  });

  it("renders contact validation from session fields and a display-safe failed outcome with challenge reset", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      throw new Error("postgres://private-host/contact-message failed");
    });
    const renderer = await renderForm(
      formBlock("contact-block", "contactForm", {
        emailLabel: "Reply email",
        messageLabel: "Enquiry",
        nameLabel: "Your name",
        publicOperation: publicOperation({
          entityName: "contact-message",
          operationName: "submit",
        }),
      }),
    );

    await act(async () => submitForm(renderer, "data-site-contact-form"));

    expect(requests).toHaveLength(0);
    expect(invalidFieldNames(renderer)).toEqual(["name", "email", "message"]);
    expect(renderedText(renderer)).toContain("Complete the form and challenge.");

    await changeField(renderer, "name", "Ada Lovelace");
    await changeField(renderer, "email", "ada@example.com");
    await changeField(renderer, "message", "Please send details.");
    await solveChallenge(renderer, "private-contact-token");
    await act(async () => submitForm(renderer, "data-site-contact-form"));

    expect(requestBody(requests[0])).toEqual({
      input: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        message: "Please send details.",
      },
      proof: { turnstileToken: "private-contact-token" },
      source: { siteBlockId: "contact-block" },
      idempotencyKey: expect.stringMatching(/^site-contact:contact-block:/),
    });
    expect(renderedText(renderer)).toContain("Contact request failed.");
    expect(renderedText(renderer)).not.toContain("postgres");
    expect(renderer.root.findByType(TurnstileChallenge).props.resetSignal).toBe(1);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("private-contact-token");
    await act(async () => renderer.unmount());
  });

  it("renders generic controlled field intents, session validation, coercion, request, and configured success", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return Response.json(publicCreateResponse());
    });
    const fields: SitePublicOperationInputFieldNode[] = [
      { name: "summary", label: "Summary", required: true, control: "text" },
      { name: "quantity", label: "Quantity", required: true, control: "number" },
      { name: "confirmed", label: "Confirmed", required: false, control: "boolean" },
    ];
    const renderer = await renderForm(
      formBlock("request-block", "publicOperationForm", {
        buttonLabel: "Submit request",
        publicOperation: publicOperation({ fields }),
        successLabel: "Request received.",
      }),
    );

    await changeField(renderer, "quantity", "many");
    await act(async () => submitForm(renderer, "data-site-public-operation-form"));

    expect(requests).toHaveLength(0);
    expect(field(renderer, "quantity").props["aria-invalid"]).toBe(true);
    expect(renderedText(renderer)).toContain("Enter a finite number.");

    await changeField(renderer, "summary", "Lab results");
    await changeField(renderer, "quantity", "2.5");
    await changeField(renderer, "confirmed", true);
    await solveChallenge(renderer, "private-generic-token");
    await act(async () => submitForm(renderer, "data-site-public-operation-form"));

    expect(requestBody(requests[0])).toEqual({
      input: { summary: "Lab results", quantity: 2.5, confirmed: true },
      proof: { turnstileToken: "private-generic-token" },
      source: { siteBlockId: "request-block" },
      idempotencyKey: expect.stringMatching(/^site-public-operation:request-block:/),
    });
    expect(renderedText(renderer)).toContain("Request received.");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("private-generic-token");
    await act(async () => renderer.unmount());
  });
});

async function renderForm(block: SiteBlockNode): Promise<ReactTestRenderer> {
  const Placement = sitePageRendererParts.Placement;
  let renderer!: ReactTestRenderer;

  await act(async () => {
    renderer = create(
      <Placement
        placement={{ id: `${block.id}-placement`, order: 100, block } satisfies SitePlacementNode}
      />,
    );
  });

  return renderer;
}

async function changeField(
  renderer: ReactTestRenderer,
  name: string,
  value: string | boolean,
): Promise<void> {
  const input = field(renderer, name);

  await act(async () => {
    input.props.onChange({
      currentTarget: input.props.type === "checkbox" ? { checked: value } : { value },
    });
  });
}

async function solveChallenge(renderer: ReactTestRenderer, token: string): Promise<void> {
  await act(async () => {
    renderer.root.findByType(TurnstileChallenge).props.onTokenChange(token);
  });
}

function submitForm(renderer: ReactTestRenderer, marker: string): Promise<void> {
  const form = renderer.root.find(
    (node) => node.type === "form" && node.props[marker] !== undefined,
  );

  return form.props.onSubmit({ preventDefault: vi.fn() });
}

function field(renderer: ReactTestRenderer, name: string) {
  return renderer.root.find(
    (node) => (node.type === "input" || node.type === "textarea") && node.props.name === name,
  );
}

function button(renderer: ReactTestRenderer) {
  return renderer.root.findByType("button");
}

function invalidFieldNames(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(
      (node) =>
        (node.type === "input" || node.type === "textarea") && node.props["aria-invalid"] === true,
    )
    .map((node) => node.props.name);
}

function renderedText(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === "string")
    .join(" ");
}

function requestBody(request: { init?: RequestInit } | undefined): unknown {
  return JSON.parse(String(request?.init?.body));
}

function formBlock(
  id: string,
  type: "subscribeForm" | "contactForm" | "publicOperationForm",
  fields: Partial<SiteBlockNode> = {},
): SiteBlockNode {
  return {
    id,
    type,
    label: "Public form",
    placements: [],
    ...fields,
  };
}

function publicOperation(
  options: {
    entityName?: string;
    fields?: SitePublicOperationInputFieldNode[];
    operationName?: string;
  } = {},
): SitePublicOperationNode {
  const entityName = options.entityName ?? "request";
  const operationName = options.operationName ?? "submit";

  return {
    entityName,
    operationName,
    canonicalKey: `${entityName}.${operationName}`,
    route: `/api/site/public/operations/${entityName}/${operationName}`,
    challenge: { kind: "turnstile", siteKey: "public-site-key" },
    ...(options.fields === undefined ? {} : { fields: options.fields }),
  };
}

function publicCommandResponse() {
  return {
    invocationId: "operation-1",
    operation: {
      entityName: "subscription",
      operationName: "subscribe",
      canonicalKey: "subscription.subscribe",
      kind: "command",
    },
    output: { type: "command", affectedChangeIds: ["10"], cursor: 12 },
    status: "committed",
  };
}

function publicCreateResponse() {
  return {
    invocationId: "operation-1",
    operation: {
      entityName: "request",
      operationName: "submit",
      canonicalKey: "request.submit",
      kind: "create",
    },
    output: {
      type: "create",
      affectedChangeIds: ["10"],
      cursor: 12,
      record: { id: "private-record", entity: "request", values: { private: "value" } },
    },
    status: "committed",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
