import { resolveIconCatalogSvg } from "../../../../../src/shared/icon-catalog.ts";
import type {
  AstryxFieldOption,
  AstryxFieldTransitionOperation,
} from "../../field-contract.ts";

export function displayOption(
  options: readonly { value: string; label: string }[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export const ownerOptions = [
  { value: "principal-dana", label: "Dana Peek", detail: "Product" },
  { value: "principal-jordan", label: "Jordan Lee", detail: "Design" },
  {
    value: "principal-missing",
    label: "principal-missing",
    detail: "Stored reference",
    isMissing: true,
  },
] satisfies readonly AstryxFieldOption[];

export const statusOptions = [
  {
    value: "open",
    label: "Open",
    icon: "priority-marker",
    source: requiredIconCatalogSource("priority-marker"),
    color: "#2563eb",
  },
  { value: "waiting", label: "Waiting", color: "#d97706" },
  {
    value: "blocked",
    label: "Blocked",
    icon: "close",
    source: requiredIconCatalogSource("close"),
  },
  { value: "done", label: "Done" },
] satisfies readonly AstryxFieldOption[];

export const stateStatusOptions = [
  { value: "open", label: "Open", color: "#2563eb" },
  { value: "waiting", label: "Waiting", color: "#d97706" },
  { value: "blocked", label: "Blocked", color: "#dc2626" },
  { value: "done", label: "Done", color: "#16a34a" },
] satisfies readonly AstryxFieldOption[];

function requiredIconCatalogSource(key: string) {
  const source = resolveIconCatalogSvg(key);

  if (!source) {
    throw new Error(`Missing icon catalog source for "${key}".`);
  }

  return source;
}

export const mediaPreviewUrls = {
  homepagePreview: "https://picsum.photos/seed/formless-homepage-preview/960/540",
  homepageHero: "https://picsum.photos/seed/formless-homepage-hero/1280/720",
  productDetail: "https://picsum.photos/seed/formless-product-detail/960/540",
};

export const imageOptions = [
  {
    value: "image-homepage-preview",
    label: "Homepage",
    detail: "Public sample",
    mediaAlt: "Homepage preview",
    mediaPreviewUrl: mediaPreviewUrls.homepagePreview,
  },
  {
    value: "image-product-detail",
    label: "Detail",
    detail: "Public sample",
    mediaAlt: "Product detail preview",
    mediaPreviewUrl: mediaPreviewUrls.productDetail,
  },
] satisfies readonly AstryxFieldOption[];

export const mediaOptions = [
  {
    value: "media-homepage-hero",
    label: "Hero",
    detail: "Public sample",
    mediaAlt: "Homepage hero",
    mediaPreviewUrl: mediaPreviewUrls.homepageHero,
  },
  ...imageOptions,
] satisfies readonly AstryxFieldOption[];

export const stateTransitions: readonly AstryxFieldTransitionOperation[] = [
  {
    id: "complete",
    label: "Complete",
    operationKey: "tasks.complete",
    targetValue: "done",
    visualIntent: "primary",
  },
  {
    id: "send-waiting",
    label: "Send to waiting",
    operationKey: "tasks.sendToWaiting",
    targetValue: "waiting",
    visualIntent: "secondary",
  },
  {
    id: "reopen",
    label: "Reopen",
    operationKey: "tasks.reopen",
    targetValue: "open",
    visualIntent: "secondary",
  },
  {
    id: "block",
    label: "Block",
    operationKey: "tasks.block",
    targetValue: "blocked",
    visualIntent: "secondary",
  },
];

export const publishedPageIconSource = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M4.75 19.25h14.5" />',
  '<path d="M6.75 19.25V5.75a1 1 0 0 1 1-1h8.5a1 1 0 0 1 1 1v13.5" />',
  '<path d="M9.25 8.75h5.5" />',
  '<path d="M9.25 12h5.5" />',
  '<path d="M9.25 15.25h2.5" />',
  "</svg>",
].join("");
