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
import {
  borderVars,
  colorVars,
  spacingVars,
} from "@astryxdesign/core/theme/tokens.stylex";
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
type OperationOutcome =
  | {
      type: "success";
      delayMs?: number;
    }
  | {
      type: "replay";
      delayMs?: number;
      replayCopy?: string;
      replayDetail?: string;
    }
  | {
      type: "failure";
      delayMs?: number;
      errorCopy: string;
    };

type OperationDefinition = {
  id: string;
  canonicalKey: string;
  label: string;
  scope: OperationScope;
  kind: OperationKind;
  variant: OperationVariant;
  disabledReason?: string;
  destructive?: boolean;
  confirmation?: OperationConfirmation;
  successCopy?: string;
  affectedCount?: number;
  progress?: OperationProgress;
  outcome: OperationOutcome;
};

type OperationConfirmation = {
  title: string;
  description: string;
  actionLabel: string;
};

type OperationProgress = {
  delayedTitle?: string;
  delayedDetail?: string;
  steps?: readonly OperationProgressStep[];
};

type OperationProgressStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "succeeded";
};

type OperationFeedbackPhase = "progress" | "success" | "error";

type OperationFeedbackEvent = {
  id: string;
  operationId: string;
  label: string;
  phase: OperationFeedbackPhase;
  title: string;
  detail: string;
  createdAt: number;
};

type OperationExecutionContextValue = {
  pendingIds: ReadonlySet<string>;
  failures: ReadonlyMap<string, OperationFeedbackEvent>;
  runOperation: (operation: OperationDefinition) => Promise<void>;
  getOperationFailure: (operationId: string) => OperationFeedbackEvent | undefined;
  isOperationPending: (operationId: string) => boolean;
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

const operationExamples = {
  createTask: {
    id: "case:tasks.create",
    canonicalKey: "tasks.create",
    label: "New task",
    scope: "collection",
    kind: "create",
    variant: "primary",
    successCopy: "Task created",
    affectedCount: 1,
    outcome: { type: "success", delayMs: 520 },
  },
  clearCompleted: {
    id: "case:tasks.clearCompleted",
    canonicalKey: "tasks.clearCompleted",
    label: "Clear completed",
    scope: "collection",
    kind: "bulk",
    variant: "secondary",
    successCopy: "Completed tasks cleared",
    affectedCount: 2,
    progress: {
      delayedTitle: "Clearing completed tasks",
      delayedDetail: "You can keep working while this finishes.",
      steps: [
        { id: "find", label: "Find completed tasks", status: "succeeded" },
        { id: "clear", label: "Clear matching records", status: "running" },
        { id: "refresh", label: "Refresh task list", status: "pending" },
      ],
    },
    outcome: { type: "success", delayMs: 4200 },
  },
  pushWorkspace: {
    id: "case:workspace.push",
    canonicalKey: "workspace.push",
    label: "Push workspace",
    scope: "workspace",
    kind: "sync",
    variant: "secondary",
    successCopy: "Workspace push committed",
    affectedCount: 8,
    outcome: {
      type: "replay",
      delayMs: 760,
      replayCopy: "Workspace push already applied",
      replayDetail: "No duplicate changes made.",
    },
  },
  failingOperation: {
    id: "case:workspace.fail",
    canonicalKey: "workspace.fail",
    label: "Failing operation",
    scope: "workspace",
    kind: "sync",
    variant: "secondary",
    outcome: {
      type: "failure",
      delayMs: 700,
      errorCopy: "The operation was rejected.",
    },
  },
  disabledTransfer: {
    id: `case:${mockTask.id}.transferOwner`,
    canonicalKey: "tasks.transferOwner",
    label: "Transfer owner",
    scope: "record",
    kind: "update",
    variant: "secondary",
    disabledReason: "Requires owner role.",
    outcome: { type: "success", delayMs: 600 },
  },
  deleteTask: {
    id: `case:${mockTask.id}.delete`,
    canonicalKey: "tasks.delete",
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
    successCopy: "Task deleted",
    affectedCount: 1,
    outcome: { type: "success", delayMs: 850 },
  },
} satisfies Record<string, OperationDefinition>;

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
  operation?: OperationDefinition;
  operations?: OperationDefinition[];
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
        <OperationFailureAlert operations={metadataOperations} />
        <OperationReasonLine operations={metadataOperations} />
      </VStack>
    </Card>
  );
}

function OperationSubmitCase() {
  const [name, setName] = useState(mockContact.name);
  const [company, setCompany] = useState(mockContact.company);
  const { runOperation } = useOperationExecution();
  const createContactOperation = useMemo<OperationDefinition>(
    () => ({
      id: "case:crm.contacts.create",
      canonicalKey: "crm.contacts.create",
      label: "Create contact",
      scope: "form",
      kind: "create",
      variant: "primary",
      disabledReason: name.trim().length === 0 ? "Enter a contact name." : undefined,
      successCopy: `${name.trim() || "Contact"} created`,
      affectedCount: 1,
      outcome: { type: "success", delayMs: 720 },
    }),
    [name],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (createContactOperation.disabledReason) {
        return;
      }
      void runOperation(createContactOperation);
    },
    [createContactOperation, runOperation],
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
          <OperationFailureAlert operations={[createContactOperation]} />
          <OperationReasonLine operations={[createContactOperation]} />
        </VStack>
      </form>
    </Card>
  );
}

