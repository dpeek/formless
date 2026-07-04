import { useEffect, useState, type ComponentProps } from "react";
import * as stylex from "@stylexjs/stylex";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  borderVars,
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  FingerPrintIcon,
  ShieldCheckIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";

// PROTOTYPE: user-facing auth flow states, switchable with the bottom bar.

type AuthIcon = ComponentProps<typeof Icon>["icon"];
type AuthScenarioKind =
  | "signIn"
  | "ownerSetup"
  | "verifyEmail"
  | "invite"
  | "handoff"
  | "destinations"
  | "expiredInvite";

type AuthScenario = {
  id: string;
  label: string;
  kind: AuthScenarioKind;
  icon: AuthIcon;
};

const authScenarios: AuthScenario[] = [
  { id: "sign-in", label: "Sign in", kind: "signIn", icon: FingerPrintIcon },
  { id: "owner-setup", label: "Owner setup", kind: "ownerSetup", icon: ShieldCheckIcon },
  { id: "verify-email", label: "Verify email", kind: "verifyEmail", icon: EnvelopeIcon },
  { id: "invite", label: "Invitation", kind: "invite", icon: UserPlusIcon },
  { id: "handoff", label: "Continue", kind: "handoff", icon: CheckCircleIcon },
  { id: "destinations", label: "Destinations", kind: "destinations", icon: BuildingOffice2Icon },
  {
    id: "expired-invite",
    label: "Expired invite",
    kind: "expiredInvite",
    icon: ExclamationTriangleIcon,
  },
];

const defaultScenarioId = authScenarios[0]?.id ?? "sign-in";

const styles = stylex.create({
  screen: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    paddingBlock: spacingVars["--spacing-10"],
    paddingInline: spacingVars["--spacing-5"],
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
  },
  productFrame: {
    width: "min(100%, 480px)",
  },
  cardHeader: {
    display: "grid",
    gap: spacingVars["--spacing-3"],
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radiusVars["--radius-element"],
    display: "grid",
    placeItems: "center",
    backgroundColor: colorVars["--color-background-muted"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
  },
  form: {
    display: "grid",
    gap: spacingVars["--spacing-4"],
  },
  actions: {
    paddingTop: spacingVars["--spacing-2"],
  },
  destinationList: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
  },
  destinationButton: {
    width: "100%",
    justifyContent: "space-between",
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-3"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: radiusVars["--radius-element"],
    backgroundColor: colorVars["--color-background-card"],
    color: colorVars["--color-text-primary"],
    textAlign: "start",
    cursor: "pointer",
  },
  destinationButtonHover: {
    backgroundColor: {
      default: colorVars["--color-background-card"],
      ":hover": colorVars["--color-background-muted"],
    },
  },
  notice: {
    borderRadius: radiusVars["--radius-container"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    backgroundColor: colorVars["--color-background-muted"],
    padding: spacingVars["--spacing-4"],
  },
  errorNotice: {
    borderColor: colorVars["--color-error"],
    backgroundColor: colorVars["--color-background-red"],
  },
  switcher: {
    position: "fixed",
    zIndex: 20,
    left: "50%",
    bottom: spacingVars["--spacing-4"],
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
    padding: spacingVars["--spacing-1"],
    borderRadius: radiusVars["--radius-container"],
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    backgroundColor: colorVars["--color-background-card"],
    boxShadow: shadowVars["--shadow-high"],
  },
  switcherLabel: {
    minWidth: 128,
    paddingInline: spacingVars["--spacing-2"],
    textAlign: "center",
    "@media (max-width: 460px)": {
      minWidth: 104,
    },
  },
});

export function FormlessAuthLayout() {
  const [scenarioId, setScenarioId] = useAuthScenarioSelection();
  const selectedIndex = Math.max(
    0,
    authScenarios.findIndex((scenario) => scenario.id === scenarioId),
  );
  const scenario = authScenarios[selectedIndex] ?? authScenarios[0];

  if (!scenario) {
    return null;
  }

  const selectScenarioByOffset = (offset: number) => {
    const nextIndex = (selectedIndex + offset + authScenarios.length) % authScenarios.length;
    const nextScenario = authScenarios[nextIndex];

    if (nextScenario) {
      setScenarioId(nextScenario.id);
    }
  };

  return (
    <AppShell contentPadding={0}>
      <main {...stylex.props(styles.screen)}>
        <div {...stylex.props(styles.productFrame)}>
          <AuthCard scenario={scenario} />
        </div>
        <AuthScenarioSwitcher
          currentScenario={scenario}
          currentIndex={selectedIndex}
          scenarioCount={authScenarios.length}
          onPrevious={() => selectScenarioByOffset(-1)}
          onNext={() => selectScenarioByOffset(1)}
        />
      </main>
    </AppShell>
  );
}

