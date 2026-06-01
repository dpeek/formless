import type { PackageAppKey } from "../shared/app-installs.ts";
import type {
  PackageAppRevision,
  SourceSchemaHash,
  UpgradeMigrationChecksum,
  UpgradeMigrationId,
  UpgradeMigrationSafetyClass,
} from "../shared/upgrade-migrations.ts";

export type CliUpgradePlanStepType =
  | "archive-normalization"
  | "backup"
  | "browser-reload"
  | "code-deploy"
  | "manual-approval"
  | "package-app-migration"
  | "sql-migration";

export type CliUpgradePlanStepStatus = "blocked" | "pending" | "ready";

export type CliUpgradePlanTargetIdentity = {
  archivePath?: string;
  label?: string;
  storageIdentity?: string;
  targetId?: string;
  targetUrl?: string;
};

export type CliUpgradePlanPackageAppIdentity = {
  fromPackageRevision?: PackageAppRevision;
  installId?: string;
  packageAppKey: PackageAppKey;
  sourceSchemaHash?: SourceSchemaHash;
  toPackageRevision?: PackageAppRevision;
};

export type CliUpgradePlanEvidenceRequirement = {
  description: string;
  kind: string;
  reference?: string;
};

type CliUpgradePlanStepStatusFields =
  | {
      status: "blocked";
      statusReason: string;
    }
  | {
      status: "pending";
      statusReason: string;
    }
  | {
      status: "ready";
      statusReason?: never;
    };

type CliUpgradePlanStepBase = CliUpgradePlanStepStatusFields & {
  id: string;
  packageApp?: CliUpgradePlanPackageAppIdentity;
  requiredEvidence: readonly CliUpgradePlanEvidenceRequirement[];
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  target: CliUpgradePlanTargetIdentity;
  type: CliUpgradePlanStepType;
};

export type CliUpgradeCodeDeployStep = CliUpgradePlanStepBase & {
  fromPackageVersion?: string | null;
  fromRuntimeProtocolVersion?: number | null;
  fromStorageMigrationSet?: string | null;
  toPackageVersion: string;
  toRuntimeProtocolVersion?: number;
  toStorageMigrationSet?: string;
  type: "code-deploy";
};

export type CliUpgradeSqlMigrationStep = CliUpgradePlanStepBase & {
  checksum: UpgradeMigrationChecksum;
  migrationId: UpgradeMigrationId;
  owner?: string;
  storageFamily: string;
  type: "sql-migration";
};

export type CliUpgradePackageAppMigrationStep = CliUpgradePlanStepBase & {
  checksum: UpgradeMigrationChecksum;
  migrationId: UpgradeMigrationId;
  owner?: string;
  packageApp: CliUpgradePlanPackageAppIdentity & {
    fromPackageRevision: PackageAppRevision;
    toPackageRevision: PackageAppRevision;
  };
  type: "package-app-migration";
};

export type CliUpgradeBackupStep = CliUpgradePlanStepBase & {
  backupScope: "app" | "instance" | "storage-identity";
  backupTarget?: string;
  type: "backup";
};

export type CliUpgradeBrowserReloadStep = CliUpgradePlanStepBase & {
  fromRuntimeProtocolVersion?: number | null;
  reloadReason: string;
  toRuntimeProtocolVersion?: number;
  type: "browser-reload";
};

export type CliUpgradeManualApprovalStep = CliUpgradePlanStepBase & {
  approvalKey: string;
  approvalReason: string;
  type: "manual-approval";
};

export type CliUpgradeArchiveNormalizationStep = CliUpgradePlanStepBase & {
  archiveKind?: string | null;
  fromArchiveVersion?: number | string | null;
  normalizationStatus: "pending" | "unsupported";
  toArchiveVersion?: number | string | null;
  type: "archive-normalization";
};

export type CliUpgradePlanStep =
  | CliUpgradeArchiveNormalizationStep
  | CliUpgradeBackupStep
  | CliUpgradeBrowserReloadStep
  | CliUpgradeCodeDeployStep
  | CliUpgradeManualApprovalStep
  | CliUpgradePackageAppMigrationStep
  | CliUpgradeSqlMigrationStep;

export type CliUpgradePlan = {
  steps: readonly CliUpgradePlanStep[];
  target: CliUpgradePlanTargetIdentity;
};

export function formatCliUpgradePlan(plan: CliUpgradePlan): string {
  const lines = [
    "Upgrade plan.",
    `Target: ${formatTargetIdentity(plan.target)}.`,
    `Steps: ${plan.steps.length}.`,
  ];

  if (plan.steps.length === 0) {
    return `${[...lines, "No steps."].join("\n")}\n`;
  }

  return `${[
    ...lines,
    "",
    ...plan.steps.flatMap((step, index) => formatPlanStep(step, index)),
  ].join("\n")}\n`;
}

