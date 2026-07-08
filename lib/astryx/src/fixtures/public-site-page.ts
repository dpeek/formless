export type AstryxProjectedSitePageFixture = {
  tree: AstryxProjectedSitePageTree;
  routeFacts: AstryxProjectedSiteRouteFacts;
  formStates: readonly AstryxPublicFormPrototypeState[];
};

export type AstryxProjectedSitePageTree = {
  site?: AstryxProjectedSiteSettingsNode;
  page: AstryxProjectedSiteBlockNode;
  frame: AstryxProjectedSitePageFrame;
  meta: AstryxProjectedSiteTreeMeta;
  route?: AstryxProjectedSiteTreeRoute;
};

export type AstryxProjectedSiteSettingsNode = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  accentColor?: string;
  backgroundColor?: string;
};

export type AstryxProjectedSitePageFrame = {
  header?: AstryxProjectedSiteBlockNode;
  footer?: AstryxProjectedSiteBlockNode;
};

export type AstryxProjectedSiteMediaNode = {
  assetId: string;
  href: string;
  kind: "image";
};

export type AstryxProjectedSitePublicOperationChallengeNode = {
  kind: "turnstile";
  siteKey?: string;
};

export type AstryxProjectedSitePublicOperationTargetNode =
  | {
      kind: "schemaKey";
      schemaKey: string;
      apiRoutePrefix: `/${string}`;
    }
  | {
      kind: "appInstall";
      packageAppKey: string;
      installId: string;
      apiRoutePrefix: `/${string}`;
    };

export type AstryxProjectedSitePublicOperationInputFieldOptionNode = {
  value: string;
  label: string;
};

export type AstryxProjectedSitePublicOperationTextFormatNode = "email" | "phone";

export type AstryxProjectedSitePublicOperationInputFieldNode = {
  name: string;
  label: string;
  required: boolean;
  control: "text" | "longText" | "boolean" | "date" | "number" | "enum";
  format?: AstryxProjectedSitePublicOperationTextFormatNode;
  suggestions?: readonly string[];
  options?: readonly AstryxProjectedSitePublicOperationInputFieldOptionNode[];
};

export type AstryxProjectedSitePublicOperationNode = {
  entityName: string;
  operationName: string;
  canonicalKey: string;
  target?: AstryxProjectedSitePublicOperationTargetNode;
  route: string;
  challenge: AstryxProjectedSitePublicOperationChallengeNode;
  fields?: readonly AstryxProjectedSitePublicOperationInputFieldNode[];
};

export type AstryxProjectedSiteTreeRoute =
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

export type AstryxProjectedSiteTreeMeta = {
  slug: string;
  generatedAt: string;
  warnings: readonly AstryxProjectedSiteTreeWarning[];
};

export type AstryxProjectedSiteBlockNode = {
  id: string;
  type: string;
  label: string;
  body?: string;
  operationName?: string;
  operationKey?: string;
  buttonLabel?: string;
  successLabel?: string;
  nameLabel?: string;
  emailLabel?: string;
  messageLabel?: string;
  href?: string;
  date?: string;
  icon?: string;
  color?: string;
  alignment?: string;
  media?: AstryxProjectedSiteMediaNode;
  width?: number;
  height?: number;
  placements: readonly AstryxProjectedSitePlacementNode[];
  query?: {
    key: string;
    items: readonly AstryxProjectedSiteBlockNode[];
  };
  publicOperation?: AstryxProjectedSitePublicOperationNode;
};

export type AstryxProjectedSitePlacementNode = {
  id: string;
  order: number;
  label?: string;
  slot?: string;
  block: AstryxProjectedSiteBlockNode;
};

export type AstryxProjectedSiteTreeWarning = {
  code: string;
  recordId: string;
  message: string;
};

export type AstryxProjectedSiteRouteFacts = {
  linkMode: "preview" | "authoring" | "published" | "installed";
  routeBase?: `/${string}`;
  currentPath: `/${string}`;
};

export type AstryxPublicFormPrototypeState = {
  blockId: string;
  state: "valid" | "unavailable" | "submitting" | "success" | "failed";
  message?: string;
  warningCode?: string;
};

const siteIconSource = `<svg viewBox="0 0 32 32" role="img" aria-label="Astryx"><rect width="32" height="32" rx="7" fill="#111827"/><path d="M8 22 16 6l8 16h-4.1l-1.4-3.3h-5.1L12 22H8Zm6.6-6.4h2.8L16 12l-1.4 3.6Z" fill="#fff"/></svg>`;
const cardIconSource = `<svg viewBox="0 0 24 24" role="img" aria-label="Spark"><path d="M12 2 9.6 9.6 2 12l7.6 2.4L12 22l2.4-7.6L22 12l-7.6-2.4L12 2Z" fill="currentColor"/></svg>`;