type AuthCardProps = {
  scenario: AuthScenario;
};

function AuthCard({ scenario }: AuthCardProps) {
  return (
    <Card padding={6}>
      <VStack gap={5}>
        <AuthCardHeader scenario={scenario} />
        <AuthScenarioBody scenario={scenario} />
      </VStack>
    </Card>
  );
}

function AuthCardHeader({ scenario }: AuthCardProps) {
  const copy = resolveHeaderCopy(scenario.kind);

  return (
    <header {...stylex.props(styles.cardHeader)}>
      <span {...stylex.props(styles.iconWrap)}>
        <Icon icon={scenario.icon} color={scenario.kind === "expiredInvite" ? "error" : "accent"} />
      </span>
      <VStack gap={2}>
        <Heading level={2}>{copy.title}</Heading>
        <Text type="body" as="p" color="secondary">
          {copy.description}
        </Text>
      </VStack>
    </header>
  );
}

function AuthScenarioBody({ scenario }: AuthCardProps) {
  switch (scenario.kind) {
    case "ownerSetup":
      return <OwnerSetupForm />;
    case "verifyEmail":
      return <VerifyEmailForm />;
    case "invite":
      return <InvitationForm />;
    case "handoff":
      return <HandoffState />;
    case "destinations":
      return <DestinationPicker />;
    case "expiredInvite":
      return <ExpiredInviteState />;
    case "signIn":
    default:
      return <SignInForm />;
  }
}

function SignInForm() {
  return (
    <div {...stylex.props(styles.form)}>
      <TextInput
        label="Email"
        type="email"
        value=""
        placeholder="name@example.com"
        onChange={() => {}}
      />
      <HStack gap={2} wrap="wrap" {...stylex.props(styles.actions)}>
        <Button
          label="Continue with passkey"
          variant="primary"
          icon={<Icon icon={FingerPrintIcon} color="inherit" size="sm" />}
        />
      </HStack>
    </div>
  );
}

function OwnerSetupForm() {
  return (
    <div {...stylex.props(styles.form)}>
      <TextInput label="Name" value="Dana Peek" onChange={() => {}} />
      <TextInput
        label="Email"
        type="email"
        value="dana@example.com"
        onChange={() => {}}
      />
      <HStack gap={2} wrap="wrap" {...stylex.props(styles.actions)}>
        <Button
          label="Create owner passkey"
          variant="primary"
          icon={<Icon icon={FingerPrintIcon} color="inherit" size="sm" />}
        />
        <Button label="Use recovery key" variant="ghost" />
      </HStack>
    </div>
  );
}

function VerifyEmailForm() {
  return (
    <div {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.notice)}>
        <Text type="body" as="p">
          We sent a verification code to <strong>dana@example.com</strong>.
        </Text>
      </div>
      <TextInput label="Verification code" value="492814" onChange={() => {}} />
      <HStack gap={2} wrap="wrap" {...stylex.props(styles.actions)}>
        <Button label="Verify email" variant="primary" />
        <Button label="Send a new code" variant="ghost" />
      </HStack>
    </div>
  );
}

function InvitationForm() {
  return (
    <div {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.notice)}>
        <Text type="body" as="p">
          Dana invited you to collaborate on <strong>CRM workspace</strong>.
        </Text>
      </div>
      <TextInput label="Name" value="Sam Rivera" onChange={() => {}} />
      <TextInput label="Email" type="email" value="sam@example.com" onChange={() => {}} />
      <HStack gap={2} wrap="wrap" {...stylex.props(styles.actions)}>
        <Button
          label="Accept invite"
          variant="primary"
          icon={<Icon icon={FingerPrintIcon} color="inherit" size="sm" />}
        />
        <Button label="Decline" variant="ghost" />
      </HStack>
    </div>
  );
}

function HandoffState() {
  return (
    <VStack gap={5} hAlign="center">
      <Spinner size="xl" />
      <VStack gap={2} hAlign="center">
        <Text type="label" as="div">
          Taking you to CRM workspace
        </Text>
        <Text type="body" as="p" color="secondary" justify="center">
          This should only take a moment.
        </Text>
      </VStack>
    </VStack>
  );
}

