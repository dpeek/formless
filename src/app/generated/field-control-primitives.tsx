import { Button } from "@dpeek/formless-ui/button";
import { FieldError, Label } from "@dpeek/formless-ui/field";
import { Input } from "@dpeek/formless-ui/input";
import { MarkdownEditor } from "@dpeek/formless-ui/markdown";
import {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@dpeek/formless-ui/modal";
import { FormattedNumberInput } from "@dpeek/formless-ui/number-input";
import {
  SourceEditor,
  SourcePreviewFieldEditor,
  sourcePreviewPanelClassName,
} from "@dpeek/formless-ui/source-preview";
import { parseSvgIconSource, SvgIcon } from "@dpeek/formless-ui/svg-icon";
import { TextField } from "@dpeek/formless-ui/text-field";
import type {
  AriaAttributes,
  ComponentProps,
  FocusEventHandler,
  KeyboardEventHandler,
} from "react";
import { useMemo, useState } from "react";
import {
  listIconCatalogGroups,
  type IconCatalogEntry,
  type IconCatalogGroup,
} from "../../shared/icon-catalog.ts";
import type { TableColumnFormat } from "@dpeek/formless-schema";
import { GeneratedColorInput } from "./color-field-control.tsx";
import { decodeNumberEditorInputValue, encodeNumberEditorInputValue } from "./format.ts";

const markdownFieldControlClassName =
  "min-h-40 rounded border border-slate-300 bg-white px-3 py-2 text-sm";

export function GeneratedMarkdownFieldControl({
  ariaInvalid,
  label,
  onBlur,
  onChange,
  onKeyDown,
  readOnly,
  value,
}: {
  ariaInvalid?: boolean;
  label: string;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  readOnly?: boolean;
  value: string;
}) {
  return (
    <MarkdownEditor
      aria-invalid={ariaInvalid}
      aria-label={label}
      className={markdownFieldControlClassName}
      onBlur={onBlur}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={label}
      readOnly={readOnly}
      value={value}
    />
  );
}

export function GeneratedColorFieldControl({
  className,
  disabled,
  error,
  label,
  onBlur = () => undefined,
  onChange,
  required,
  value,
}: {
  className?: string;
  disabled?: boolean;
  error?: string;
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <GeneratedColorInput
      ariaLabel={label}
      className={className}
      disabled={disabled}
      error={error}
      onBlur={onBlur}
      onChange={onChange}
      required={required}
      value={value}
    />
  );
}

export function GeneratedIconSourceFieldControl({
  ariaInvalid,
  label,
  name,
  onChange,
  readOnly,
  required,
  sourceLabel = label,
  value,
}: {
  ariaInvalid?: AriaAttributes["aria-invalid"];
  label: string;
  name?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
  sourceLabel?: string;
  value: string;
}) {
  return (
    <SourcePreviewFieldEditor
      defaultMode="source"
      kind="icon"
      preview={<GeneratedIconSourcePreview label={label} source={value} />}
      source={
        <SourceEditor
          aria-invalid={ariaInvalid}
          aria-label={sourceLabel}
          name={name}
          onChange={onChange}
          placeholder={'<svg viewBox="0 0 24 24">...</svg>'}
          readOnly={readOnly}
          required={required}
          sourceKind="svg"
          value={value}
        />
      }
    />
  );
}

export function GeneratedIconSourcePreview({ label, source }: { label: string; source: string }) {
  return (
    <div
      className={`${sourcePreviewPanelClassName} flex items-center justify-center`}
      data-web-svg-preview="icon"
    >
      <SvgIcon ariaLabel={`${label} preview`} className="size-12" source={source} />
    </div>
  );
}

type GeneratedIconPickerMode = "catalog" | "custom";
type GeneratedIconPickerDensity = "default" | "compact";

export function GeneratedIconPickerFieldControl({
  ariaInvalid,
  canEdit = true,
  density = "default",
  error = null,
  initialMode = "catalog",
  isPending = false,
  label,
  onCancel,
  onChange,
  onOpenChange,
  onSave,
  open,
  previewSource,
  readOnly,
  value,
}: {
  ariaInvalid?: AriaAttributes["aria-invalid"];
  canEdit?: boolean;
  density?: GeneratedIconPickerDensity;
  error?: string | null;
  initialMode?: GeneratedIconPickerMode;
  isPending?: boolean;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => Promise<void> | void;
  open: boolean;
  previewSource?: string;
  readOnly?: boolean;
  value: string;
}) {
  const triggerSource = previewSource ?? value;
  const hasRenderableIcon = parseSvgIconSource(triggerSource) !== null;
  const triggerSize = density === "compact" ? "sq-xs" : "sq-sm";
  const iconSizeClassName = density === "compact" ? "size-4" : "size-5";
  const disabled = readOnly || !canEdit || isPending;
  const triggerClassName = hasRenderableIcon
    ? "border-transparent bg-transparent p-0 text-slate-700 hover:bg-slate-100"
    : "border-dashed border-slate-300 bg-slate-50 p-0 text-slate-500 hover:border-slate-400 hover:bg-slate-100";

  return (
    <>
      <div
        className={
          density === "compact"
            ? "flex h-6 w-full min-w-0 items-center"
            : "flex min-h-8 w-full min-w-0 items-center"
        }
        data-web-field-kind="icon"
      >
        <Button
          aria-label={`Edit ${label}`}
          className={triggerClassName}
          data-web-icon-field-edit="trigger"
          data-web-icon-field-empty={hasRenderableIcon ? undefined : "true"}
          data-web-icon-field-preview="compact"
          isDisabled={disabled}
          onPress={() => onOpenChange(true)}
          size={triggerSize}
          type="button"
          intent="plain"
        >
          <SvgIcon className={iconSizeClassName} source={triggerSource} />
        </Button>
      </div>
      <ModalContent
        isOpen={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onOpenChange(true);
          } else {
            onCancel();
          }
        }}
        size="2xl"
      >
        <GeneratedIconPickerEditor
          ariaInvalid={ariaInvalid}
          disabled={disabled}
          error={error}
          initialMode={initialMode}
          isPending={isPending}
          label={label}
          onChange={onChange}
          onSave={onSave}
          value={value}
        />
      </ModalContent>
    </>
  );
}

