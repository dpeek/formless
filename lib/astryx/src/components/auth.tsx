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
  fontWeightVars,
  radiusVars,
  shadowVars,
  spacingVars,
  typeScaleVars,
} from "@astryxdesign/core/theme/tokens.stylex";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FingerPrintIcon,
} from "@heroicons/react/24/outline";
import { OTPInput } from "./otp-input.tsx";

type AuthIcon = ComponentProps<typeof Icon>["icon"];
type AuthScenarioKind =
  | "signIn"
  | "ownerSetup"
  | "accountDetails"
  | "verifyEmail"
  | "createPasskey"
  | "invite"
  | "handoff"
  | "destinations"
  | "expiredInvite";

type AuthScenario = {
  id: string;
  label: string;
  kind: AuthScenarioKind;
};

const authScenarios: AuthScenario[] = [
  { id: "sign-in", label: "Sign in", kind: "signIn" },
  { id: "owner-setup", label: "Owner setup", kind: "ownerSetup" },
  { id: "account-details", label: "Account details", kind: "accountDetails" },
  { id: "verify-email", label: "Verify email", kind: "verifyEmail" },
  { id: "create-passkey", label: "Passkey", kind: "createPasskey" },
  { id: "invite", label: "Invitation", kind: "invite" },
  { id: "handoff", label: "Continue", kind: "handoff" },
  { id: "destinations", label: "Destinations", kind: "destinations" },
  { id: "expired-invite", label: "Expired invite", kind: "expiredInvite" },
];

const defaultScenarioId = authScenarios[0]?.id ?? "sign-in";
const authBrand = {
  name: "Formless",
  icon: FingerPrintIcon,
} satisfies {
  name: string;
  icon: AuthIcon;
};
const verificationEmail = "dana@example.com";

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
    display: "grid",
    gap: spacingVars["--spacing-6"],
    justifyItems: "center",
  },
  productCard: {
    width: "100%",
  },
  cardHeader: {
    display: "grid",
    gap: spacingVars["--spacing-3"],
    justifyItems: "center",
    textAlign: "center",
  },
  brandLockup: {
    display: "grid",
    justifyItems: "center",
    justifyContent: "center",
    gap: spacingVars["--spacing-2"],
  },
  iconWrap: {
    width: spacingVars["--spacing-9"],
    height: spacingVars["--spacing-9"],
    borderRadius: radiusVars["--radius-element"],
    display: "grid",
    placeItems: "center",
  },
  brandIcon: {
    width: spacingVars["--spacing-8"],
    height: spacingVars["--spacing-8"],
    color: colorVars["--color-accent"],
  },
  brandName: {
    color: colorVars["--color-text-primary"],
    fontSize: typeScaleVars["--text-heading-2-size"],
    lineHeight: typeScaleVars["--text-heading-2-leading"],
    fontWeight: fontWeightVars["--font-weight-semibold"],
  },
  form: {
    display: "grid",
    gap: spacingVars["--spacing-4"],
  },
  actions: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
    paddingTop: spacingVars["--spacing-2"],
    width: "100%",
  },
  actionButton: {
    width: "100%",
  },
  otpInputWrap: {
    width: "max-content",
    maxWidth: "100%",
    justifySelf: "center",
  },
  legalLine: {
    maxWidth: "100%",
    textAlign: "center",
  },
  legalLink: {
    color: colorVars["--color-text-primary"],
    textDecorationLine: "none",
  },
  legalLinkHover: {
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
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
          <AuthBrand />
          <AuthCard scenario={scenario} />
          <AuthLegalLine scenario={scenario} />
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
    <div {...stylex.props(styles.productCard)}>
      <Card padding={6}>
        <VStack gap={5}>
          <AuthCardHeader scenario={scenario} />
          <AuthScenarioBody scenario={scenario} />
        </VStack>
      </Card>
    </div>
  );
}

function AuthBrand() {
  const BrandIcon = authBrand.icon;

  return (
    <div {...stylex.props(styles.brandLockup)}>
      <span {...stylex.props(styles.iconWrap)}>
        <BrandIcon aria-hidden="true" {...stylex.props(styles.brandIcon)} />
      </span>
      <Text type="label" as="div" {...stylex.props(styles.brandName)}>
        {authBrand.name}
      </Text>
    </div>
  );
}

function AuthLegalLine({ scenario }: AuthCardProps) {
  if (scenario.kind !== "signIn") {
    return null;
  }

  return (
    <Text
      type="supporting"
      as="p"
      color="secondary"
      justify="center"
      {...stylex.props(styles.legalLine)}
    >
      By continuing, you agree to the{" "}
      <a href="/terms" {...stylex.props(styles.legalLink, styles.legalLinkHover)}>
        Terms of Service
      </a>{" "}
      and{" "}
      <a href="/privacy" {...stylex.props(styles.legalLink, styles.legalLinkHover)}>
        Privacy Policy
      </a>
      .
    </Text>
  );
}

