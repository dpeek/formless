import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import * as stylex from "@stylexjs/stylex";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu";
import { Icon, type IconType } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot, type StatusDotVariant } from "@astryxdesign/core/StatusDot";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading, Text } from "@astryxdesign/core/Text";
import { ToastViewport, useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { borderVars, colorVars, spacingVars } from "@astryxdesign/core/theme/tokens.stylex";
import {
  ArchiveBoxArrowDownIcon,
  ArchiveBoxXMarkIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";

type OperationScope = "workspace" | "collection" | "record" | "form";
type OperationKind = "create" | "update" | "delete" | "transition" | "sync" | "bulk";
type OperationVariant = ButtonVariant;
type OperationInvocationSource = "button" | "menuItem" | "submitButton" | "confirmationDialog";
type OperationExecutionStatus = "idle" | "pending" | "committed" | "replayed" | "failed";
type OperationMockOutcome =
  | {
      type: "committed";
      delayMs?: number;
      affectedCount?: number;
      createdRecordIds?: readonly string[];
    }
  | {
      type: "replay";
      delayMs?: number;
    }
  | {
      type: "failure";
      delayMs?: number;
      displayError: string;
    };

type OperationBinding = {
  id: string;
  executionKey: string;
  canonicalOperationKey: string;
  label: string;
  scope: OperationScope;
  kind: OperationKind;
  variant: OperationVariant;
  disabledReason?: string;
  destructive?: boolean;
  confirmation?: OperationConfirmation;
  feedback?: OperationFeedbackCopy;
  progress?: OperationProgress;
};

type OperationConfirmation = {
  title: string;
  description: string;
  actionLabel: string;
};

type OperationFeedbackCopy = {
  progressTitle?: string;
  progressDetail?: string;
  successTitle?: string;
  successDetail?: string;
  replayTitle?: string;
  replayDetail?: string;
  failureTitle?: string;
};

type OperationProgress = {
  steps?: readonly OperationProgressStep[];
};

type OperationProgressStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "succeeded";
};

type OperationExecutionInput = {
  source: OperationInvocationSource;
  values?: Record<string, string>;
};

type OperationExecutionResult =
  | {
      type: "committed";
      title: string;
      detail: string;
      affectedCount?: number;
      createdRecordIds?: readonly string[];
    }
  | {
      type: "replayed";
      title: string;
      detail: string;
    }
  | {
      type: "failed";
      title: string;
      displayError: string;
    };

type OperationExecutionState = {
  executionKey: string;
  status: OperationExecutionStatus;
  result?: OperationExecutionResult;
  startedAt?: number;
  completedAt?: number;
};

type OperationExecutionController = {
  execute: (
    binding: OperationBinding,
    input: OperationExecutionInput,
  ) => Promise<OperationExecutionResult>;
  getState: (binding: OperationBinding) => OperationExecutionState;
  isPending: (binding: OperationBinding) => boolean;
  getResult: (binding: OperationBinding) => OperationExecutionResult | undefined;
};

type OperationMockExecutionPlan = {
  outcome: OperationMockOutcome;
};

type OperationFeedbackPhase = "progress" | "success" | "error";

type OperationFeedbackEvent = {
  id: string;
  bindingId: string;
  executionKey: string;
  canonicalOperationKey: string;
  label: string;
  phase: OperationFeedbackPhase;
  title: string;
  detail: string;
  createdAt: number;
};

type OperationExecutionContextValue = {
  controller: OperationExecutionController;
  states: ReadonlyMap<string, OperationExecutionState>;
};

type MockTask = {
  id: string;
  title: string;
  owner: string;
  status: "Open" | "Waiting" | "Done";
};

type MockContact = {
  id: string;
  name: string;
  company: string;
};

const progressToastDelayMs = 900;
const OperationExecutionContext = createContext<OperationExecutionContextValue | null>(null);

const mockTask: MockTask = {
  id: "task-launch",
  title: "Prepare launch checklist",
  owner: "Dana",
  status: "Open",
};

const mockContact: MockContact = {
  id: "contact-jordan",
  name: "Jordan Lee",
  company: "Northwind",
};

const operationExecutionPlans: Record<string, OperationMockExecutionPlan> = {
  "collection:tasks.create": {
    outcome: {
      type: "committed",
      delayMs: 520,
      affectedCount: 1,
      createdRecordIds: ["task-new"],
    },
  },
  "collection:tasks.clearCompleted": {
    outcome: {
      type: "committed",
      delayMs: 4200,
      affectedCount: 2,
    },
  },
  "workspace:push": {
    outcome: { type: "replay", delayMs: 760 },
  },
  "workspace:fail": {
    outcome: {
      type: "failure",
      delayMs: 700,
      displayError: "The operation was rejected.",
    },
  },
  [`record:${mockTask.id}:transferOwner`]: {
    outcome: {
      type: "committed",
      delayMs: 600,
      affectedCount: 1,
    },
  },
  [`record:${mockTask.id}:delete`]: {
    outcome: {
      type: "committed",
      delayMs: 850,
      affectedCount: 1,
    },
  },
  [`record:${mockTask.id}:edit`]: {
    outcome: {
      type: "committed",
      delayMs: 520,
      affectedCount: 1,
    },
  },
  [`record:${mockTask.id}:complete`]: {
    outcome: {
      type: "committed",
      delayMs: 660,
      affectedCount: 1,
    },
  },
  [`record:${mockTask.id}:archive`]: {
    outcome: {
      type: "committed",
      delayMs: 680,
      affectedCount: 1,
    },
  },
  "form:crm.contacts.create": {
    outcome: {
      type: "committed",
      delayMs: 720,
      affectedCount: 1,
      createdRecordIds: ["contact-new"],
    },
  },
};

const operationExamples = {
  createTask: {
    id: "button:tasks.create",
    executionKey: "collection:tasks.create",
    canonicalOperationKey: "tasks.create",
    label: "New task",
    scope: "collection",
    kind: "create",
    variant: "primary",
    feedback: {
      successTitle: "Task created",
    },
  },
  clearCompleted: {
    id: "button:tasks.clearCompleted",
    executionKey: "collection:tasks.clearCompleted",
    canonicalOperationKey: "tasks.clearCompleted",
    label: "Clear completed",
    scope: "collection",
    kind: "bulk",
    variant: "secondary",
    feedback: {
      progressTitle: "Clearing completed tasks",
      progressDetail: "You can keep working while this finishes.",
      successTitle: "Completed tasks cleared",
    },
    progress: {
      steps: [
        { id: "find", label: "Find completed tasks", status: "succeeded" },
        { id: "clear", label: "Clear matching records", status: "running" },
        { id: "refresh", label: "Refresh task list", status: "pending" },
      ],
    },
  },
  pushWorkspace: {
    id: "button:workspace.push",
    executionKey: "workspace:push",
    canonicalOperationKey: "workspace.push",
    label: "Push workspace",
    scope: "workspace",
    kind: "sync",
    variant: "secondary",
    feedback: {
      replayTitle: "Workspace push already applied",
      replayDetail: "No duplicate changes made.",
    },
  },
  failingOperation: {
    id: "button:workspace.fail",
    executionKey: "workspace:fail",
    canonicalOperationKey: "workspace.fail",
    label: "Failing operation",
    scope: "workspace",
    kind: "sync",
    variant: "secondary",
    feedback: {
      failureTitle: "Failing operation failed",
    },
  },
  disabledTransfer: {
    id: `button:${mockTask.id}.transferOwner`,
    executionKey: `record:${mockTask.id}:transferOwner`,
    canonicalOperationKey: "tasks.transferOwner",
    label: "Transfer owner",
    scope: "record",
    kind: "update",
    variant: "secondary",
    disabledReason: "Requires owner role.",
  },
  deleteTask: {
    id: `button:${mockTask.id}.delete`,
    executionKey: `record:${mockTask.id}:delete`,
    canonicalOperationKey: "tasks.delete",
    label: "Delete task",
    scope: "record",
    kind: "delete",
    variant: "destructive",
    destructive: true,
    confirmation: {
      title: "Delete task?",
      description: `${mockTask.title} will be removed from this workspace.`,
      actionLabel: "Delete",
    },
    feedback: {
      successTitle: "Task deleted",
    },
  },
} satisfies Record<string, OperationBinding>;

const styles = stylex.create({
  screen: {
    minHeight: "100vh",
    paddingBlock: spacingVars["--spacing-6"],
    paddingInline: spacingVars["--spacing-6"],
    backgroundColor: colorVars["--color-background-body"],
    color: colorVars["--color-text-primary"],
    "@media (max-width: 720px)": {
      paddingBlock: spacingVars["--spacing-4"],
      paddingInline: spacingVars["--spacing-4"],
    },
  },
  content: {
    width: "min(100%, 1120px)",
    marginInline: "auto",
    display: "grid",
    gap: spacingVars["--spacing-4"],
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacingVars["--spacing-3"],
    flexWrap: "wrap",
  },
  caseGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: spacingVars["--spacing-3"],
    alignItems: "stretch",
  },
  caseCardBody: {
    minHeight: 176,
  },
  metadata: {
    minHeight: 36,
  },
  controlArea: {
    minHeight: spacingVars["--spacing-10"],
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-2"],
  },
  reason: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    gap: spacingVars["--spacing-1"],
  },
  feedbackPanel: {
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderRadius: "8px",
    display: "grid",
    gap: spacingVars["--spacing-2"],
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-3"],
  },
  feedbackHeader: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "start",
    gap: spacingVars["--spacing-2"],
  },
  feedbackError: {
    backgroundColor: colorVars["--color-error-muted"],
    borderColor: colorVars["--color-error"],
  },
  feedbackSuccess: {
    backgroundColor: colorVars["--color-background-muted"],
    borderColor: colorVars["--color-success"],
  },
  feedbackProgress: {
    backgroundColor: colorVars["--color-accent-muted"],
    borderColor: colorVars["--color-accent"],
  },
  progressSteps: {
    display: "grid",
    gap: spacingVars["--spacing-1"],
    paddingInlineStart: spacingVars["--spacing-6"],
  },
  progressStep: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
  },
  toastBody: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    gap: spacingVars["--spacing-2"],
    alignItems: "start",
  },
  formGrid: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
  },
  formActions: {
    paddingTop: spacingVars["--spacing-1"],
  },
  menuWrap: {
    display: "flex",
    alignItems: "center",
  },
  divider: {
    height: borderVars["--border-width"],
    backgroundColor: colorVars["--color-border"],
  },
});