function OperationMetadata({ operations }: { operations: OperationDefinition[] }) {
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

function OperationReasonLine({ operations }: { operations: OperationDefinition[] }) {
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

function OperationProgressPanel({ operations }: { operations: OperationDefinition[] }) {
  const { isOperationPending } = useOperationExecution();
  const pendingOperation = operations.find(
    (operation) => isOperationPending(operation.id) && operation.progress?.steps?.length,
  );

  if (!pendingOperation?.progress?.steps?.length) {
    return null;
  }

  return (
    <div
      role="status"
      {...stylex.props(styles.feedbackPanel, styles.feedbackProgress)}
    >
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

function OperationFailureAlert({ operations }: { operations: OperationDefinition[] }) {
  const { getOperationFailure } = useOperationExecution();
  const failure = operations
    .map((operation) => getOperationFailure(operation.id))
    .find((event): event is OperationFeedbackEvent => event !== undefined);

  if (!failure) {
    return null;
  }

  return (
    <div
      role="alert"
      {...stylex.props(styles.feedbackPanel, styles.feedbackError)}
    >
      <div {...stylex.props(styles.feedbackHeader)}>
        <Icon icon={ExclamationTriangleIcon} color="error" size="sm" />
        <VStack gap={0.5}>
          <Text type="label">{failure.title}</Text>
          <Text type="supporting" color="secondary">
            {failure.detail}
          </Text>
        </VStack>
      </div>
    </div>
  );
}

function OperationButton({
  operation,
  icon,
}: {
  operation: OperationDefinition;
  icon?: IconType;
}) {
  const { isOperationPending, runOperation } = useOperationExecution();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const isPending = isOperationPending(operation.id);
  const IconComponent = icon;

  const handleClick = useCallback(() => {
    if (operation.disabledReason || isPending) {
      return;
    }

    if (operation.confirmation) {
      setIsConfirmOpen(true);
      return;
    }

    void runOperation(operation);
  }, [isPending, operation, runOperation]);

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
  operation: OperationDefinition;
  icon?: IconType;
}) {
  const { isOperationPending } = useOperationExecution();
  const isPending = isOperationPending(operation.id);
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

function OperationMenu({ operations }: { operations: OperationDefinition[] }) {
  const [confirmationOperation, setConfirmationOperation] = useState<OperationDefinition | null>(null);

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
  operation: OperationDefinition;
  hasDividerBefore?: boolean;
  onConfirm: (operation: OperationDefinition) => void;
}) {
  const { isOperationPending, runOperation } = useOperationExecution();
  const isPending = isOperationPending(operation.id);

  const handleClick = useCallback(() => {
    if (operation.disabledReason || isPending) {
      return;
    }

    if (operation.confirmation) {
      onConfirm(operation);
      return;
    }

    void runOperation(operation);
  }, [isPending, onConfirm, operation, runOperation]);

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
  operation: OperationDefinition;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const { isOperationPending, runOperation } = useOperationExecution();
  const isPending = isOperationPending(operation.id);
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
        void runOperation(operation).then(() => onOpenChange(false));
      }}
    />
  );
}