function AuthCardHeader({ scenario }: AuthCardProps) {
  const copy = resolveHeaderCopy(scenario.kind);

  return (
    <header {...stylex.props(styles.cardHeader)}>
      <VStack gap={2}>
        <Heading level={2}>{copy.title}</Heading>
        <Text type="body" as="p" color="secondary" justify="center">
          {copy.description}
        </Text>
      </VStack>
    </header>
  );
}

function AuthScenarioBody({ scenario }: AuthCardProps) {
  switch (scenario.kind) {
    case "ownerSetup":
      return <OwnerSetupEntry />;
    case "accountDetails":
      return <AccountDetailsForm />;
    case "verifyEmail":
      return <VerifyEmailForm />;
    case "createPasskey":
      return <CreatePasskeyForm />;
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
      <div {...stylex.props(styles.actions)}>
        <Button
          label="Continue with passkey"
          variant="primary"
          icon={<Icon icon={FingerPrintIcon} color="inherit" size="sm" />}
          xstyle={styles.actionButton}
        />
      </div>
    </div>
  );
}

function OwnerSetupEntry() {
  return (
    <div {...stylex.props(styles.form)}>
      <VStack gap={5} hAlign="center">
        <Spinner size="xl" />
      </VStack>
    </div>
  );
}

function AccountDetailsForm() {
  return (
    <div {...stylex.props(styles.form)}>
      <TextInput label="Name" value="Dana Peek" onChange={() => {}} />
      <TextInput label="Email" type="email" value="dana@example.com" onChange={() => {}} />
      <div {...stylex.props(styles.actions)}>
        <Button label="Continue" variant="primary" xstyle={styles.actionButton} />
      </div>
    </div>
  );
}

function VerifyEmailForm() {
  const [verificationCode, setVerificationCode] = useState("");
  const [isCodeVerified, setIsCodeVerified] = useState(false);
  const verificationCodeLength = 6;

  const handleVerificationCodeChange = (nextCode: string) => {
    setVerificationCode(nextCode);

    if (isCodeVerified) {
      setIsCodeVerified(false);
    }
  };

  const verifyCodeAction = async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    setIsCodeVerified(true);
  };

  return (
    <div {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.otpInputWrap)}>
        <OTPInput
          value={verificationCode}
          onChange={handleVerificationCodeChange}
          completeAction={verifyCodeAction}
          status={
            isCodeVerified
              ? {
                  type: "success",
                  message: "Code verified. You can keep going.",
                }
              : undefined
          }
          length={verificationCodeLength}
          htmlName="emailVerificationCode"
          hasAutoFocus
        />
      </div>
      <div {...stylex.props(styles.actions)}>
        <Button label="Resend code" variant="secondary" xstyle={styles.actionButton} />
      </div>
    </div>
  );
}

function CreatePasskeyForm() {
  return (
    <div {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.actions)}>
        <Button
          label="Create passkey"
          variant="primary"
          icon={<Icon icon={FingerPrintIcon} color="inherit" size="sm" />}
          xstyle={styles.actionButton}
        />
      </div>
    </div>
  );
}

function InvitationForm() {
  return (
    <div {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.notice)}>
        <Text type="body" as="p">
          Dana invited you to collaborate on <strong>CRM</strong>.
        </Text>
      </div>
      <div {...stylex.props(styles.actions)}>
        <Button label="Accept invitation" variant="primary" xstyle={styles.actionButton} />
        <Button label="Decline" variant="secondary" xstyle={styles.actionButton} />
      </div>
    </div>
  );
}

function HandoffState() {
  return (
    <VStack gap={5} hAlign="center">
      <Spinner size="xl" />
    </VStack>
  );
}

function DestinationPicker() {
  const destinations = [
    {
      label: "Instance admin",
      detail: "Manage apps, access, domains, and deployment.",
    },
    {
      label: "CRM",
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
      <div {...stylex.props(styles.actions)}>
        <Button label="Back to sign in" variant="primary" xstyle={styles.actionButton} />
        <Button label="Contact owner" variant="secondary" xstyle={styles.actionButton} />
      </div>
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
        title: "Preparing owner setup",
        description: "We are verifying the setup link before continuing.",
      };
    case "accountDetails":
      return {
        title: "Create your account",
        description: "Add the account details used across this instance.",
      };
    case "verifyEmail":
      return {
        title: "Check your email",
        description: `We've sent a code to ${verificationEmail}`,
      };
    case "createPasskey":
      return {
        title: "Create a passkey",
        description: "Email verified. Create a passkey for future sign-ins.",
      };
    case "invite":
      return {
        title: "Join CRM",
        description: "Accept the invitation, then continue through account setup.",
      };
    case "handoff":
      return {
        title: "You are signed in",
        description: "We are opening the app on its own domain.",
      };
    case "destinations":
      return {
        title: "Where do you want to go?",
        description: "Choose an instance or app connected to your account.",
      };
    case "expiredInvite":
      return {
        title: "This invitation has expired",
        description: "Ask the instance owner to send a new invitation to continue.",
      };
    case "signIn":
    default:
      return {
        title: "Sign in to your account",
        description: "Use your passkey to continue",
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
