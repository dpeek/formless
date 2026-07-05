import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { PlusIcon } from "@heroicons/react/24/outline";

export function FormlessMainContent() {
  return (
    <VStack gap={5} width="100%">
      <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
        <VStack gap={1}>
          <Heading level={1}>Today</Heading>
          <Text type="body" as="p" color="secondary">
            Work due across active projects.
          </Text>
        </VStack>
        <Button
          label="New task"
          variant="primary"
          icon={<Icon icon={PlusIcon} color="inherit" size="sm" />}
        />
      </HStack>
      <Table<TaskRow>
        data={taskRows}
        columns={taskColumns}
        idKey="id"
        density="balanced"
        dividers="rows"
        hasHover
        textOverflow="truncate"
      />
    </VStack>
  );
}

type TaskRow = {
  id: string;
  task: string;
  project: string;
  due: string;
  status: "Open" | "Waiting" | "Done";
} & Record<string, unknown>;

const taskRows: TaskRow[] = [
  {
    id: "task-1",
    task: "Prepare launch checklist",
    project: "Website refresh",
    due: "9:30 AM",
    status: "Open",
  },
  {
    id: "task-2",
    task: "Review route changes",
    project: "Instance setup",
    due: "11:00 AM",
    status: "Waiting",
  },
  {
    id: "task-3",
    task: "Confirm customer import fields",
    project: "CRM rollout",
    due: "1:00 PM",
    status: "Open",
  },
  {
    id: "task-4",
    task: "Publish homepage edits",
    project: "Website refresh",
    due: "3:30 PM",
    status: "Done",
  },
  {
    id: "task-5",
    task: "Update automation owner",
    project: "Operations",
    due: "5:00 PM",
    status: "Open",
  },
];

const taskColumns: TableColumn<TaskRow>[] = [
  {
    key: "task",
    header: "Task",
    width: proportional(1, { minWidth: 160 }),
    renderCell: (task) => (
      <VStack gap={0.5}>
        <Text type="body" weight="medium" maxLines={1}>
          {task.task}
        </Text>
        <Text type="supporting" color="secondary" maxLines={1}>
          {task.project}
        </Text>
      </VStack>
    ),
  },
  {
    key: "due",
    header: "Due",
    width: pixel(88),
  },
  {
    key: "status",
    header: "Status",
    width: pixel(104),
    renderCell: (task) => <TaskStatusBadge status={task.status} />,
  },
];

function TaskStatusBadge({ status }: { status: TaskRow["status"] }) {
  if (status === "Done") {
    return <Badge label={status} variant="success" />;
  }

  if (status === "Waiting") {
    return <Badge label={status} variant="warning" />;
  }

  return <Badge label={status} variant="neutral" />;
}
