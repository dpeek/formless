import type { FormlessUiApplicationSystemStateContract } from "@dpeek/formless-presentation/contract";
import { formlessUiApplicationSystemStateReference } from "@dpeek/formless-presentation/contract-host";

export type FormlessApplicationSystemStateFixtureId =
  FormlessUiApplicationSystemStateContract["state"];

export type FormlessApplicationSystemStateFixture = {
  id: FormlessApplicationSystemStateFixtureId;
  label: string;
  reference: ReturnType<typeof formlessUiApplicationSystemStateReference>;
  snapshot: FormlessUiApplicationSystemStateContract;
};

export function createFormlessApplicationSystemStateFixtures(): FormlessApplicationSystemStateFixture[] {
  return [
    fixture("loading", "Loading", "Loading Formless", "Preparing the application."),
    fixture("empty", "Empty", "Nothing here yet", "No application content is available."),
    fixture("missing", "Missing", "Not found", "The requested application route does not exist.", {
      actions: [action("missing", "go-home", "Go to Formless", "navigate")],
    }),
    fixture(
      "unavailable",
      "Unavailable",
      "Application unavailable",
      "This application surface is not available.",
      {
        feedback: feedback("unavailable", "warning", "Application unavailable"),
      },
    ),
    fixture("blocked", "Blocked", "Application blocked", "The application cannot continue.", {
      facts: [
        {
          id: "blocker",
          kind: "applicationSystemStateFact",
          label: "Blocker",
          value: "Browser storage is open elsewhere.",
        },
      ],
      feedback: feedback("blocked", "warning", "Close other browser tabs and retry."),
      actions: [action("blocked", "retry", "Retry", "retry")],
    }),
    fixture("failure", "Failure", "Application failed", "The application could not start.", {
      feedback: feedback("failure", "danger", "Try again after checking the current connection."),
      actions: [action("failure", "retry", "Retry", "retry")],
    }),
  ];
}

function fixture(
  state: FormlessApplicationSystemStateFixtureId,
  label: string,
  heading: string,
  message: string,
  options: Partial<
    Pick<FormlessUiApplicationSystemStateContract, "actions" | "facts" | "feedback">
  > = {
    actions: [],
    facts: [],
  },
): FormlessApplicationSystemStateFixture {
  const stateId = `application-system-state:${state}`;
  return {
    id: state,
    label,
    reference: formlessUiApplicationSystemStateReference(stateId),
    snapshot: {
      accessibilityLabel: heading,
      actions: options.actions ?? [],
      facts: options.facts ?? [],
      ...(options.feedback ? { feedback: options.feedback } : {}),
      heading,
      id: stateId,
      kind: "applicationSystemState",
      message,
      state,
    },
  };
}

function action(
  state: FormlessApplicationSystemStateFixtureId,
  id: string,
  label: string,
  purpose: "navigate" | "retry",
): FormlessUiApplicationSystemStateContract["actions"][number] {
  const controlId = `control:${id}`;
  return {
    control: {
      accessibilityLabel: label,
      content: { kind: "label", label },
      density: "default",
      id: controlId,
      kind: "button",
      prominence: "primary",
      type: "button",
    },
    id,
    intent: {
      actionId: id,
      controlId,
      stateId: `application-system-state:${state}`,
      type: "applicationSystemStateAction",
    },
    kind: "applicationSystemStateAction",
    purpose,
  };
}

function feedback(
  id: string,
  intent: "danger" | "warning",
  title: string,
): FormlessUiApplicationSystemStateContract["feedback"] {
  return {
    id: `feedback:${id}`,
    intent,
    kind: "applicationSystemStateFeedback",
    title,
  };
}