export function FormlessOperationsLayout() {
  return (
    <ToastViewport position="bottomEnd" maxVisible={4}>
      <OperationExecutionProvider>
        <main {...stylex.props(styles.screen)}>
          <div {...stylex.props(styles.content)}>
            <OperationsHeader />
            <OperationCaseGrid />
          </div>
        </main>
      </OperationExecutionProvider>
    </ToastViewport>
  );
}

function OperationsHeader() {
  return (
    <header {...stylex.props(styles.header)}>
      <VStack gap={1}>
        <Heading level={1}>Operations</Heading>
        <Text type="body" as="p" color="secondary">
          Bound controls
        </Text>
      </VStack>
    </header>
  );
}

function OperationCaseGrid() {
  return (
    <div {...stylex.props(styles.caseGrid)}>
      <OperationCaseCard
        title="Committed button"
        operation={operationExamples.createTask}
        control={<OperationButton operation={operationExamples.createTask} icon={PlusIcon} />}
      />
      <OperationCaseCard
        title="Delayed progress"
        operation={operationExamples.clearCompleted}
        control={
          <OperationButton
            operation={operationExamples.clearCompleted}
            icon={ArchiveBoxXMarkIcon}
          />
        }
      />
      <OperationCaseCard
        title="Already applied"
        operation={operationExamples.pushWorkspace}
        control={
          <OperationButton operation={operationExamples.pushWorkspace} icon={CloudArrowUpIcon} />
        }
      />
      <OperationCaseCard
        title="Failure"
        operation={operationExamples.failingOperation}
        control={
          <OperationButton
            operation={operationExamples.failingOperation}
            icon={ExclamationTriangleIcon}
          />
        }
      />
      <OperationCaseCard
        title="Disabled"
        operation={operationExamples.disabledTransfer}
        control={
          <OperationButton operation={operationExamples.disabledTransfer} icon={NoSymbolIcon} />
        }
      />
      <OperationCaseCard
        title="Confirmation"
        operation={operationExamples.deleteTask}
        control={<OperationButton operation={operationExamples.deleteTask} icon={TrashIcon} />}
      />
      <OperationCaseCard
        title="Menu items"
        operations={createTaskMenuOperations(mockTask)}
        control={<OperationMenu operations={createTaskMenuOperations(mockTask)} />}
      />
      <OperationSubmitCase />
    </div>
  );
}