function OperationExecutionProvider({ children }: { children: ReactNode }) {
  const showToast = useToast();
  const eventCounterRef = useRef(0);
  const operationRunCounterRef = useRef(0);
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const failuresRef = useRef<Map<string, OperationFeedbackEvent>>(new Map());
  const runningTokensRef = useRef<Map<string, number>>(new Map());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [failures, setFailures] = useState<Map<string, OperationFeedbackEvent>>(() => new Map());

  const setOperationPending = useCallback((operationId: string, isPending: boolean) => {
    const nextPendingIds = new Set(pendingIdsRef.current);

    if (isPending) {
      nextPendingIds.add(operationId);
    } else {
      nextPendingIds.delete(operationId);
    }

    pendingIdsRef.current = nextPendingIds;
    setPendingIds(nextPendingIds);
  }, []);

  const setOperationFailure = useCallback(
    (operationId: string, failure: OperationFeedbackEvent | null) => {
      const nextFailures = new Map(failuresRef.current);

      if (failure) {
        nextFailures.set(operationId, failure);
      } else {
        nextFailures.delete(operationId);
      }

      failuresRef.current = nextFailures;
      setFailures(nextFailures);
    },
    [],
  );

  const createFeedbackEvent = useCallback(
    (
      operation: OperationDefinition,
      phase: OperationFeedbackPhase,
      title: string,
      detail: string,
    ): OperationFeedbackEvent => {
      eventCounterRef.current += 1;

      return {
        id: `operation-event-${eventCounterRef.current}`,
        operationId: operation.id,
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
        uniqueID: `operation:${event.operationId}`,
        collisionBehavior: "overwrite",
        body: <OperationToastBody event={event} />,
        type: event.phase === "error" ? "error" : "info",
        isAutoHide: event.phase !== "progress",
        autoHideDuration: event.phase === "error" ? 7000 : 4200,
      });
    },
    [showToast],
  );

  const runOperation = useCallback(
    async (operation: OperationDefinition) => {
      if (operation.disabledReason) {
        return;
      }

      if (pendingIdsRef.current.has(operation.id)) {
        return;
      }

      operationRunCounterRef.current += 1;
      const runToken = operationRunCounterRef.current;
      runningTokensRef.current.set(operation.id, runToken);
      setOperationFailure(operation.id, null);
      setOperationPending(operation.id, true);

      window.setTimeout(() => {
        if (runningTokensRef.current.get(operation.id) !== runToken) {
          return;
        }

        showOperationToast(
          createFeedbackEvent(
            operation,
            "progress",
            operation.progress?.delayedTitle ?? `${operation.label} is taking longer than usual`,
            operation.progress?.delayedDetail ?? "You can keep working while this finishes.",
          ),
        );
      }, progressToastDelayMs);

      try {
        await wait(operation.outcome.delayMs ?? 600);

        if (operation.outcome.type === "failure") {
          throw new Error(operation.outcome.errorCopy);
        }

        if (operation.outcome.type === "replay") {
          showOperationToast(
            createFeedbackEvent(
              operation,
              "success",
              operation.outcome.replayCopy ?? `${operation.label} already applied`,
              operation.outcome.replayDetail ?? "No duplicate changes made.",
            ),
          );
          return;
        }

        showOperationToast(
          createFeedbackEvent(
            operation,
            "success",
            operation.successCopy ?? `${operation.label} committed`,
            describeOperationResult(operation),
          ),
        );
      } catch (error) {
        setOperationFailure(
          operation.id,
          createFeedbackEvent(
            operation,
            "error",
            `${operation.label} failed`,
            error instanceof Error ? error.message : "Operation failed.",
          ),
        );
      } finally {
        if (runningTokensRef.current.get(operation.id) === runToken) {
          runningTokensRef.current.delete(operation.id);
        }
        setOperationPending(operation.id, false);
      }
    },
    [createFeedbackEvent, setOperationFailure, setOperationPending, showOperationToast],
  );

  const isOperationPending = useCallback(
    (operationId: string) => pendingIds.has(operationId),
    [pendingIds],
  );

  const getOperationFailure = useCallback(
    (operationId: string) => failures.get(operationId),
    [failures],
  );

  const contextValue = useMemo<OperationExecutionContextValue>(
    () => ({
      failures,
      getOperationFailure,
      pendingIds,
      runOperation,
      isOperationPending,
    }),
    [failures, getOperationFailure, isOperationPending, pendingIds, runOperation],
  );

  return <OperationExecutionContext value={contextValue}>{children}</OperationExecutionContext>;
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

function createTaskMenuOperations(task: MockTask): OperationDefinition[] {
  return [
    {
      id: `menu:${task.id}.edit`,
      canonicalKey: "tasks.update",
      label: "Edit",
      scope: "record",
      kind: "update",
      variant: "secondary",
      successCopy: `${task.title} updated`,
      affectedCount: 1,
      outcome: { type: "success", delayMs: 520 },
    },
    {
      id: `menu:${task.id}.complete`,
      canonicalKey: "tasks.complete",
      label: "Complete",
      scope: "record",
      kind: "transition",
      variant: "secondary",
      disabledReason: task.status === "Done" ? "Task is already complete." : undefined,
      successCopy: `${task.title} completed`,
      affectedCount: 1,
      outcome: { type: "success", delayMs: 660 },
    },
    {
      id: `menu:${task.id}.archive`,
      canonicalKey: "tasks.archive",
      label: "Archive",
      scope: "record",
      kind: "transition",
      variant: "secondary",
      successCopy: `${task.title} archived`,
      affectedCount: 1,
      outcome: { type: "success", delayMs: 680 },
    },
    {
      id: `menu:${task.id}.delete`,
      canonicalKey: "tasks.delete",
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
      successCopy: `${task.title} deleted`,
      affectedCount: 1,
      outcome: { type: "success", delayMs: 850 },
    },
  ];
}

function resolveOperationIcon(operation: OperationDefinition) {
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

function describeOperationResult(operation: OperationDefinition) {
  if (operation.affectedCount == null) {
    return "Done.";
  }

  const noun = operation.affectedCount === 1 ? "record" : "records";
  const verbByKind: Record<OperationKind, string> = {
    bulk: "updated",
    create: "created",
    delete: "deleted",
    sync: "applied",
    transition: "updated",
    update: "updated",
  };

  return `${operation.affectedCount} ${noun} ${verbByKind[operation.kind]}.`;
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