function DestinationPicker() {
  const destinations = [
    {
      label: "Workspace admin",
      detail: "Manage apps, access, domains, and deployment.",
    },
    {
      label: "CRM workspace",
      detail: "Open contacts and customer activity.",
    },
    {
      label: "Tasks",
      detail: "Open your active work queue.",
    },
  ];

  return (
    <div {...stylex.props(styles.destinationList)}>
      {destinations.map((destination) => (
        <button
          key={destination.label}
          type="button"
          {...stylex.props(styles.destinationButton, styles.destinationButtonHover)}
        >
          <HStack hAlign="between" vAlign="center" gap={3}>
            <VStack gap={1}>
              <Text type="label" as="div">
                {destination.label}
              </Text>
              <Text type="supporting" color="secondary">
                {destination.detail}
              </Text>
            </VStack>
            <Icon icon={ArrowRightIcon} size="sm" color="secondary" />
          </HStack>
        </button>
      ))}
    </div>
  );
}

function ExpiredInviteState() {
  return (
    <div {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.notice, styles.errorNotice)}>
        <Text type="body" as="p">
          Ask the workspace owner to send a new invitation to continue.
        </Text>
      </div>
      <HStack gap={2} wrap="wrap" {...stylex.props(styles.actions)}>
        <Button label="Back to sign in" variant="primary" />
        <Button label="Contact owner" variant="ghost" />
      </HStack>
    </div>
  );
}

type AuthScenarioSwitcherProps = {
  currentScenario: AuthScenario;
  currentIndex: number;
  scenarioCount: number;
  onPrevious: () => void;
  onNext: () => void;
};

function AuthScenarioSwitcher({
  currentScenario,
  currentIndex,
  scenarioCount,
  onPrevious,
  onNext,
}: AuthScenarioSwitcherProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNext, onPrevious]);

  return (
    <div {...stylex.props(styles.switcher)} aria-label="Switch auth state">
      <IconButton
        label="Previous auth state"
        tooltip="Previous auth state"
        variant="ghost"
        size="sm"
        icon={<Icon icon={ChevronLeftIcon} color="inherit" size="sm" />}
        onClick={onPrevious}
      />
      <div {...stylex.props(styles.switcherLabel)}>
        <Text type="label" as="div" maxLines={1}>
          {currentScenario.label}
        </Text>
        <Text type="supporting" color="secondary">
          {currentIndex + 1} / {scenarioCount}
        </Text>
      </div>
      <IconButton
        label="Next auth state"
        tooltip="Next auth state"
        variant="ghost"
        size="sm"
        icon={<Icon icon={ChevronRightIcon} color="inherit" size="sm" />}
        onClick={onNext}
      />
    </div>
  );
}

function resolveHeaderCopy(kind: AuthScenarioKind) {
  switch (kind) {
    case "ownerSetup":
      return {
        title: "Set up your workspace",
        description: "Create the owner account and passkey for this Formless workspace.",
      };
    case "verifyEmail":
      return {
        title: "Check your email",
        description: "Enter the code we sent so we can finish setting up your account.",
      };
    case "invite":
      return {
        title: "Join CRM workspace",
        description: "Accept the invitation and create a passkey to continue.",
      };
    case "handoff":
      return {
        title: "You are signed in",
        description: "We are opening the workspace on its own domain.",
      };
    case "destinations":
      return {
        title: "Where do you want to go?",
        description: "Choose a workspace or app connected to your account.",
      };
    case "expiredInvite":
      return {
        title: "This invitation has expired",
        description: "For security, invitations can only be used for a limited time.",
      };
    case "signIn":
    default:
      return {
        title: "Sign in to Formless",
        description: "Use your passkey to continue to your workspace.",
      };
  }
}

function useAuthScenarioSelection() {
  const [scenarioId, setScenarioIdState] = useState(() =>
    resolveScenarioId(readAuthScenarioParam()),
  );

  const setScenarioId = (nextScenarioId: string) => {
    const resolvedScenarioId = resolveScenarioId(nextScenarioId);

    setScenarioIdState(resolvedScenarioId);
    writeAuthScenarioParam(resolvedScenarioId);
  };

  return [scenarioId, setScenarioId] as const;
}

function resolveScenarioId(candidate: string | null) {
  if (candidate && authScenarios.some((scenario) => scenario.id === candidate)) {
    return candidate;
  }

  return defaultScenarioId;
}

function readAuthScenarioParam() {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("authScenario");
}

function writeAuthScenarioParam(scenarioId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("authScenario", scenarioId);
  window.history.replaceState(null, "", url);
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}
