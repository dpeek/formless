import {
  assertExactKeys,
  isRecord,
  parseOptionalNonEmptyString,
  parseRequiredNonEmptyString,
} from "./schema-parse-helpers.ts";
import type {
  CollectionScreenSectionSchema,
  ScreenLayoutSchema,
  ScreenNavigationSchema,
  ScreenSchema,
  ScreenSectionSchema,
  ViewSchema,
} from "./schema-types.ts";

export function parseScreens(
  value: unknown,
  views: Record<string, ViewSchema>,
): Record<string, ScreenSchema> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error("Schema screens must be an object.");
  }

  const screens = Object.fromEntries(
    Object.entries(value).map(([screenName, screen]) => [
      screenName,
      parseScreen(screenName, screen, views),
    ]),
  );

  if (Object.keys(screens).length === 0) {
    throw new Error("Schema screens must not be empty.");
  }

  if (!Object.values(screens).some((screen) => screen.navigation?.primary ?? true)) {
    throw new Error("Schema must define at least one primary screen.");
  }

  return screens;
}

function parseScreen(
  screenName: string,
  value: unknown,
  views: Record<string, ViewSchema>,
): ScreenSchema {
  if (screenName.trim() === "") {
    throw new Error("Screen names must be non-empty.");
  }

  if (!isRecord(value)) {
    throw new Error(`Screen "${screenName}" must be an object.`);
  }

  assertExactKeys(`Screen "${screenName}"`, value, ["type", "label", "layout"], ["navigation"]);

  if (value.type !== "workspace") {
    throw new Error(`Screen "${screenName}" type must be "workspace".`);
  }

  const label = parseRequiredNonEmptyString(`Screen "${screenName}" label`, value.label);
  const navigation = parseScreenNavigation(screenName, value.navigation);
  const layout = parseScreenLayout(screenName, value.layout, views);

  return {
    type: "workspace",
    label,
    ...(navigation === undefined ? {} : { navigation }),
    layout,
  };
}

function parseScreenNavigation(
  screenName: string,
  value: unknown,
): ScreenNavigationSchema | undefined {
  if (value === undefined) {
    return undefined;
  }

  const context = `Screen "${screenName}" navigation`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["primary"]);

  if (typeof value.primary !== "boolean") {
    throw new Error(`${context} primary must be a boolean.`);
  }

  return { primary: value.primary };
}

function parseScreenLayout(
  screenName: string,
  value: unknown,
  views: Record<string, ViewSchema>,
): ScreenLayoutSchema {
  const context = `Screen "${screenName}" layout`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  assertExactKeys(context, value, ["type", "sections"]);

  if (value.type !== "stack") {
    throw new Error(`${context} type must be "stack".`);
  }

  return {
    type: "stack",
    sections: parseScreenSections(screenName, value.sections, views),
  };
}

function parseScreenSections(
  screenName: string,
  value: unknown,
  views: Record<string, ViewSchema>,
): ScreenSectionSchema[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Screen "${screenName}" layout sections must be a non-empty array.`);
  }

  const sectionIds = new Set<string>();

  return value.map((section, index) => {
    const parsedSection = parseScreenSection(screenName, index, section, views);

    if (sectionIds.has(parsedSection.id)) {
      throw new Error(
        `Screen "${screenName}" layout section id "${parsedSection.id}" must be unique.`,
      );
    }

    sectionIds.add(parsedSection.id);
    return parsedSection;
  });
}

function parseScreenSection(
  screenName: string,
  index: number,
  value: unknown,
  views: Record<string, ViewSchema>,
): ScreenSectionSchema {
  const context = `Screen "${screenName}" layout section ${index}`;

  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  if (value.type !== "collection") {
    throw new Error(`${context} type must be "collection".`);
  }

  return parseCollectionScreenSection(context, value, views);
}

function parseCollectionScreenSection(
  context: string,
  value: Record<string, unknown>,
  views: Record<string, ViewSchema>,
): CollectionScreenSectionSchema {
  assertExactKeys(context, value, ["id", "type", "view"], ["label"]);

  const id = parseRequiredNonEmptyString(`${context} id`, value.id);
  const viewName = parseRequiredNonEmptyString(`${context} view`, value.view);
  const view = views[viewName];

  if (!view) {
    throw new Error(`${context} references unknown view "${viewName}".`);
  }

  if (view.type !== "collection") {
    throw new Error(`${context} must reference a collection view.`);
  }

  const label = parseOptionalNonEmptyString(`${context} label`, value.label);

  return {
    id,
    type: "collection",
    view: viewName,
    ...(label === undefined ? {} : { label }),
  };
}