function formatPlanStep(step: CliUpgradePlanStep, index: number): string[] {
  const lines = [
    `${index + 1}. ${step.type} [${step.status}] safety=${step.safety}`,
    `   Summary: ${formatSentence(step.summary)}`,
    `   Target: ${formatTargetIdentity(step.target)}.`,
    `   Package app: ${formatPackageAppIdentity(step.packageApp)}.`,
    `   Required evidence: ${formatEvidenceRequirements(step.requiredEvidence)}.`,
    `   Details: ${formatStepDetails(step)}.`,
  ];

  if (step.status === "blocked") {
    lines.push(`   Blocked: ${formatSentence(step.statusReason)}`);
  } else if (step.status === "pending") {
    lines.push(`   Pending: ${formatSentence(step.statusReason)}`);
  }

  return index === 0 ? lines : ["", ...lines];
}

function formatStepDetails(step: CliUpgradePlanStep): string {
  switch (step.type) {
    case "archive-normalization":
      return compactJoin([
        formatValue("archiveKind", step.archiveKind ?? "unknown"),
        formatTransition("version", step.fromArchiveVersion, step.toArchiveVersion ?? "current"),
        formatValue("normalization", step.normalizationStatus),
      ]);
    case "backup":
      return compactJoin([
        formatValue("scope", step.backupScope),
        step.backupTarget === undefined ? null : formatValue("backupTarget", step.backupTarget),
      ]);
    case "browser-reload":
      return compactJoin([
        formatValue("reason", step.reloadReason),
        formatTransition(
          "runtimeProtocol",
          step.fromRuntimeProtocolVersion,
          step.toRuntimeProtocolVersion,
        ),
      ]);
    case "code-deploy":
      return compactJoin([
        formatTransition("packageVersion", step.fromPackageVersion, step.toPackageVersion),
        formatTransition(
          "runtimeProtocol",
          step.fromRuntimeProtocolVersion,
          step.toRuntimeProtocolVersion,
        ),
        formatTransition(
          "storageMigrationSet",
          step.fromStorageMigrationSet,
          step.toStorageMigrationSet,
        ),
      ]);
    case "manual-approval":
      return compactJoin([
        formatValue("approval", step.approvalKey),
        formatValue("reason", step.approvalReason),
      ]);
    case "package-app-migration":
      return compactJoin([
        formatValue("migration", step.migrationId),
        formatValue("checksum", step.checksum),
        step.owner === undefined ? null : formatValue("owner", step.owner),
        formatTransition(
          "packageRevision",
          step.packageApp.fromPackageRevision,
          step.packageApp.toPackageRevision,
        ),
      ]);
    case "sql-migration":
      return compactJoin([
        formatValue("migration", step.migrationId),
        formatValue("checksum", step.checksum),
        step.owner === undefined ? null : formatValue("owner", step.owner),
        formatValue("storageFamily", step.storageFamily),
      ]);
    default:
      return assertNever(step);
  }
}

function formatTargetIdentity(target: CliUpgradePlanTargetIdentity): string {
  return compactJoin(
    [
      target.label === undefined ? null : formatValue("label", target.label),
      target.targetId === undefined ? null : formatValue("targetId", target.targetId),
      target.targetUrl === undefined ? null : formatValue("url", target.targetUrl),
      target.storageIdentity === undefined
        ? null
        : formatValue("storageIdentity", target.storageIdentity),
      target.archivePath === undefined ? null : formatValue("archivePath", target.archivePath),
    ],
    ", ",
    "unspecified",
  );
}

function formatPackageAppIdentity(
  packageApp: CliUpgradePlanPackageAppIdentity | undefined,
): string {
  if (packageApp === undefined) {
    return "none";
  }

  return compactJoin(
    [
      formatValue("packageAppKey", packageApp.packageAppKey),
      packageApp.installId === undefined ? null : formatValue("installId", packageApp.installId),
      formatTransition(
        "packageRevision",
        packageApp.fromPackageRevision,
        packageApp.toPackageRevision,
      ),
      packageApp.sourceSchemaHash === undefined
        ? null
        : formatValue("sourceSchemaHash", packageApp.sourceSchemaHash),
    ],
    ", ",
  );
}

function formatEvidenceRequirements(
  evidence: readonly CliUpgradePlanEvidenceRequirement[],
): string {
  if (evidence.length === 0) {
    return "none";
  }

  return evidence
    .map((requirement) =>
      compactJoin([
        `${requirement.kind}: ${requirement.description}`,
        requirement.reference === undefined ? null : `reference=${requirement.reference}`,
      ]),
    )
    .join("; ");
}

function formatTransition(
  label: string,
  from: number | string | null | undefined,
  to: number | string | null | undefined,
): string | null {
  if (from === undefined && to === undefined) {
    return null;
  }

  return `${label}=${formatNullable(from)}->${formatNullable(to)}`;
}

function formatValue(label: string, value: number | string): string {
  return `${label}=${value}`;
}

function formatNullable(value: number | string | null | undefined): string {
  return value === null || value === undefined ? "unknown" : String(value);
}

function compactJoin(
  values: readonly (string | null)[],
  separator = "; ",
  emptyValue = "none",
): string {
  const presentValues = values.filter((value): value is string => value !== null);

  return presentValues.length === 0 ? emptyValue : presentValues.join(separator);
}

function formatSentence(value: string): string {
  return value.endsWith(".") ? value : `${value}.`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled upgrade plan step: ${JSON.stringify(value)}`);
}
