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
type OperationKind =
  | "create"
  | "update"
  | "delete"
  | "transition"
  | "sync"
  | "bulk"
  | "ordering"
  | "tree";
type OperationVariant = ButtonVariant;
type OperationInvocationSource = "button" | "menuItem" | "submitButton" | "confirmationDialog";
type OperationExecutionStatus = "idle" | "pending" | "committed" | "replayed" | "failed";
type OperationProgressStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
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
  bindingId: string;
  executionKey: string;
  canonicalOperationKey: string;
  label: string;
  scope: OperationScope;
  kind: OperationKind;
  visualIntent: OperationVariant;
  disabledReason?: string;
  destructive?: boolean;
  confirmation?: OperationConfirmation;
  feedback?: OperationFeedbackCopy;
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
  title: string;
  detail?: string;
  updatedAt: number;
  steps: readonly OperationProgressStep[];
};

type OperationProgressFrame = {
  atMs: number;
  progress: Omit<OperationProgress, "updatedAt">;
};

type OperationProgressStep = {
  id: string;
  label: string;
  detail?: string;
  status: OperationProgressStepStatus;
};

type OperationExecutionInput = {
  source: OperationInvocationSource;
  values?: Record<string, string>;
  recordId?: string;
  orderingMove?: {
    direction: "before" | "after";
    relativeRecordId: string;
  };
  treeInput?: {
    parentRecordId?: string;
    placementId?: string;
    childVariant?: string;
  };
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
  progress?: OperationProgress;
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
  progress?: readonly OperationProgressFrame[];
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
    progress: [
      {
        atMs: 900,
        progress: {
          title: "Clearing completed tasks",
          detail: "You can keep working while this finishes.",
          steps: [
            { id: "find", label: "Find completed tasks", status: "succeeded" },
            { id: "clear", label: "Clear matching records", status: "running" },
            { id: "refresh", label: "Refresh task list", status: "pending" },
          ],
        },
      },
      {
        atMs: 2600,
        progress: {
          title: "Clearing completed tasks",
          detail: "Refreshing the collection.",
          steps: [
            { id: "find", label: "Find completed tasks", status: "succeeded" },
            { id: "clear", label: "Clear matching records", status: "succeeded" },
            { id: "refresh", label: "Refresh task list", status: "running" },
          ],
        },
      },
    ],
  },
  "workspace:push": {
    outcome: { type: "replay", delayMs: 2800 },
    progress: [
      {
        atMs: 0,
        progress: {
          title: "Pushing workspace",
          detail: "Preparing display-safe workspace changes.",
          steps: [
            { id: "collect", label: "Collect source changes", status: "running" },
            { id: "publish", label: "Publish package changes", status: "pending" },
            { id: "deploy", label: "Update deployment intent", status: "pending" },
          ],
        },
      },
      {
        atMs: 900,
        progress: {
          title: "Pushing workspace",
          detail: "Publishing package changes.",
          steps: [
            { id: "collect", label: "Collect source changes", status: "succeeded" },
            { id: "publish", label: "Publish package changes", status: "running" },
            { id: "deploy", label: "Update deployment intent", status: "pending" },
          ],
        },
      },
      {
        atMs: 1900,
        progress: {
          title: "Pushing workspace",
          detail: "Provider work stays inside push progress.",
          steps: [
            { id: "collect", label: "Collect source changes", status: "succeeded" },
            { id: "publish", label: "Publish package changes", status: "succeeded" },
            { id: "deploy", label: "Update deployment intent", status: "skipped" },
          ],
        },
      },
    ],
  },
  "workspace:fail": {
    outcome: {
      type: "failure",
      delayMs: 700,
      displayError: "The operation was rejected.",
    },
    progress: [
      {
        atMs: 0,
        progress: {
          title: "Running operation",
          detail: "Checking the operation request.",
          steps: [
            { id: "request", label: "Check request", status: "running" },
            { id: "commit", label: "Commit changes", status: "pending" },
          ],
        },
      },
      {
        atMs: 560,
        progress: {
          title: "Running operation",
          detail: "The operation could not commit.",
          steps: [
            { id: "request", label: "Check request", status: "succeeded" },
            { id: "commit", label: "Commit changes", status: "failed" },
          ],
        },
      },
    ],
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
  [`ordering:tasks:${mockTask.id}:before`]: {
    outcome: {
      type: "committed",
      delayMs: 520,
      affectedCount: 1,
    },
  },
  [`ordering:tasks:${mockTask.id}:after`]: {
    outcome: {
      type: "committed",
      delayMs: 520,
      affectedCount: 1,
    },
  },
  "tree:page-home:add-child": {
    outcome: {
      type: "committed",
      delayMs: 620,
      affectedCount: 2,
      createdRecordIds: ["block-callout", "placement-callout"],
    },
  },
  "tree:placement-hero:remove": {
    outcome: {
      type: "committed",
      delayMs: 580,
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
    bindingId: "button:tasks.create",
    executionKey: "collection:tasks.create",
    canonicalOperationKey: "tasks.create",
    label: "New task",
    scope: "collection",
    kind: "create",
    visualIntent: "primary",
    feedback: {
      successTitle: "Task created",
    },
  },
  clearCompleted: {
    bindingId: "button:tasks.clearCompleted",
    executionKey: "collection:tasks.clearCompleted",
    canonicalOperationKey: "tasks.clearCompleted",
    label: "Clear completed",
    scope: "collection",
    kind: "bulk",
    visualIntent: "secondary",
    feedback: {
      progressTitle: "Clearing completed tasks",
      progressDetail: "You can keep working while this finishes.",
      successTitle: "Completed tasks cleared",
    },
  },
  pushWorkspace: {
    bindingId: "button:workspace.push",
    executionKey: "workspace:push",
    canonicalOperationKey: "workspace.push",
    label: "Push workspace",
    scope: "workspace",
    kind: "sync",
    visualIntent: "secondary",
    feedback: {
      replayTitle: "Workspace push already applied",
      replayDetail: "No duplicate changes made.",
    },
  },
  failingOperation: {
    bindingId: "button:workspace.fail",
    executionKey: "workspace:fail",
    canonicalOperationKey: "workspace.fail",
    label: "Failing operation",
    scope: "workspace",
    kind: "sync",
    visualIntent: "secondary",
    feedback: {
      failureTitle: "Failing operation failed",
    },
  },
  disabledTransfer: {
    bindingId: `button:${mockTask.id}.transferOwner`,
    executionKey: `record:${mockTask.id}:transferOwner`,
    canonicalOperationKey: "tasks.transferOwner",
    label: "Transfer owner",
    scope: "record",
    kind: "update",
    visualIntent: "secondary",
    disabledReason: "Requires owner role.",
  },
  deleteTask: {
    bindingId: `button:${mockTask.id}.delete`,
    executionKey: `record:${mockTask.id}:delete`,
    canonicalOperationKey: "tasks.delete",
    label: "Delete task",
    scope: "record",
    kind: "delete",
    visualIntent: "destructive",
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
  compactStack: {
    display: "grid",
    gap: spacingVars["--spacing-2"],
    minWidth: "min(100%, 280px)",
  },
  compactStatus: {
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: "8px",
    paddingBlock: spacingVars["--spacing-2"],
    paddingInline: spacingVars["--spacing-3"],
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
    minHeight: 44,
    backgroundColor: colorVars["--color-background-muted"],
  },
  compactStatusError: {
    borderColor: colorVars["--color-error"],
    backgroundColor: colorVars["--color-error-muted"],
  },
  tableSurface: {
    width: "100%",
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: "8px",
    overflow: "hidden",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(72px, 0.6fr) auto",
    alignItems: "center",
    gap: spacingVars["--spacing-2"],
    paddingBlock: spacingVars["--spacing-2"],
    paddingInline: spacingVars["--spacing-3"],
    "@media (max-width: 720px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      alignItems: "stretch",
    },
  },
  rowActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: spacingVars["--spacing-1"],
    "@media (max-width: 720px)": {
      justifyContent: "flex-start",
    },
  },
  treeNode: {
    width: "100%",
    borderWidth: borderVars["--border-width"],
    borderStyle: "solid",
    borderColor: colorVars["--color-border"],
    borderRadius: "8px",
    paddingBlock: spacingVars["--spacing-3"],
    paddingInline: spacingVars["--spacing-3"],
    display: "grid",
    gap: spacingVars["--spacing-3"],
    backgroundColor: colorVars["--color-background-muted"],
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
  const taskMenuOperations = createTaskMenuOperations(mockTask);

  return (
    <div {...stylex.props(styles.caseGrid)}>
      <OperationCaseCard
        title="Collection toolbar"
        operations={[operationExamples.createTask, operationExamples.clearCompleted]}
        control={
          <>
            <OperationButton operation={operationExamples.createTask} icon={PlusIcon} />
            <OperationButton
              operation={operationExamples.clearCompleted}
              icon={ArchiveBoxXMarkIcon}
            />
          </>
        }
      />
      <OperationCaseCard
        title="Workspace push compact status"
        operation={operationExamples.pushWorkspace}
        control={
          <div {...stylex.props(styles.compactStack)}>
            <OperationButton operation={operationExamples.pushWorkspace} icon={CloudArrowUpIcon} />
            <OperationCompactStatus operation={operationExamples.pushWorkspace} />
          </div>
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
        operations={taskMenuOperations}
        control={<OperationMenu operations={taskMenuOperations} />}
      />
      <OperationTableRowCase />
      <OperationOrderingCase />
      <OperationTreeCase />
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
      bindingId: "submit:crm.contacts.create",
      executionKey: "form:crm.contacts.create",
      canonicalOperationKey: "crm.contacts.create",
      label: "Create contact",
      scope: "form",
      kind: "create",
      visualIntent: "primary",
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

function OperationTableRowCase() {
  const operations = createTableRowOperations(mockTask);
  const [editOperation, completeOperation, deleteOperation] = operations;

  return (
    <OperationCaseCard
      title="Table row control"
      operations={operations}
      control={
        <div role="table" aria-label="Task table" {...stylex.props(styles.tableSurface)}>
          <div role="row" {...stylex.props(styles.tableRow)}>
            <VStack gap={0.5}>
              <Text type="label" maxLines={1}>
                {mockTask.title}
              </Text>
              <Text type="supporting" color="secondary" maxLines={1}>
                {mockTask.owner}
              </Text>
            </VStack>
            <Text type="supporting" color="secondary">
              {mockTask.status}
            </Text>
            <div {...stylex.props(styles.rowActions)}>
              <OperationButton
                operation={editOperation}
                icon={PencilSquareIcon}
                input={{ recordId: mockTask.id }}
              />
              <OperationButton
                operation={completeOperation}
                icon={CheckCircleIcon}
                input={{ recordId: mockTask.id }}
              />
              <OperationButton
                operation={deleteOperation}
                icon={TrashIcon}
                input={{ recordId: mockTask.id }}
              />
            </div>
          </div>
        </div>
      }
    />
  );
}

function OperationOrderingCase() {
  const operations = createOrderingOperations(mockTask);
  const [moveBeforeOperation, moveAfterOperation] = operations;

  return (
    <OperationCaseCard
      title="Ordering move"
      operations={operations}
      control={
        <>
          <OperationButton
            operation={moveBeforeOperation}
            icon={ArchiveBoxArrowDownIcon}
            input={{
              recordId: mockTask.id,
              orderingMove: {
                direction: "before",
                relativeRecordId: "task-prep",
              },
            }}
          />
          <OperationButton
            operation={moveAfterOperation}
            icon={ArchiveBoxArrowDownIcon}
            input={{
              recordId: mockTask.id,
              orderingMove: {
                direction: "after",
                relativeRecordId: "task-review",
              },
            }}
          />
        </>
      }
    />
  );
}

function OperationTreeCase() {
  const operations = createTreeOperations();
  const [addChildOperation, removePlacementOperation] = operations;

  return (
    <OperationCaseCard
      title="Tree add and remove"
      operations={operations}
      control={
        <div {...stylex.props(styles.treeNode)}>
          <VStack gap={0.5}>
            <Text type="label">Home page</Text>
            <Text type="supporting" color="secondary">
              Hero placement
            </Text>
          </VStack>
          <div {...stylex.props(styles.rowActions)}>
            <OperationButton
              operation={addChildOperation}
              icon={PlusIcon}
              input={{
                treeInput: {
                  parentRecordId: "page-home",
                  childVariant: "callout",
                },
              }}
            />
            <OperationButton
              operation={removePlacementOperation}
              icon={TrashIcon}
              input={{
                treeInput: {
                  placementId: "placement-hero",
                },
              }}
            />
          </div>
        </div>
      }
    />
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
  const pendingProgress = operations
    .map((operation) => ({
      operation,
      state: controller.getState(operation),
    }))
    .find(({ state }) => state.status === "pending" && state.progress?.steps.length);

  if (!pendingProgress?.state.progress) {
    return null;
  }

  const activeStep = selectActiveOperationProgressStep(pendingProgress.state.progress);

  return (
    <div role="status" {...stylex.props(styles.feedbackPanel, styles.feedbackProgress)}>
      <div {...stylex.props(styles.feedbackHeader)}>
        <Spinner size="sm" shade="inherit" />
        <VStack gap={0.5}>
          <Text type="label">{pendingProgress.state.progress.title}</Text>
          <Text type="supporting" color="secondary">
            {activeStep?.detail ?? pendingProgress.state.progress.detail ?? "Running"}
          </Text>
        </VStack>
      </div>
      <div {...stylex.props(styles.progressSteps)}>
        {pendingProgress.state.progress.steps.map((step) => (
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

function OperationCompactStatus({ operation }: { operation: OperationBinding }) {
  const { controller } = useOperationExecution();
  const state = controller.getState(operation);
  const progressStep = state.progress
    ? selectActiveOperationProgressStep(state.progress)
    : undefined;
  const statusText = compactOperationStatusText(operation, state, progressStep);
  const statusStyleProps =
    state.status === "failed"
      ? stylex.props(styles.compactStatus, styles.compactStatusError)
      : stylex.props(styles.compactStatus);

  return (
    <div role={state.status === "failed" ? "alert" : "status"} {...statusStyleProps}>
      <OperationCompactStatusMarker state={state} />
      <VStack gap={0.5}>
        <Text type="label" maxLines={1}>
          {statusText.title}
        </Text>
        <Text type="supporting" color="secondary" maxLines={2}>
          {statusText.detail}
        </Text>
      </VStack>
    </div>
  );
}

function OperationCompactStatusMarker({ state }: { state: OperationExecutionState }) {
  if (state.status === "pending") {
    return <Spinner size="sm" shade="inherit" />;
  }

  if (state.status === "failed") {
    return <Icon icon={ExclamationTriangleIcon} color="error" size="sm" />;
  }

  return (
    <StatusDot
      variant={state.status === "committed" ? "success" : "neutral"}
      label={formatOperationExecutionStatus(state.status)}
    />
  );
}

function OperationProgressStepMarker({ status }: { status: OperationProgressStep["status"] }) {
  if (status === "running") {
    return <Spinner size="sm" shade="inherit" />;
  }

  if (status === "failed") {
    return <Icon icon={ExclamationTriangleIcon} color="error" size="sm" />;
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

function OperationButton({
  operation,
  icon,
  input,
}: {
  operation: OperationBinding;
  icon?: IconType;
  input?: Omit<OperationExecutionInput, "source">;
}) {
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

    void controller.execute(operation, { source: "button", ...input });
  }, [controller, input, isPending, operation]);

  return (
    <>
      <Button
        label={operation.label}
        variant={operation.visualIntent}
        icon={IconComponent ? <Icon icon={IconComponent} color="inherit" size="sm" /> : undefined}
        isDisabled={Boolean(operation.disabledReason)}
        isLoading={isPending}
        tooltip={operation.disabledReason}
        onClick={handleClick}
      />
      <OperationConfirmDialog
        operation={operation}
        input={input}
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
      variant={operation.visualIntent}
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
            key={operation.bindingId}
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
  input,
  isOpen,
  onOpenChange,
}: {
  operation: OperationBinding;
  input?: Omit<OperationExecutionInput, "source">;
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
      actionVariant={operation.destructive ? "destructive" : operation.visualIntent}
      isActionLoading={isPending}
      onAction={() => {
        void controller.execute(operation, { source: "confirmationDialog", ...input }).then(() => {
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
        bindingId: operation.bindingId,
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
      const immediateProgress = selectImmediateOperationProgress(plan);

      runningTokensRef.current.set(executionKey, runToken);
      setExecutionState(executionKey, {
        executionKey,
        status: "pending",
        ...(immediateProgress ? { progress: materializeOperationProgress(immediateProgress) } : {}),
        startedAt,
      });

      for (const progressFrame of plan.progress ?? []) {
        if (progressFrame.atMs <= 0) {
          continue;
        }

        window.setTimeout(() => {
          if (runningTokensRef.current.get(executionKey) !== runToken) {
            return;
          }

          const currentState = statesRef.current.get(executionKey);
          if (currentState?.status !== "pending") {
            return;
          }

          setExecutionState(executionKey, {
            ...currentState,
            progress: materializeOperationProgress(progressFrame),
          });
        }, progressFrame.atMs);
      }

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
      const completedProgress = statesRef.current.get(executionKey)?.progress;
      setExecutionState(executionKey, {
        executionKey,
        status: result.type,
        result,
        ...(completedProgress ? { progress: completedProgress } : {}),
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

function selectImmediateOperationProgress(
  plan: OperationMockExecutionPlan,
): OperationProgressFrame | undefined {
  let immediateProgress: OperationProgressFrame | undefined;

  for (const progressFrame of plan.progress ?? []) {
    if (progressFrame.atMs <= 0) {
      immediateProgress = progressFrame;
    }
  }

  return immediateProgress;
}

function materializeOperationProgress(frame: OperationProgressFrame): OperationProgress {
  return {
    ...frame.progress,
    updatedAt: Date.now(),
  };
}

function selectActiveOperationProgressStep(
  progress: OperationProgress,
): OperationProgressStep | undefined {
  return (
    progress.steps.find((step) => step.status === "running") ??
    progress.steps.find((step) => step.status === "failed") ??
    progress.steps.find((step) => step.status === "pending") ??
    progress.steps.find((step) => step.status === "skipped") ??
    progress.steps[progress.steps.length - 1]
  );
}

function compactOperationStatusText(
  operation: OperationBinding,
  state: OperationExecutionState,
  progressStep: OperationProgressStep | undefined,
) {
  if (state.status === "pending") {
    return {
      title: state.progress?.title ?? `${operation.label} running`,
      detail: progressStep?.label ?? state.progress?.detail ?? "Pending",
    };
  }

  if (state.result?.type === "failed") {
    return {
      title: state.result.title,
      detail: state.result.displayError,
    };
  }

  if (state.result) {
    return {
      title: state.result.title,
      detail: state.result.detail,
    };
  }

  return {
    title: operation.label,
    detail: "Ready",
  };
}

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
    ordering: "moved",
    sync: "applied",
    transition: "updated",
    tree: "updated",
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
      bindingId: `menu:${task.id}.edit`,
      executionKey: `record:${task.id}:edit`,
      canonicalOperationKey: "tasks.update",
      label: "Edit",
      scope: "record",
      kind: "update",
      visualIntent: "secondary",
      feedback: {
        successTitle: `${task.title} updated`,
      },
    },
    {
      bindingId: `menu:${task.id}.complete`,
      executionKey: `record:${task.id}:complete`,
      canonicalOperationKey: "tasks.complete",
      label: "Complete",
      scope: "record",
      kind: "transition",
      visualIntent: "secondary",
      disabledReason: task.status === "Done" ? "Task is already complete." : undefined,
      feedback: {
        successTitle: `${task.title} completed`,
      },
    },
    {
      bindingId: `menu:${task.id}.archive`,
      executionKey: `record:${task.id}:archive`,
      canonicalOperationKey: "tasks.archive",
      label: "Archive",
      scope: "record",
      kind: "transition",
      visualIntent: "secondary",
      feedback: {
        successTitle: `${task.title} archived`,
      },
    },
    {
      bindingId: `menu:${task.id}.delete`,
      executionKey: `record:${task.id}:delete`,
      canonicalOperationKey: "tasks.delete",
      label: "Delete",
      scope: "record",
      kind: "delete",
      visualIntent: "destructive",
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

function createTableRowOperations(task: MockTask): OperationBinding[] {
  return [
    {
      bindingId: `table:${task.id}.edit`,
      executionKey: `record:${task.id}:edit`,
      canonicalOperationKey: "tasks.update",
      label: "Edit",
      scope: "record",
      kind: "update",
      visualIntent: "secondary",
      feedback: {
        successTitle: `${task.title} updated`,
      },
    },
    {
      bindingId: `table:${task.id}.complete`,
      executionKey: `record:${task.id}:complete`,
      canonicalOperationKey: "tasks.complete",
      label: "Complete",
      scope: "record",
      kind: "transition",
      visualIntent: "secondary",
      feedback: {
        successTitle: `${task.title} completed`,
      },
    },
    {
      bindingId: `table:${task.id}.delete`,
      executionKey: `record:${task.id}:delete`,
      canonicalOperationKey: "tasks.delete",
      label: "Delete",
      scope: "record",
      kind: "delete",
      visualIntent: "destructive",
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

function createOrderingOperations(task: MockTask): OperationBinding[] {
  return [
    {
      bindingId: `ordering:${task.id}.before`,
      executionKey: `ordering:tasks:${task.id}:before`,
      canonicalOperationKey: "tasks.updateOrder",
      label: "Move before",
      scope: "record",
      kind: "ordering",
      visualIntent: "secondary",
      feedback: {
        successTitle: `${task.title} moved`,
      },
    },
    {
      bindingId: `ordering:${task.id}.after`,
      executionKey: `ordering:tasks:${task.id}:after`,
      canonicalOperationKey: "tasks.updateOrder",
      label: "Move after",
      scope: "record",
      kind: "ordering",
      visualIntent: "secondary",
      feedback: {
        successTitle: `${task.title} moved`,
      },
    },
  ];
}

function createTreeOperations(): OperationBinding[] {
  return [
    {
      bindingId: "tree:page-home.add-child",
      executionKey: "tree:page-home:add-child",
      canonicalOperationKey: "site.createTreeChild",
      label: "Add child",
      scope: "record",
      kind: "tree",
      visualIntent: "secondary",
      feedback: {
        successTitle: "Child block added",
      },
    },
    {
      bindingId: "tree:placement-hero.remove",
      executionKey: "tree:placement-hero:remove",
      canonicalOperationKey: "site.removeTreePlacement",
      label: "Remove placement",
      scope: "record",
      kind: "tree",
      visualIntent: "destructive",
      destructive: true,
      confirmation: {
        title: "Remove placement?",
        description: "The child block stays available outside this parent.",
        actionLabel: "Remove",
      },
      feedback: {
        successTitle: "Placement removed",
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
    ordering: "ordering move",
    sync: "sync action",
    transition: "state change",
    tree: "tree action",
    update: "update action",
  };

  return labelByKind[kind];
}

function formatOperationExecutionStatus(status: OperationExecutionStatus) {
  const labelByStatus: Record<OperationExecutionStatus, string> = {
    committed: "Committed",
    failed: "Failed",
    idle: "Idle",
    pending: "Pending",
    replayed: "Already applied",
  };

  return labelByStatus[status];
}

function formatOperationProgressStepStatus(status: OperationProgressStep["status"]) {
  const labelByStatus: Record<OperationProgressStep["status"], string> = {
    failed: "Failed",
    pending: "Pending",
    running: "Running",
    skipped: "Skipped",
    succeeded: "Complete",
  };

  return labelByStatus[status];
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}
