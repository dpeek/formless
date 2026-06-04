import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { resolveIconCatalogSvg } from "../../shared/icon-catalog.ts";
import type { EnumValueSchema } from "@dpeek/formless-schema";

export type ResolvedFieldPresentationIcon = {
  kind: "svg";
  source: string;
};

export type FieldPresentationColorIntent = "neutral" | "success" | "warning" | "danger";

export type ResolvedFieldPresentationColor = {
  intent: FieldPresentationColorIntent;
  token?: string;
  known: boolean;
};

const colorTokenRegistry: Record<string, Exclude<FieldPresentationColorIntent, "neutral">> = {
  danger: "danger",
  error: "danger",
  "priority.high": "danger",
  "priority.low": "success",
  "priority.normal": "warning",
  success: "success",
  warning: "warning",
};

export function resolveFieldPresentationIcon(
  token: string | undefined,
): ResolvedFieldPresentationIcon | undefined {
  const source = resolveIconCatalogSvg(token);

  if (!source) {
    return undefined;
  }

  return { kind: "svg", source };
}

export function resolveFieldPresentationColor(
  token: string | undefined,
): ResolvedFieldPresentationColor {
  if (!token) {
    return { intent: "neutral", known: true };
  }

  const intent = colorTokenRegistry[token];

  return {
    intent: intent ?? "neutral",
    token,
    known: intent !== undefined,
  };
}

export function enumValuePresentation({
  option,
  value,
}: {
  option: EnumValueSchema | undefined;
  value: string;
}) {
  return {
    color: resolveFieldPresentationColor(option?.presentation?.color),
    icon: resolveFieldPresentationIcon(option?.presentation?.icon),
    label: option?.label ?? value,
  };
}

export function GeneratedFieldPresentationIcon({
  className,
  icon,
}: {
  className?: string;
  icon: ResolvedFieldPresentationIcon;
}) {
  return <SvgIcon className={className} source={icon.source} />;
}

export function fieldPresentationIconButtonClassName(intent: FieldPresentationColorIntent) {
  if (intent === "success") {
    return [
      "[--btn-border:var(--color-success-subtle-fg)]/30",
      "[--btn-bg:var(--color-success-subtle)]",
      "[--btn-fg:var(--color-success-subtle-fg)]",
      "[--btn-icon:var(--color-success-subtle-fg)]",
      "[--btn-overlay:color-mix(in_oklab,var(--color-success-subtle-fg)_8%,var(--color-success-subtle)_92%)]",
      "[--btn-ring:var(--color-success-subtle-fg)]/20",
    ].join(" ");
  }

  if (intent === "warning") {
    return [
      "[--btn-border:var(--color-warning-subtle-fg)]/30",
      "[--btn-bg:var(--color-warning-subtle)]",
      "[--btn-fg:var(--color-warning-subtle-fg)]",
      "[--btn-icon:var(--color-warning-subtle-fg)]",
      "[--btn-overlay:color-mix(in_oklab,var(--color-warning-subtle-fg)_8%,var(--color-warning-subtle)_92%)]",
      "[--btn-ring:var(--color-warning-subtle-fg)]/20",
    ].join(" ");
  }

  if (intent === "danger") {
    return [
      "[--btn-border:var(--color-danger-subtle-fg)]/30",
      "[--btn-bg:var(--color-danger-subtle)]",
      "[--btn-fg:var(--color-danger-subtle-fg)]",
      "[--btn-icon:var(--color-danger-subtle-fg)]",
      "[--btn-overlay:color-mix(in_oklab,var(--color-danger-subtle-fg)_8%,var(--color-danger-subtle)_92%)]",
      "[--btn-ring:var(--color-danger-subtle-fg)]/20",
    ].join(" ");
  }

  return [
    "[--btn-border:var(--color-border)]",
    "[--btn-bg:transparent]",
    "[--btn-fg:var(--color-muted-fg)]",
    "[--btn-icon:var(--color-muted-fg)]",
    "[--btn-overlay:var(--color-secondary)]",
    "[--btn-ring:var(--color-ring)]/20",
  ].join(" ");
}

export function fieldPresentationTextColorClassName(intent: FieldPresentationColorIntent) {
  if (intent === "success") {
    return "text-success-subtle-fg";
  }

  if (intent === "warning") {
    return "text-warning-subtle-fg";
  }

  if (intent === "danger") {
    return "text-danger-subtle-fg";
  }

  return "text-slate-600";
}

export function completionCheckboxClassName() {
  return [
    "[--indicator-mt:0px]",
    "[&_[data-slot=indicator]]:size-6",
    "sm:[&_[data-slot=indicator]]:size-5",
    "[&_[data-slot=indicator]]:rounded-full",
    "[&_[data-slot=indicator]]:inset-ring-2",
    "[&_[data-slot=check-indicator]]:size-5",
    "sm:[&_[data-slot=check-indicator]]:size-4",
  ].join(" ");
}

export function quietValueOrInteractionClassName(quiet: boolean) {
  if (!quiet) {
    return undefined;
  }

  return [
    "opacity-0",
    "transition-opacity",
    "hover:opacity-100",
    "focus-within:opacity-100",
    "group-hover/record-row:opacity-100",
    "group-focus-within/record-row:opacity-100",
  ].join(" ");
}
