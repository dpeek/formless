export const SITE_APP_PUBLIC_CONTRACT_VERSION = 1;

export type FieldValue = string | boolean | number;
export type RecordValues = Record<string, FieldValue>;

export type StoredRecord = {
  id: string;
  entity: string;
  values: RecordValues;
  createdAt: string;
  deletedAt?: string;
};

export type SitePageTreeProjection = {
  tree: SitePageTree | null;
  meta: SiteTreeMeta;
};

export type SitePageTreeResponse = SitePageTree;

export type SitePageTree = {
  site?: SiteSettingsNode;
  page: SiteBlockNode;
  frame: SitePageFrame;
  meta: SiteTreeMeta;
  route?: SiteTreeRoute;
};

export type SiteSettingsNode = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  accentColor?: string;
  backgroundColor?: string;
};

export type SitePageFrame = {
  header?: SiteBlockNode;
  footer?: SiteBlockNode;
};

export type SiteMediaNode = {
  assetId: string;
  href: string;
  kind: "image";
};

export type SitePublicOperationChallengeNode = {
  kind: "turnstile";
  siteKey?: string;
};

export type SitePublicOperationNode = {
  entityName: string;
  operationName: string;
  canonicalKey: string;
  route: string;
  challenge: SitePublicOperationChallengeNode;
};

export type SiteTreeRoute =
  | {
      kind: "page";
      slug: string;
    }
  | {
      kind: "post-index";
      slug: string;
      postCount: number;
    }
  | {
      kind: "post";
      slug: string;
    };

export type SiteTreeMeta = {
  slug: string;
  generatedAt: string;
  warnings: SiteTreeWarning[];
};

export type SiteBlockNode = {
  id: string;
  type: string;
  label: string;
  body?: string;
  operationName?: string;
  buttonLabel?: string;
  href?: string;
  date?: string;
  icon?: string;
  color?: string;
  alignment?: string;
  media?: SiteMediaNode;
  width?: number;
  height?: number;
  placements: SitePlacementNode[];
  query?: {
    key: string;
    items: SiteBlockNode[];
  };
  publicOperation?: SitePublicOperationNode;
};

export type SitePlacementNode = {
  id: string;
  order: number;
  label?: string;
  slot?: string;
  block: SiteBlockNode;
};

export type SiteTreeWarning = {
  code: string;
  recordId: string;
  message: string;
};
