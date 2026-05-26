const iconCatalogGroupDefinitions = [
  { key: "ui", label: "Interface" },
  { key: "social", label: "Social" },
  { key: "provider", label: "Providers" },
] as const;

export type IconCatalogGroupKey = (typeof iconCatalogGroupDefinitions)[number]["key"];

export type IconCatalogEntry = {
  group: IconCatalogGroupKey;
  key: string;
  label: string;
  searchTerms?: readonly string[];
  source: string;
};

export type IconCatalogGroup = {
  entries: readonly IconCatalogEntry[];
  key: IconCatalogGroupKey;
  label: string;
};

const strokeSvgAttributes =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const filledSvgAttributes = 'viewBox="0 0 24 24" fill="currentColor"';

const uiIcon = (
  key: string,
  label: string,
  body: string,
  searchTerms?: readonly string[],
): IconCatalogEntry => ({
  group: "ui",
  key,
  label,
  searchTerms,
  source: `<svg ${strokeSvgAttributes}>${body}</svg>`,
});

const filledIcon = (
  group: Exclude<IconCatalogGroupKey, "ui">,
  key: string,
  label: string,
  body: string,
  searchTerms?: readonly string[],
): IconCatalogEntry => ({
  group,
  key,
  label,
  searchTerms,
  source: `<svg ${filledSvgAttributes}>${body}</svg>`,
});

const priorityMarkerIcon = uiIcon(
  "priority-marker",
  "Priority marker",
  '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  ["flag"],
);