const publicChallenge = {
  kind: "turnstile",
  siteKey: "1x00000000000000000000AA",
} satisfies AstryxProjectedSitePublicOperationChallengeNode;

const siteTarget = {
  kind: "schemaKey",
  schemaKey: "site",
  apiRoutePrefix: "/api/site",
} satisfies AstryxProjectedSitePublicOperationTargetNode;

const crmTarget = {
  kind: "appInstall",
  packageAppKey: "crm",
  installId: "crm",
  apiRoutePrefix: "/api/app-installs/crm/crm",
} satisfies AstryxProjectedSitePublicOperationTargetNode;

export const publicSitePageFixture = {
  tree: {
    site: {
      id: "projected_site_settings_astryx",
      label: "Astryx Studio",
      description: "Public Site rendering fixture for projected Formless page output.",
      icon: siteIconSource,
      accentColor: "#2563eb",
      backgroundColor: "#f8fafc",
    },
    frame: {
      header: {
        id: "projected_frame_header",
        type: "header",
        label: "Header",
        placements: [
          {
            id: "projected_place_header_primary",
            order: 1000,
            block: {
              id: "projected_header_primary",
              type: "headerPrimary",
              label: "Primary navigation",
              placements: [
                {
                  id: "projected_place_header_home",
                  order: 1000,
                  block: {
                    id: "projected_link_home",
                    type: "link",
                    label: "Home",
                    href: "/pages/home",
                    placements: [],
                  },
                },
                {
                  id: "projected_place_header_work",
                  order: 2000,
                  block: {
                    id: "projected_link_work",
                    type: "link",
                    label: "Work",
                    href: "/pages/work",
                    placements: [],
                  },
                },
                {
                  id: "projected_place_header_contact",
                  order: 3000,
                  block: {
                    id: "projected_link_contact",
                    type: "link",
                    label: "Contact",
                    href: "#contact",
                    placements: [],
                  },
                },
              ],
            },
          },
          {
            id: "projected_place_header_secondary",
            order: 2000,
            block: {
              id: "projected_header_secondary",
              type: "headerSecondary",
              label: "Secondary navigation",
              placements: [
                {
                  id: "projected_place_header_docs",
                  order: 1000,
                  block: {
                    id: "projected_link_docs",
                    type: "link",
                    label: "Docs",
                    href: "https://example.com/docs",
                    placements: [],
                  },
                },
              ],
            },
          },
        ],
      },
      footer: {
        id: "projected_frame_footer",
        type: "footer",
        label: "Footer",
        placements: [
          {
            id: "projected_place_footer_pages",
            order: 1000,
            block: {
              id: "projected_footer_pages",
              type: "footerSection",
              label: "Pages",
              placements: [
                {
                  id: "projected_place_footer_home",
                  order: 1000,
                  block: {
                    id: "projected_footer_link_home",
                    type: "link",
                    label: "Home",
                    href: "/pages/home",
                    placements: [],
                  },
                },
                {
                  id: "projected_place_footer_work",
                  order: 2000,
                  block: {
                    id: "projected_footer_link_work",
                    type: "link",
                    label: "Work",
                    href: "/pages/work",
                    placements: [],
                  },
                },
              ],
            },
          },
          {
            id: "projected_place_footer_social",
            order: 2000,
            block: {
              id: "projected_footer_social",
              type: "footerSocial",
              label: "Social",
              placements: [
                {
                  id: "projected_place_footer_github",
                  order: 1000,
                  block: {
                    id: "projected_footer_link_github",
                    type: "link",
                    label: "GitHub",
                    href: "https://github.com/dpeek",
                    icon: "github",
                    placements: [],
                  },
                },
                {
                  id: "projected_place_footer_linkedin",
                  order: 2000,
                  block: {
                    id: "projected_footer_link_linkedin",
                    type: "link",
                    label: "LinkedIn",
                    href: "https://www.linkedin.com/in/dpeek/",
                    icon: "linkedin",
                    placements: [],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    page: {
      id: "projected_page_home",
      type: "page",
      label: "Build public sites from runtime projections.",
      body: "Astryx receives a **projected public Site tree**. Formless remains responsible for projection, routes, media delivery, public challenge facts, and submission helpers.",
      placements: [
        {
          id: "projected_place_intro_section",
          order: 1000,
          block: {
            id: "projected_section_intro",
            type: "section",
            label: "Projection first",
            body: "The page is composed from ordered public placement output instead of raw Site storage records.\n\n- Header and footer frame roots stay projected facts.\n- Nested placements render without nested stored records.",
            placements: [
              {
                id: "projected_place_intro_media",
                order: 1000,
                slot: "media",
                block: {
                  id: "projected_image_delivery",
                  type: "image",
                  label: "Runtime media delivery",
                  href: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
                  media: {
                    assetId: "media_astryx_workspace",
                    href: "/media/media_astryx_workspace/public/workspace.jpg",
                    kind: "image",
                  },
                  width: 1200,
                  height: 800,
                  placements: [],
                },
              },
              {
                id: "projected_place_intro_metrics",
                order: 2000,
                block: {
                  id: "projected_metric_grid_runtime",
                  type: "metricGrid",
                  label: "Runtime proof points",
                  placements: [
                    {
                      id: "projected_place_metric_projection",
                      order: 1000,
                      block: {
                        id: "projected_metric_projection",
                        type: "metric",
                        label: "1 tree",
                        body: "One public projection feeds the page, frame roots, warnings, and operation facts.",
                        color: "#2563eb",
                        placements: [],
                      },
                    },
                    {
                      id: "projected_place_metric_records",
                      order: 2000,
                      block: {
                        id: "projected_metric_records",
                        type: "metric",
                        label: "0 records",
                        body: "The Astryx slice does not receive raw Authority records or replica state.",
                        color: "#16a34a",
                        placements: [],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          id: "projected_place_card_section",
          order: 2000,
          block: {
            id: "projected_section_capabilities",
            type: "section",
            label: "Renderer responsibilities",
            body: "Astryx owns visual rendering for public content blocks while runtime boundaries stay outside the package.",
            placements: [
              {
                id: "projected_place_card_grid",
                order: 1000,
                block: {
                  id: "projected_card_grid_capabilities",
                  type: "cardGrid",
                  label: "Projected block coverage",
                  placements: [
                    {
                      id: "projected_place_card_markdown",
                      order: 1000,
                      block: {
                        id: "projected_card_markdown",
                        type: "card",
                        label: "Markdown",
                        body: "Read-only markdown remains public page content.",
                        icon: cardIconSource,
                        color: "#7c3aed",
                        placements: [],
                      },
                    },
                    {
                      id: "projected_place_card_media",
                      order: 2000,
                      block: {
                        id: "projected_card_media",
                        type: "card",
                        label: "Media",
                        body: "Core media delivery facts win before manual image href fallback.",
                        icon: cardIconSource,
                        color: "#0891b2",
                        placements: [],
                      },
                    },
                    {
                      id: "projected_place_card_forms",
                      order: 3000,
                      block: {
                        id: "projected_card_forms",
                        type: "card",
                        label: "Public forms",
                        body: "Projected operation routes, public challenges, and field metadata stay display-safe.",
                        icon: cardIconSource,
                        color: "#dc2626",
                        placements: [],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          id: "projected_place_public_forms",
          order: 3000,
          block: {
            id: "projected_section_public_forms",
            type: "section",
            label: "Public operations",
            body: "Fixed Site forms and generic public operation forms are represented by projected public operation facts only.",
            placements: [
              {
                id: "projected_place_subscribe",
                order: 1000,
                block: {
                  id: "projected_form_subscribe",
                  type: "subscribeForm",
                  label: "Subscribe for launch notes",
                  body: "Get a short email when the public renderer migration changes.",
                  operationName: "subscribe",
                  buttonLabel: "Subscribe",
                  publicOperation: {
                    entityName: "subscription",
                    operationName: "subscribe",
                    canonicalKey: "subscription.subscribe",
                    target: crmTarget,
                    route: "/api/app-installs/crm/crm/public/operations/subscription/subscribe",
                    challenge: publicChallenge,
                  },
                  placements: [],
                },
              },
              {
                id: "projected_place_contact",
                order: 2000,
                block: {
                  id: "projected_form_contact",
                  type: "contactForm",
                  label: "Contact the team",
                  body: "Send a public-safe contact message without exposing provider delivery state.",
                  operationName: "send",
                  buttonLabel: "Send message",
                  successLabel: "Message received.",
                  nameLabel: "Name",
                  emailLabel: "Email",
                  messageLabel: "Message",
                  publicOperation: {
                    entityName: "contactMessage",
                    operationName: "send",
                    canonicalKey: "contactMessage.send",
                    target: siteTarget,
                    route: "/api/site/public/operations/contactMessage/send",
                    challenge: publicChallenge,
                  },
                  placements: [],
                },
              },
              {
                id: "projected_place_public_operation",
                order: 3000,
                block: {
                  id: "projected_form_public_operation",
                  type: "publicOperationForm",
                  label: "Request a workspace review",
                  body: "This generic form comes from projected public-safe operation input metadata.",
                  operationKey: "workspaceReview.request",
                  buttonLabel: "Request review",
                  successLabel: "Review request received.",
                  publicOperation: {
                    entityName: "workspaceReview",
                    operationName: "request",
                    canonicalKey: "workspaceReview.request",
                    target: crmTarget,
                    route: "/api/app-installs/crm/crm/public/operations/workspaceReview/request",
                    challenge: publicChallenge,
                    fields: [
                      {
                        name: "name",
                        label: "Name",
                        required: true,
                        control: "text",
                      },
                      {
                        name: "email",
                        label: "Email",
                        required: true,
                        control: "text",
                        format: "email",
                      },
                      {
                        name: "phone",
                        label: "Phone",
                        required: false,
                        control: "text",
                        format: "phone",
                      },
                      {
                        name: "summary",
                        label: "Project summary",
                        required: true,
                        control: "longText",
                      },
                      {
                        name: "hasExistingSite",
                        label: "Existing public site",
                        required: false,
                        control: "boolean",
                      },
                      {
                        name: "preferredDate",
                        label: "Preferred review date",
                        required: false,
                        control: "date",
                      },
                      {
                        name: "budget",
                        label: "Monthly budget",
                        required: false,
                        control: "number",
                      },
                      {
                        name: "timeline",
                        label: "Launch timeline",
                        required: true,
                        control: "enum",
                        options: [
                          { value: "now", label: "Now" },
                          { value: "quarter", label: "This quarter" },
                          { value: "later", label: "Later" },
                        ],
                      },
                      {
                        name: "referral",
                        label: "How did you hear about us?",
                        required: false,
                        control: "text",
                        suggestions: ["Search", "Referral", "Conference"],
                      },
                    ],
                  },
                  placements: [],
                },
              },
              {
                id: "projected_place_unavailable_subscribe",
                order: 4000,
                block: {
                  id: "projected_form_unavailable_subscribe",
                  type: "subscribeForm",
                  label: "Legacy list",
                  body: "This block intentionally has no projected operation facts.",
                  operationName: "legacySubscribe",
                  buttonLabel: "Join list",
                  placements: [],
                },
              },
              {
                id: "projected_place_unavailable_contact",
                order: 5000,
                block: {
                  id: "projected_form_unavailable_contact",
                  type: "contactForm",
                  label: "Archived inbox",
                  body: "This contact block intentionally has no projected operation facts.",
                  operationName: "sendArchived",
                  buttonLabel: "Send message",
                  nameLabel: "Name",
                  emailLabel: "Email",
                  messageLabel: "Message",
                  placements: [],
                },
              },
            ],
          },
        },
      ],
    },
    meta: {
      slug: "home",
      generatedAt: "2026-07-08T00:00:00.000Z",
      warnings: [
        {
          code: "publicOperationUnavailable",
          recordId: "projected_form_unavailable_subscribe",
          message:
            'Subscribe form "Legacy list" does not expose a public operation route in this projection.',
        },
        {
          code: "publicOperationUnavailable",
          recordId: "projected_form_unavailable_contact",
          message:
            'Contact form "Archived inbox" does not expose a public operation route in this projection.',
        },
      ],
    },
    route: {
      kind: "page",
      slug: "home",
    },
  },
  routeFacts: {
    linkMode: "installed",
    routeBase: "/sites/astryx",
    currentPath: "/sites/astryx/pages/home",
  },
  formStates: [
    {
      blockId: "projected_form_subscribe",
      state: "valid",
    },
    {
      blockId: "projected_form_subscribe",
      state: "submitting",
    },
    {
      blockId: "projected_form_contact",
      state: "valid",
    },
    {
      blockId: "projected_form_contact",
      state: "success",
      message: "Message received.",
    },
    {
      blockId: "projected_form_contact",
      state: "failed",
      message: "Message was not sent. Try again.",
    },
    {
      blockId: "projected_form_public_operation",
      state: "valid",
    },
    {
      blockId: "projected_form_public_operation",
      state: "submitting",
    },
    {
      blockId: "projected_form_public_operation",
      state: "success",
      message: "Review request received.",
    },
    {
      blockId: "projected_form_unavailable_subscribe",
      state: "unavailable",
      warningCode: "publicOperationUnavailable",
      message: "Subscribe form unavailable.",
    },
    {
      blockId: "projected_form_public_operation",
      state: "failed",
      message: "Request failed. Try again.",
    },
    {
      blockId: "projected_form_unavailable_contact",
      state: "unavailable",
      warningCode: "publicOperationUnavailable",
      message: "Contact form unavailable.",
    },
  ],
} satisfies AstryxProjectedSitePageFixture;