export function GeneratedIconPickerEditor({
  ariaInvalid,
  disabled,
  error,
  initialMode = "catalog",
  isPending = false,
  label,
  onChange,
  onSave,
  value,
}: {
  ariaInvalid?: AriaAttributes["aria-invalid"];
  disabled: boolean;
  error?: string | null;
  initialMode?: GeneratedIconPickerMode;
  isPending?: boolean;
  label: string;
  onChange: (value: string) => void;
  onSave: () => Promise<void> | void;
  value: string;
}) {
  const [mode, setMode] = useState<GeneratedIconPickerMode>(initialMode);
  const [search, setSearch] = useState("");
  const groups = useMemo(() => filterIconCatalogGroups(search), [search]);

  return (
    <>
      <ModalHeader>
        <ModalTitle>Edit {label}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4" data-web-icon-picker={mode}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-pressed={mode === "catalog"}
              data-web-icon-picker-mode="catalog"
              intent={mode === "catalog" ? "secondary" : "outline"}
              onPress={() => setMode("catalog")}
              size="xs"
              type="button"
            >
              Catalog
            </Button>
            <Button
              aria-pressed={mode === "custom"}
              data-web-icon-picker-mode="custom"
              intent={mode === "custom" ? "secondary" : "outline"}
              onPress={() => setMode("custom")}
              size="xs"
              type="button"
            >
              Custom SVG
            </Button>
          </div>

          {mode === "catalog" ? (
            <IconCatalogPickerPanel
              disabled={disabled}
              groups={groups}
              label={label}
              onChange={onChange}
              search={search}
              selectedValue={value}
              setSearch={setSearch}
            />
          ) : (
            <IconCustomSvgPanel
              ariaInvalid={ariaInvalid}
              disabled={disabled}
              error={error ?? null}
              label={label}
              onChange={onChange}
              value={value}
            />
          )}
        </div>
        <ModalFooter>
          <ModalClose intent="outline" type="button">
            Cancel
          </ModalClose>
          <Button isDisabled={disabled} onPress={() => void onSave()} type="button">
            {isPending ? "Saving..." : "Save"}
          </Button>
        </ModalFooter>
      </ModalBody>
    </>
  );
}