export const iconCatalogEntries = [
  uiIcon("add", "Add", '<path d="M12 5v14"/><path d="M5 12h14"/>'),
  uiIcon(
    "calendar",
    "Calendar",
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  ),
  uiIcon("confirm", "Confirm", '<path d="m5 12 5 5L20 7"/>', ["check"]),
  uiIcon("close", "Close", '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', ["dismiss", "x"]),
  uiIcon(
    "color-pick",
    "Color pick",
    '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3-3 3 3-3 3z"/>',
    ["pipette"],
  ),
  uiIcon(
    "copy",
    "Copy",
    '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ),
  uiIcon("disclosure", "Disclosure", '<path d="m9 18 6-6-6-6"/>', ["chevron right"]),
  uiIcon("disclosure-down", "Disclosure down", '<path d="m6 9 6 6 6-6"/>', ["chevron down"]),
  uiIcon(
    "drag-handle",
    "Drag handle",
    '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
    ["grip"],
  ),
  uiIcon("indeterminate", "Indeterminate", '<path d="M5 12h14"/>', ["minus"]),
  uiIcon("loading", "Loading", '<path d="M21 12a9 9 0 1 1-6.2-8.56"/>', ["spinner"]),
  uiIcon("menu", "Menu", '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>'),
  uiIcon("next", "Next", '<path d="m9 18 6-6-6-6"/>', ["chevron right"]),
  uiIcon("previous", "Previous", '<path d="m15 18-6-6 6-6"/>', ["chevron left"]),
  priorityMarkerIcon,
  uiIcon(
    "publish",
    "Publish",
    '<path d="M4.5 16.5c-1.33-1.33-1.33-3.5 0-4.83L12 4.17l7.5 7.5c1.33 1.33 1.33 3.5 0 4.83L12 24z"/><path d="M12 4v20"/><path d="M4.5 16.5H12"/><path d="M12 16.5h7.5"/>',
    ["rocket"],
  ),
  uiIcon("remove", "Remove", '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', ["delete"]),
  uiIcon("select", "Select", '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>', ["chevrons"]),
  uiIcon("select-down", "Select down", '<path d="m6 9 6 6 6-6"/>'),
  uiIcon("sort", "Sort", '<path d="m6 9 6 6 6-6"/>'),
  uiIcon("tree-disclosure", "Tree disclosure", '<path d="m9 18 6-6-6-6"/>'),
  uiIcon(
    "text-bold",
    "Bold",
    '<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
  ),
  uiIcon(
    "text-bulleted-list",
    "Bulleted list",
    '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  ),
  uiIcon("text-code", "Code", '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'),
  uiIcon(
    "text-heading-two",
    "Heading 2",
    '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-1-2-2-2s-2 .5-2 2"/>',
  ),
  uiIcon(
    "text-heading-three",
    "Heading 3",
    '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 10h4l-2.5 3H19a2 2 0 1 1 0 4h-2"/>',
  ),
  uiIcon(
    "text-italic",
    "Italic",
    '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
  ),
  uiIcon(
    "text-link",
    "Link",
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ),
  uiIcon(
    "text-numbered-list",
    "Numbered list",
    '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1-2-1"/>',
  ),
  uiIcon(
    "text-paragraph",
    "Paragraph",
    '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  ),
  uiIcon(
    "text-quote",
    "Quote",
    '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 2-1 3.5-4 4z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 2-1 3.5-4 4z"/>',
  ),
  uiIcon(
    "text-strikethrough",
    "Strikethrough",
    '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/>',
  ),
  filledIcon(
    "social",
    "github",
    "GitHub",
    '<path d="M12 .5C5.65 .5.5 5.65.5 12c0 5.1 3.29 9.42 7.86 10.95.58.11.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11.1 11.1 0 0 1 12 6.07c.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.04.78 2.1v3.12c0 .31.21.68.79.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>',
  ),
  filledIcon(
    "social",
    "linkedin",
    "LinkedIn",
    '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.6c0-1.34-.02-3.06-1.86-3.06-1.87 0-2.16 1.46-2.16 2.96V21h-4V9Z"/>',
  ),
  filledIcon(
    "social",
    "x",
    "X",
    '<path d="M13.91 10.47 21.35 2h-1.76l-6.46 7.35L7.98 2H2.03l7.8 11.1L2.03 22h1.76l6.82-7.77L16.02 22h5.95l-8.06-11.53Zm-2.41 2.75-.79-1.11L4.42 3.3h2.7l5.08 7.11.79 1.11 6.59 9.25h-2.7l-5.38-7.55Z"/>',
    ["twitter"],
  ),
  filledIcon(
    "provider",
    "apple",
    "Apple",
    '<path d="M16.8 13.1c0-2.1 1.7-3.1 1.8-3.2-1-1.5-2.5-1.7-3.1-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.9-1.1-2.9-3.8ZM14.7 6.8c.6-.8 1.1-1.8 1-2.8-1 .1-2.1.7-2.8 1.4-.6.7-1.1 1.7-1 2.7 1 0 2.1-.5 2.8-1.3Z"/>',
  ),
  filledIcon(
    "provider",
    "gitlab",
    "GitLab",
    '<path d="m12 22 3.68-11.33H8.32L12 22Z"/><path d="m12 22-7.5-5.45 3.82-5.88L12 22Z"/><path d="M4.5 16.55 2.75 11.2c-.18-.57.02-1.2.5-1.55.49-.36 1.16-.34 1.63.03l3.44.99-3.82 5.88Z"/><path d="m8.32 10.67 1.46-4.49c.22-.68 1.19-.68 1.41 0L12 8.67l-3.68 2Z"/><path d="m12 22 7.5-5.45-3.82-5.88L12 22Z"/><path d="m19.5 16.55 1.75-5.35c.18-.57-.02-1.2-.5-1.55-.49-.36-1.16-.34-1.63.03l-3.44.99 3.82 5.88Z"/><path d="m15.68 10.67-1.46-4.49c-.22-.68-1.19-.68-1.41 0L12 8.67l3.68 2Z"/>',
  ),
  filledIcon(
    "provider",
    "google",
    "Google",
    '<path d="M21.6 12.23c0-.74-.07-1.45-.19-2.12H12v4.01h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.89-1.74 2.99-4.31 2.99-7.42Z"/><path d="M12 22c2.7 0 4.96-.89 6.61-2.35l-3.22-2.51c-.9.6-2.04.95-3.39.95-2.61 0-4.82-1.76-5.61-4.12H3.06v2.59A9.99 9.99 0 0 0 12 22Z"/><path d="M6.39 13.97A6 6 0 0 1 6.08 12c0-.68.11-1.35.31-1.97V7.44H3.06A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.06 4.56l3.33-2.59Z"/><path d="M12 5.91c1.47 0 2.79.51 3.83 1.5l2.86-2.86C16.96 2.94 14.7 2 12 2a9.99 9.99 0 0 0-8.94 5.44l3.33 2.59C7.18 7.67 9.39 5.91 12 5.91Z"/>',
  ),
  filledIcon(
    "provider",
    "microsoft",
    "Microsoft",
    '<rect height="9" width="9" x="2" y="2"/><rect height="9" width="9" x="13" y="2"/><rect height="9" width="9" x="2" y="13"/><rect height="9" width="9" x="13" y="13"/>',
  ),
  filledIcon(
    "provider",
    "npm",
    "npm",
    '<path d="M2 7h20v10H12v-2H8v2H2V7Zm3 2v6h2V9H5Zm4 0v6h2V9H9Zm4 0v6h2V9h2v6h2V9h-6Z"/>',
  ),
] as const satisfies readonly IconCatalogEntry[];

const iconCatalogAliasKeys: Record<string, string> = {
  check: "confirm",
  flag: "priority-marker",
  "priority-flag": "priority-marker",
  twitter: "x",
};

export function listIconCatalogEntries(): readonly IconCatalogEntry[] {
  return iconCatalogEntries;
}

export function listIconCatalogGroups(): readonly IconCatalogGroup[] {
  return iconCatalogGroupDefinitions.map((group) => ({
    ...group,
    entries: iconCatalogEntries.filter((entry) => entry.group === group.key),
  }));
}

export function findIconCatalogEntry(key: string | undefined): IconCatalogEntry | undefined {
  if (!key) {
    return undefined;
  }

  const normalizedKey = normalizeIconCatalogKey(key);
  const catalogKey = iconCatalogAliasKeys[normalizedKey] ?? normalizedKey;

  return iconCatalogEntries.find((entry) => entry.key === catalogKey);
}

export function resolveIconCatalogSvg(key: string | undefined): string | undefined {
  return findIconCatalogEntry(key)?.source;
}

function normalizeIconCatalogKey(key: string): string {
  return key.trim().toLowerCase();
}