function OperationCaseCard({
  title,
  operation,
  operations,
  control,
}: {
  title: string;
  operation?: OperationBinding;
  operations?: OperationBinding[];
  control: ReactNode;
}) {
  const metadataOperations = operations ?? (operation ? [operation] : []);

  return (
    <Card padding={4}>
      <VStack gap={4} {...stylex.props(styles.caseCardBody)}>
        <VStack gap={2}>
          <Heading level={2}>{title}</Heading>
          <OperationMetadata operations={metadataOperations} />
        </VStack>
        <div {...stylex.props(styles.controlArea)}>{control}</div>
        <OperationProgressPanel operations={metadataOperations} />
        <OperationResultPanel operations={metadataOperations} />
        <OperationFailureAlert operations={metadataOperations} />
        <OperationReasonLine operations={metadataOperations} />
      </VStack>
    </Card>
  );
}

function OperationSubmitCase() {
  const [name, setName] = useState(mockContact.name);
  const [company, setCompany] = useState(mockContact.company);
  const { controller } = useOperationExecution();
  const createContactOperation = useMemo<OperationBinding>(
    () => ({
      id: "submit:crm.contacts.create",
      executionKey: "form:crm.contacts.create",
      canonicalOperationKey: "crm.contacts.create",
      label: "Create contact",
      scope: "form",
      kind: "create",
      variant: "primary",
      disabledReason: name.trim().length === 0 ? "Enter a contact name." : undefined,
      feedback: {
        successTitle: `${name.trim() || "Contact"} created`,
      },
    }),
    [name],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (createContactOperation.disabledReason) {
        return;
      }
      void controller.execute(createContactOperation, {
        source: "submitButton",
        values: {
          company,
          name,
        },
      });
    },
    [company, controller, createContactOperation, name],
  );

  return (
    <Card padding={4}>
      <form onSubmit={handleSubmit}>
        <VStack gap={4} {...stylex.props(styles.caseCardBody)}>
          <VStack gap={2}>
            <Heading level={2}>Submit button</Heading>
            <OperationMetadata operations={[createContactOperation]} />
          </VStack>
          <div {...stylex.props(styles.formGrid)}>
            <TextInput label="Name" value={name} onChange={setName} />
            <TextInput label="Company" value={company} onChange={setCompany} />
          </div>
          <div {...stylex.props(styles.formActions)}>
            <OperationSubmitButton operation={createContactOperation} icon={UserPlusIcon} />
          </div>
          <OperationProgressPanel operations={[createContactOperation]} />
          <OperationResultPanel operations={[createContactOperation]} />
          <OperationFailureAlert operations={[createContactOperation]} />
          <OperationReasonLine operations={[createContactOperation]} />
        </VStack>
      </form>
    </Card>
  );
}

