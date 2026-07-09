import type { AstryxFieldSurface } from "../field-contract.ts";
import type { FieldKindOption, FieldScenarioGroup } from "./field-scenario-model.ts";
import { booleanScenarioGroups } from "./field-scenarios/boolean.ts";
import { colorScenarioGroups } from "./field-scenarios/color.ts";
import { dateScenarioGroups } from "./field-scenarios/date.ts";
import { enumScenarioGroups } from "./field-scenarios/enum.ts";
import { mediaScenarioGroups } from "./field-scenarios/media.ts";
import { numberScenarioGroups } from "./field-scenarios/number.ts";
import { referenceScenarioGroups } from "./field-scenarios/reference.ts";
import { stateMachineScenarioGroups } from "./field-scenarios/state-machine.ts";
import { textScenarioGroups } from "./field-scenarios/text.ts";

export const fieldSurfaceOptions = [
  { id: "create", label: "Create" },
  { id: "record", label: "Record" },
  { id: "table-cell", label: "Table Cell" },
  { id: "detail", label: "Detail" },
  { id: "public-action", label: "Public Action" },
  { id: "site-authoring", label: "Site Authoring" },
] satisfies readonly { id: AstryxFieldSurface; label: string }[];

export const fieldKindOptions = [
  { id: "state-machine-enum", label: "State" },
  { id: "enum", label: "Enum" },
  { id: "reference", label: "Reference" },
  { id: "text", label: "Text" },
  { id: "long-text", label: "Long Text" },
  { id: "markdown", label: "Markdown" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "color", label: "Color" },
  { id: "source-icon", label: "Source Icon" },
  { id: "image", label: "Image" },
  { id: "media", label: "Media" },
] satisfies readonly FieldKindOption[];

export const fieldScenarioGroups = [
  ...stateMachineScenarioGroups,
  ...enumScenarioGroups,
  ...referenceScenarioGroups,
  ...textScenarioGroups,
  ...numberScenarioGroups,
  ...dateScenarioGroups,
  ...booleanScenarioGroups,
  ...colorScenarioGroups,
  ...mediaScenarioGroups,
] satisfies readonly FieldScenarioGroup[];
