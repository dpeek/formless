import type { FormlessUiIconOption } from "@dpeek/formless-presentation/contract";

const strokeSvgAttributes =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

function interfaceIcon(id: string, label: string, body: string): FormlessUiIconOption {
  return {
    group: "ui",
    id,
    label,
    source: `<svg ${strokeSvgAttributes}>${body}</svg>`,
  };
}

export const pageIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">',
  '<path d="M4.75 19.25h14.5" />',
  '<path d="M6.75 19.25V5.75a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v13.5" />',
  "</svg>",
].join("");

export const iconOptions = [
  { id: "page", label: "Page", group: "Content", source: pageIconSource },
  interfaceIcon("add", "Add", '<path d="M12 5v14"/><path d="M5 12h14"/>'),
  interfaceIcon(
    "calendar",
    "Calendar",
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  ),
  interfaceIcon("confirm", "Confirm", '<path d="m5 12 5 5L20 7"/>'),
  interfaceIcon("close", "Close", '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  interfaceIcon(
    "color-pick",
    "Color pick",
    '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3-3 3 3-3 3z"/>',
  ),
  interfaceIcon(
    "copy",
    "Copy",
    '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ),
  interfaceIcon("disclosure", "Disclosure", '<path d="m9 18 6-6-6-6"/>'),
  interfaceIcon("disclosure-down", "Disclosure down", '<path d="m6 9 6 6 6-6"/>'),
  interfaceIcon(
    "drag-handle",
    "Drag handle",
    '<circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>',
  ),
  interfaceIcon("indeterminate", "Indeterminate", '<path d="M5 12h14"/>'),
  interfaceIcon("loading", "Loading", '<path d="M21 12a9 9 0 1 1-6.2-8.56"/>'),
  interfaceIcon("menu", "Menu", '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>'),
  interfaceIcon("next", "Next", '<path d="m9 18 6-6-6-6"/>'),
  interfaceIcon("previous", "Previous", '<path d="m15 18-6-6 6-6"/>'),
  interfaceIcon(
    "priority-marker",
    "Priority marker",
    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  ),
  interfaceIcon(
    "publish",
    "Publish",
    '<path d="M4.5 16.5c-1.33-1.33-1.33-3.5 0-4.83L12 4.17l7.5 7.5c1.33 1.33 1.33 3.5 0 4.83L12 24z"/><path d="M12 4v20"/><path d="M4.5 16.5H12"/><path d="M12 16.5h7.5"/>',
  ),
  interfaceIcon("remove", "Remove", '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  interfaceIcon("select", "Select", '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>'),
  interfaceIcon("select-down", "Select down", '<path d="m6 9 6 6 6-6"/>'),
] satisfies readonly FormlessUiIconOption[];
