export const SITE_PUBLIC_BLOCK_TYPES = [
  "page",
  "post",
  "project",
  "postList",
  "projectList",
  "subscribeForm",
  "contactForm",
  "publicOperationForm",
  "group",
  "section",
  "cardGrid",
  "card",
  "metricGrid",
  "metric",
  "header",
  "headerPrimary",
  "headerSecondary",
  "footer",
  "footerSection",
  "footerSocial",
  "link",
  "markdown",
  "hero",
  "feature",
  "image",
] as const;

export type SitePublicBlockType = (typeof SITE_PUBLIC_BLOCK_TYPES)[number];

const sitePublicBlockTypeSet = new Set<string>(SITE_PUBLIC_BLOCK_TYPES);

export function isSitePublicBlockType(value: string): value is SitePublicBlockType {
  return sitePublicBlockTypeSet.has(value);
}