function IconCatalogPickerPanel({
  disabled,
  groups,
  label,
  onChange,
  search,
  selectedValue,
  setSearch,
}: {
  disabled: boolean;
  groups: readonly IconCatalogGroup[];
  label: string;
  onChange: (value: string) => void;
  search: string;
  selectedValue: string;
  setSearch: (value: string) => void;
}) {
  const hasResults = groups.some((group) => group.entries.length > 0);

  return (
    <div className="space-y-4">
      <TextField onChange={setSearch} value={search}>
        <Label className="sr-only">Search icons</Label>
        <Input
          aria-label="Search icons"
          data-web-icon-picker-search="true"
          placeholder="Search icons"
        />
      </TextField>
      <div className="max-h-[26rem] space-y-5 overflow-y-auto pr-1" data-web-icon-picker-grid>
        <IconCatalogOptionButton
          disabled={disabled}
          label={label}
          onPress={() => onChange("")}
          selected={selectedValue.trim() === ""}
          source=""
          title="No icon"
          value="empty"
        />
        {hasResults ? (
          groups.map((group) => (
            <section className="space-y-2" data-web-icon-picker-group={group.key} key={group.key}>
              <h3 className="text-xs font-medium text-slate-600">{group.label}</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2">
                {group.entries.map((entry) => (
                  <IconCatalogEntryButton
                    disabled={disabled}
                    entry={entry}
                    key={entry.key}
                    label={label}
                    onChange={onChange}
                    selected={selectedValue === entry.source}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="rounded border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-600">
            No icons found
          </p>
        )}
      </div>
    </div>
  );
}

function IconCatalogEntryButton({
  disabled,
  entry,
  label,
  onChange,
  selected,
}: {
  disabled: boolean;
  entry: IconCatalogEntry;
  label: string;
  onChange: (value: string) => void;
  selected: boolean;
}) {
  return (
    <IconCatalogOptionButton
      disabled={disabled}
      label={label}
      onPress={() => onChange(entry.source)}
      selected={selected}
      source={entry.source}
      title={entry.label}
      value={entry.key}
    />
  );
}

function IconCatalogOptionButton({
  disabled,
  label,
  onPress,
  selected,
  source,
  title,
  value,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  source: string;
  title: string;
  value: string;
}) {
  return (
    <Button
      aria-label={`${label}: ${title}`}
      className={[
        "min-h-20 flex-col gap-2 px-2 py-2 text-center text-xs/4",
        selected ? "ring-2 ring-ring/40" : "",
      ].join(" ")}
      data-web-icon-picker-option={value}
      data-web-icon-picker-selected={selected ? "true" : undefined}
      isDisabled={disabled}
      intent={selected ? "secondary" : "outline"}
      onPress={onPress}
      type="button"
    >
      <SvgIcon className="size-5" source={source} />
      <span className="max-w-full break-words">{title}</span>
    </Button>
  );
}

function IconCustomSvgPanel({
  ariaInvalid,
  disabled,
  error,
  label,
  onChange,
  value,
}: {
  ariaInvalid?: AriaAttributes["aria-invalid"];
  disabled: boolean;
  error: string | null;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <TextField isDisabled={disabled} isInvalid={error !== null}>
      <Label className="sr-only">{label} custom SVG source</Label>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)]">
        <div data-slot="control">
          <GeneratedIconSourceFieldControl
            ariaInvalid={ariaInvalid}
            label={label}
            onChange={onChange}
            readOnly={disabled}
            sourceLabel={`${label} custom SVG source`}
            value={value}
          />
        </div>
        <div
          className={`${sourcePreviewPanelClassName} flex min-h-40 items-center justify-center`}
          data-web-icon-picker-custom-preview="true"
        >
          <SvgIcon ariaLabel={`${label} custom SVG preview`} className="size-12" source={value} />
        </div>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </TextField>
  );
}

function filterIconCatalogGroups(searchTerm: string): readonly IconCatalogGroup[] {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const groups = listIconCatalogGroups();

  if (!normalizedSearch) {
    return groups;
  }

  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        iconCatalogEntryMatchesSearch(entry, group, normalizedSearch),
      ),
    }))
    .filter((group) => group.entries.length > 0);
}

function iconCatalogEntryMatchesSearch(
  entry: IconCatalogEntry,
  group: IconCatalogGroup,
  normalizedSearch: string,
) {
  return [entry.key, entry.label, group.label, ...(entry.searchTerms ?? [])].some((term) =>
    term.toLowerCase().includes(normalizedSearch),
  );
}

export function GeneratedNumberFieldControl({
  format = "plain",
  ...props
}: Omit<ComponentProps<typeof FormattedNumberInput>, "decode" | "encode"> & {
  format?: TableColumnFormat;
}) {
  return (
    <FormattedNumberInput
      {...props}
      decode={(value) => decodeNumberEditorInputValue(value, format)}
      encode={(value) => encodeNumberEditorInputValue(value, format)}
    />
  );
}