function OperationMetadata({ operations }: { operations: OperationBinding[] }) {
  const firstOperation = operations[0];

  if (!firstOperation) {
    return null;
  }

  if (operations.length > 1) {
    return (
      <Text type="supporting" color="secondary" {...stylex.props(styles.metadata)}>
        {operations.length} actions
      </Text>
    );
  }

  return (
    <Text type="supporting" color="secondary" {...stylex.props(styles.metadata)}>
      {formatOperationScope(firstOperation.scope)} {formatOperationKind(firstOperation.kind)}
    </Text>
  );
}

function OperationReasonLine({ operations }: { operations: OperationBinding[] }) {
  if (operations.length > 1 && operations.some((operation) => !operation.disabledReason)) {
    return null;
  }

  const disabledOperation = operations.find((operation) => operation.disabledReason);

  if (!disabledOperation?.disabledReason) {
    return null;
  }

  return (
    <Text type="supporting" color="secondary" {...stylex.props(styles.reason)}>
      <Icon icon={NoSymbolIcon} color="warning" size="sm" />
      <span>{disabledOperation.disabledReason}</span>
    </Text>
  );
}

function OperationProgressPanel({ operations }: { operations: OperationBinding[] }) {
  const { controller } = useOperationExecution();
  const pendingOperation = operations.find(
    (operation) => controller.isPending(operation) && operation.progress?.steps?.length,
  );

  if (!pendingOperation?.progress?.steps?.length) {
    return null;
  }

  return (
    <div role="status" {...stylex.props(styles.feedbackPanel, styles.feedbackProgress)}>
      <div {...stylex.props(styles.feedbackHeader)}>
        <Spinner size="sm" shade="inherit" />
        <VStack gap={0.5}>
          <Text type="label">Running</Text>
          <Text type="supporting" color="secondary">
            {pendingOperation.label} is in progress.
          </Text>
        </VStack>
      </div>
      <div {...stylex.props(styles.progressSteps)}>
        {pendingOperation.progress.steps.map((step) => (
          <div key={step.id} {...stylex.props(styles.progressStep)}>
            <OperationProgressStepMarker status={step.status} />
            <Text type="supporting" color={step.status === "pending" ? "secondary" : "primary"}>
              {step.label}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}

function OperationProgressStepMarker({ status }: { status: OperationProgressStep["status"] }) {
  if (status === "running") {
    return <Spinner size="sm" shade="inherit" />;
  }

  return (
    <StatusDot
      variant={status === "succeeded" ? "success" : "neutral"}
      label={formatOperationProgressStepStatus(status)}
    />
  );
}

function OperationResultPanel({ operations }: { operations: OperationBinding[] }) {
  const { controller } = useOperationExecution();
  const result = operations
    .map((operation) => controller.getResult(operation))
    .find(
      (value): value is Extract<OperationExecutionResult, { type: "committed" | "replayed" }> =>
        value?.type === "committed" || value?.type === "replayed",
    );

  if (!result) {
    return null;
  }

  return (
    <div role="status" {...stylex.props(styles.feedbackPanel, styles.feedbackSuccess)}>
      <div {...stylex.props(styles.feedbackHeader)}>
        <StatusDot
          variant={result.type === "committed" ? "success" : "neutral"}
          label={result.type === "committed" ? "Committed" : "Already applied"}
        />
        <VStack gap={0.5}>
          <Text type="label">{result.title}</Text>
          <Text type="supporting" color="secondary">
            {result.detail}
          </Text>
        </VStack>
      </div>
    </div>
  );
}

function OperationFailureAlert({ operations }: { operations: OperationBinding[] }) {
  const { controller } = useOperationExecution();
  const failure = operations
    .map((operation) => controller.getResult(operation))
    .find(
      (result): result is Extract<OperationExecutionResult, { type: "failed" }> =>
        result?.type === "failed",
    );

  if (!failure) {
    return null;
  }

  return (
    <div role="alert" {...stylex.props(styles.feedbackPanel, styles.feedbackError)}>
      <div {...stylex.props(styles.feedbackHeader)}>
        <Icon icon={ExclamationTriangleIcon} color="error" size="sm" />
        <VStack gap={0.5}>
          <Text type="label">{failure.title}</Text>
          <Text type="supporting" color="secondary">
            {failure.displayError}
          </Text>
        </VStack>
      </div>
    </div>
  );
}

function OperationButton({ operation, icon }: { operation: OperationBinding; icon?: IconType }) {
  const { controller } = useOperationExecution();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const isPending = controller.isPending(operation);
  const IconComponent = icon;

  const handleClick = useCallback(() => {
    if (operation.disabledReason || isPending) {
      return;
    }

    if (operation.confirmation) {
      setIsConfirmOpen(true);
      return;
    }

    void controller.execute(operation, { source: "button" });
  }, [controller, isPending, operation]);

  return (
    <>
      <Button
        label={operation.label}
        variant={operation.variant}
        icon={IconComponent ? <Icon icon={IconComponent} color="inherit" size="sm" /> : undefined}
        isDisabled={Boolean(operation.disabledReason)}
        isLoading={isPending}
        tooltip={operation.disabledReason}
        onClick={handleClick}
      />
      <OperationConfirmDialog
        operation={operation}
        isOpen={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
      />
    </>
  );
}

function OperationSubmitButton({
  operation,
  icon,
}: {
  operation: OperationBinding;
  icon?: IconType;
}) {
  const { controller } = useOperationExecution();
  const isPending = controller.isPending(operation);
  const IconComponent = icon;

  return (
    <Button
      type="submit"
      label={operation.label}
      variant={operation.variant}
      icon={IconComponent ? <Icon icon={IconComponent} color="inherit" size="sm" /> : undefined}
      isDisabled={Boolean(operation.disabledReason)}
      isLoading={isPending}
      tooltip={operation.disabledReason}
    />
  );
}

function OperationMenu({ operations }: { operations: OperationBinding[] }) {
  const [confirmationOperation, setConfirmationOperation] = useState<OperationBinding | null>(null);

  return (
    <div {...stylex.props(styles.menuWrap)}>
      <DropdownMenu
        button={{
          label: "More actions",
          tooltip: "More actions",
          variant: "secondary",
          size: "md",
          icon: <Icon icon={EllipsisHorizontalIcon} color="inherit" size="sm" />,
        }}
        menuWidth={252}
        placement="below"
      >
        {operations.map((operation, index) => (
          <OperationMenuItem
            key={operation.id}
            operation={operation}
            hasDividerBefore={index === operations.length - 1}
            onConfirm={setConfirmationOperation}
          />
        ))}
      </DropdownMenu>
      {confirmationOperation ? (
        <OperationConfirmDialog
          operation={confirmationOperation}
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setConfirmationOperation(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function OperationMenuItem({
  operation,
  hasDividerBefore,
  onConfirm,
}: {
  operation: OperationBinding;
  hasDividerBefore?: boolean;
  onConfirm: (operation: OperationBinding) => void;
}) {
  const { controller } = useOperationExecution();
  const isPending = controller.isPending(operation);

  const handleClick = useCallback(() => {
    if (operation.disabledReason || isPending) {
      return;
    }

    if (operation.confirmation) {
      onConfirm(operation);
      return;
    }

    void controller.execute(operation, { source: "menuItem" });
  }, [controller, isPending, onConfirm, operation]);

  return (
    <>
      {hasDividerBefore ? <div {...stylex.props(styles.divider)} /> : null}
      <DropdownMenuItem
        label={operation.label}
        description={operation.disabledReason}
        icon={resolveOperationIcon(operation)}
        endContent={
          isPending ? (
            <Text type="supporting" color="secondary">
              Running
            </Text>
          ) : undefined
        }
        isDisabled={Boolean(operation.disabledReason || isPending)}
        onClick={handleClick}
      />
    </>
  );
}

function OperationConfirmDialog({
  operation,
  isOpen,
  onOpenChange,
}: {
  operation: OperationBinding;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const { controller } = useOperationExecution();
  const isPending = controller.isPending(operation);
  const confirmation = operation.confirmation;

  if (!confirmation) {
    return null;
  }

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={confirmation.title}
      description={confirmation.description}
      actionLabel={confirmation.actionLabel}
      actionVariant={operation.destructive ? "destructive" : operation.variant}
      isActionLoading={isPending}
      onAction={() => {
        void controller.execute(operation, { source: "confirmationDialog" }).then(() => {
          onOpenChange(false);
        });
      }}
    />
  );
}

function OperationExecutionProvider({ children }: { children: ReactNode }) {
  const showToast = useToast();
  const eventCounterRef = useRef(0);
  const operationRunCounterRef = useRef(0);
  const statesRef = useRef<Map<string, OperationExecutionState>>(new Map());
  const runningTokensRef = useRef<Map<string, number>>(new Map());
  const [states, setStates] = useState<Map<string, OperationExecutionState>>(() => new Map());

  const setExecutionState = useCallback((executionKey: string, state: OperationExecutionState) => {
    const nextStates = new Map(statesRef.current);
    nextStates.set(executionKey, state);
    statesRef.current = nextStates;
    setStates(nextStates);
  }, []);

  const createFeedbackEvent = useCallback(
    (
      operation: OperationBinding,
      phase: OperationFeedbackPhase,
      title: string,
      detail: string,
    ): OperationFeedbackEvent => {
      eventCounterRef.current += 1;

      return {
        id: `operation-event-${eventCounterRef.current}`,
        bindingId: operation.id,
        executionKey: operation.executionKey,
        canonicalOperationKey: operation.canonicalOperationKey,
        label: operation.label,
        phase,
        title,
        detail,
        createdAt: Date.now(),
      };
    },
    [],
  );

  const showOperationToast = useCallback(
    (event: OperationFeedbackEvent) => {
      showToast({
        uniqueID: `operation:${event.executionKey}`,
        collisionBehavior: "overwrite",
        body: <OperationToastBody event={event} />,
        type: event.phase === "error" ? "error" : "info",
        isAutoHide: event.phase !== "progress",
        autoHideDuration: event.phase === "error" ? 7000 : 4200,
      });
    },
    [showToast],
  );

  const execute = useCallback(
    async (
      operation: OperationBinding,
      input: OperationExecutionInput,
    ): Promise<OperationExecutionResult> => {
      if (operation.disabledReason) {
        const result: OperationExecutionResult = {
          type: "failed",
          title: operation.feedback?.failureTitle ?? `${operation.label} unavailable`,
          displayError: operation.disabledReason,
        };
        return result;
      }

      const currentState = statesRef.current.get(operation.executionKey);
      if (currentState?.status === "pending") {
        return {
          type: "replayed",
          title: `${operation.label} already running`,
          detail: "Another control is already running this operation.",
        };
      }

      operationRunCounterRef.current += 1;
      const runToken = operationRunCounterRef.current;
      const startedAt = Date.now();
      const executionKey = operation.executionKey;
      const plan = operationExecutionPlans[executionKey] ?? defaultOperationExecutionPlan;

      runningTokensRef.current.set(executionKey, runToken);
      setExecutionState(executionKey, {
        executionKey,
        status: "pending",
        startedAt,
      });

      window.setTimeout(() => {
        if (runningTokensRef.current.get(executionKey) !== runToken) {
          return;
        }

        showOperationToast(
          createFeedbackEvent(
            operation,
            "progress",
            operation.feedback?.progressTitle ?? `${operation.label} is taking longer than usual`,
            operation.feedback?.progressDetail ?? "You can keep working while this finishes.",
          ),
        );
      }, progressToastDelayMs);

      await wait(plan.outcome.delayMs ?? 600);

      const result = createOperationExecutionResult(operation, input, plan);
      setExecutionState(executionKey, {
        executionKey,
        status: result.type,
        result,
        startedAt,
        completedAt: Date.now(),
      });

      showOperationToast(
        createFeedbackEvent(
          operation,
          result.type === "failed" ? "error" : "success",
          result.title,
          result.type === "failed" ? result.displayError : result.detail,
        ),
      );

      if (runningTokensRef.current.get(executionKey) === runToken) {
        runningTokensRef.current.delete(executionKey);
      }

      return result;
    },
    [createFeedbackEvent, setExecutionState, showOperationToast],
  );

  const getState = useCallback(
    (operation: OperationBinding) =>
      states.get(operation.executionKey) ?? createIdleOperationState(operation.executionKey),
    [states],
  );

  const controller = useMemo<OperationExecutionController>(
    () => ({
      execute,
      getState,
      getResult: (operation) => getState(operation).result,
      isPending: (operation) => getState(operation).status === "pending",
    }),
    [execute, getState],
  );

  const contextValue = useMemo<OperationExecutionContextValue>(
    () => ({
      controller,
      states,
    }),
    [controller, states],
  );

  return <OperationExecutionContext value={contextValue}>{children}</OperationExecutionContext>;
}

function createOperationExecutionResult(
  operation: OperationBinding,
  input: OperationExecutionInput,
  plan: OperationMockExecutionPlan,
): OperationExecutionResult {
  if (plan.outcome.type === "failure") {
    return {
      type: "failed",
      title: operation.feedback?.failureTitle ?? `${operation.label} failed`,
      displayError: plan.outcome.displayError,
    };
  }

  if (plan.outcome.type === "replay") {
    return {
      type: "replayed",
      title: operation.feedback?.replayTitle ?? `${operation.label} already applied`,
      detail: operation.feedback?.replayDetail ?? "No duplicate changes made.",
    };
  }

  return {
    type: "committed",
    title: operation.feedback?.successTitle ?? `${operation.label} committed`,
    detail:
      operation.feedback?.successDetail ??
      describeCommittedOperationResult(operation, input, plan.outcome),
    affectedCount: plan.outcome.affectedCount,
    createdRecordIds: plan.outcome.createdRecordIds,
  };
}

function createIdleOperationState(executionKey: string): OperationExecutionState {
  return {
    executionKey,
    status: "idle",
  };
}

const defaultOperationExecutionPlan = {
  outcome: {
    type: "committed",
    delayMs: 600,
    affectedCount: 1,
  },
} satisfies OperationMockExecutionPlan;

function describeCommittedOperationResult(
  operation: OperationBinding,
  input: OperationExecutionInput,
  outcome: Extract<OperationMockOutcome, { type: "committed" }>,
) {
  const submittedName = input.values?.name?.trim();

  if (submittedName) {
    return `${submittedName} is ready.`;
  }

  if (outcome.affectedCount == null) {
    return "Done.";
  }

  const noun = outcome.affectedCount === 1 ? "record" : "records";
  const verbByKind: Record<OperationKind, string> = {
    bulk: "updated",
    create: "created",
    delete: "deleted",
    sync: "applied",
    transition: "updated",
    update: "updated",
  };

  return `${outcome.affectedCount} ${noun} ${verbByKind[operation.kind]}.`;
}

function OperationToastBody({ event }: { event: OperationFeedbackEvent }) {
  return (
    <div {...stylex.props(styles.toastBody)}>
      <OperationFeedbackMarker phase={event.phase} />
      <VStack gap={0.5}>
        <Text type="label" maxLines={1}>
          {event.title}
        </Text>
        <Text type="supporting" color="secondary" maxLines={2}>
          {event.detail}
        </Text>
      </VStack>
    </div>
  );
}

function OperationFeedbackMarker({ phase }: { phase: OperationFeedbackPhase }) {
  if (phase === "progress") {
    return <Spinner size="sm" shade="inherit" />;
  }

  const variantByPhase: Record<Exclude<OperationFeedbackPhase, "progress">, StatusDotVariant> = {
    success: "success",
    error: "error",
  };

  return <StatusDot variant={variantByPhase[phase]} label={phase} />;
}

function useOperationExecution() {
  const context = useContext(OperationExecutionContext);

  if (!context) {
    throw new Error("useOperationExecution must be used within OperationExecutionProvider.");
  }

  return context;
}

function createTaskMenuOperations(task: MockTask): OperationBinding[] {
  return [
    {
      id: `menu:${task.id}.edit`,
      executionKey: `record:${task.id}:edit`,
      canonicalOperationKey: "tasks.update",
      label: "Edit",
      scope: "record",
      kind: "update",
      variant: "secondary",
      feedback: {
        successTitle: `${task.title} updated`,
      },
    },
    {
      id: `menu:${task.id}.complete`,
      executionKey: `record:${task.id}:complete`,
      canonicalOperationKey: "tasks.complete",
      label: "Complete",
      scope: "record",
      kind: "transition",
      variant: "secondary",
      disabledReason: task.status === "Done" ? "Task is already complete." : undefined,
      feedback: {
        successTitle: `${task.title} completed`,
      },
    },
    {
      id: `menu:${task.id}.archive`,
      executionKey: `record:${task.id}:archive`,
      canonicalOperationKey: "tasks.archive",
      label: "Archive",
      scope: "record",
      kind: "transition",
      variant: "secondary",
      feedback: {
        successTitle: `${task.title} archived`,
      },
    },
    {
      id: `menu:${task.id}.delete`,
      executionKey: `record:${task.id}:delete`,
      canonicalOperationKey: "tasks.delete",
      label: "Delete",
      scope: "record",
      kind: "delete",
      variant: "destructive",
      destructive: true,
      confirmation: {
        title: "Delete task?",
        description: `${task.title} will be removed from this workspace.`,
        actionLabel: "Delete",
      },
      feedback: {
        successTitle: `${task.title} deleted`,
      },
    },
  ];
}

function resolveOperationIcon(operation: OperationBinding) {
  if (operation.disabledReason) {
    return <Icon icon={NoSymbolIcon} color="warning" size="sm" />;
  }

  if (operation.destructive) {
    return <Icon icon={TrashIcon} color="error" size="sm" />;
  }

  if (operation.kind === "transition") {
    return <Icon icon={CheckCircleIcon} color="success" size="sm" />;
  }

  if (operation.kind === "update") {
    return <Icon icon={PencilSquareIcon} color="secondary" size="sm" />;
  }

  return <Icon icon={ArchiveBoxArrowDownIcon} color="secondary" size="sm" />;
}

function formatOperationScope(scope: OperationScope) {
  const labelByScope: Record<OperationScope, string> = {
    collection: "Collection",
    form: "Form",
    record: "Record",
    workspace: "Workspace",
  };

  return labelByScope[scope];
}

function formatOperationKind(kind: OperationKind) {
  const labelByKind: Record<OperationKind, string> = {
    bulk: "bulk action",
    create: "create action",
    delete: "delete action",
    sync: "sync action",
    transition: "state change",
    update: "update action",
  };

  return labelByKind[kind];
}

function formatOperationProgressStepStatus(status: OperationProgressStep["status"]) {
  const labelByStatus: Record<OperationProgressStep["status"], string> = {
    pending: "Pending",
    running: "Running",
    succeeded: "Complete",
  };

  return labelByStatus[status];
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}
