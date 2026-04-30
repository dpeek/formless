import { z } from "zod";

export const Limit = {
  /**
   * The current Replicache schema version. Update after changes to the schema for force client cache clear.
   */
  Version: 14,
  /**
   * The maximum OTP age in milliseconds.
   *
   * Currently 24 hours
   **/
  LoginCodeMaxAge: 86_400_000,
  /**
   * Maximum session age in milliseconds.
   *
   * After this we force user to reauthenticate.
   *
   * Currently 30 days
   **/
  SessionMaxAge: 2_592_000_000,
  /**
   * The number of days in the free trial
   **/
  FreeTrialDays: 30,

  /**
   * The number of days into the free trial before we start reminding user to upgrade
   *
   * Currently 5 days
   **/
  FreeTrialHoneymoonPeriod: 432_000_000,

  /**
   * The number of days before we first ask a user for feedback
   *
   * Currently 14 days
   **/
  SurveyUserAfterDays: 1_209_600_000,

  /**
   * The number of days before we ask user for feedback again
   *
   * Currently 90 days
   **/
  SurveyUserRepeatPeriod: 7_776_000_000,

  /**
   * The maximum age an invite can be before it is considered invalid.
   *
   * Currently 5 days
   **/
  InviteMaxAge: 432_000_000,
  /**
   * Delay in milliseconds before sending invite reminder.
   *
   * Currently 5 days
   **/
  ReminderDelay: 432_000_000,

  /**
   * User email max length
   **/
  UserEmail: 254,
  /**
   * User name max length
   **/
  UserName: 32,
  /**
   * User profession max length
   **/
  UserProfession: 32,
  /**
   * User max spaces
   **/
  UserSpaces: 10,
  /**
   * Account name max length
   **/
  AccountName: 32,
  /**
   * Card name max length
   **/
  CardName: 20,
  /**
   * Theme name max length
   **/
  ThemeName: 20,
  /**
   * Resource name max length
   **/
  ResourceName: 32,
  /**
   * Theme header max length
   **/
  ThemeHeader: 60,
  /**
   * Theme footer max length
   **/
  ThemeFooter: 60,
  /**
   * Space name max length
   **/
  SpaceName: 32,
  /**
   * Max space deals
   **/
  SpaceDeals: 200,
  /**
   * Max space deals (starter plan)
   **/
  SpaceDealsStarter: 10,

  /**
   * Max space deal templates
   **/
  SpaceDealTemplates: 20,
  /**
   * Max space deal templates (starter plan)
   **/
  SpaceDealTemplatesStarter: 10,

  /**
   * Max space themes
   **/
  SpaceThemes: 10,
  /**
   * Max space themes
   **/
  SpaceVertical: 32,
  /**
   * Max space accounts
   **/
  SpaceAccounts: 250,
  /**
   * Max space automations
   **/
  SpaceAutomations: 10,

  /**
   * Max tags per deal
   */
  SpaceTags: 50,
  /**
   * Max resource tags per space
   */
  LibraryResourceTags: 20,
  /**
   * Resource tag name max length
   */
  ResourceTagName: 20,
  /**
   * Deal name max length
   **/

  DealName: 32,
  /**
   * Max deal phases
   **/
  DealPhases: 10,
  /**
   * Max deal target price
   **/
  DealTargetPrice: 1_000_000_000,
  /**
   * Max deal variables
   */
  DealVariables: 20,
  /**
   * Max deal milestones
   **/
  DealMilestones: 8,

  /**
   * Max character length of a tag
   */
  TagName: 24,

  /**
   * Max tags per feature/task
   */
  FeatureTags: 8,

  /**
   * Phase name max length
   **/
  PhaseName: 32,
  /**
   * Max phase features
   **/
  PhaseFeatures: 50,
  /**
   * Feature name max length
   **/
  FeatureName: 60,
  /**
   * Feature description max length
   **/
  FeatureDescription: 240,
  /**
   * Max feature tasks
   **/
  FeatureTasks: 20,
  /**
   * Task description max length
   **/
  TaskDescription: 2048,
  /**
   * Max task estimates
   **/
  TaskEstimates: 15,
  /**
   * Max task allocation amount
   **/
  TaskAllocationAmount: 1000,

  /**
   * Max task assignees
   **/
  TaskAssignees: 5,

  /**
   * Max character length of a comment
   */
  CommentText: 2048,

  /**
   * Max replies to a single comment
   */
  CommentReplies: 24,

  /**
   * Milestone name max length
   **/
  MilestoneName: 32,

  /**
   * Version name max length
   **/
  VersionName: 32,

  /**
   * Version name max length
   **/
  VersionDescription: 64,

  /**
   * Milestone description max length
   **/
  MilestoneDescription: 255,

  /**
   * Milestone terms max length
   **/
  MilestoneTerms: 512,

  /**
   * Max phase overheads
   **/
  PhaseOverheads: 20,
  /**
   * Max library resources
   **/
  LibraryResources: 50,
  /**
   * Max library cards
   **/
  LibraryCards: 10,
  /**
   * Max resource rate
   **/
  ResourceRate: 100_000,
  /**
   * Max resource allocations
   **/
  ResourceAllocations: 20,
  /**
   * Max stream allocation amount
   **/
  AllocationAmount: 50,
  /**
   * Max product rate ranges
   **/
  ProductRateRanges: 10,
  /**
   * Max number of guests (viewers) for first paid seat (member)
   **/
  GuestsPerFirstSeat: 5,

  /**
   * Max number of guests (viewers) per additional paid seat (member)
   **/
  GuestsPerAdditionalSeat: 2,

  /**
   * Max length of csrf
   **/
  CSRF: 64,
  /**
   * The current deal forecast schema version
   */
  DealForecastVersion: 5,

  /**
   * Category name max length
   */
  CategoryName: 32,
  /**
   * Category description max length
   */
  CategoryDescription: 240,
  /**
   * Section name max length
   */
  SectionName: 60,
  /**
   * Section description max length
   */
  SectionDescription: 240,
  /**
   * Phase template name max length
   */
  PhaseTemplateName: 32,
  /**
   * Phase template description max length
   */
  PhaseTemplateDescription: 240,

  /**
   * Max categories per phase
   */
  PhaseCategories: 5,
  /**
   * Max sections per category
   */
  CategorySections: 5,
  /**
   * Max phase templates per space
   */
  SpacePhaseTemplates: 10,
};

export const resourceKindValues = ["generic", "role", "stream", "product"] as const;
export const resourceKindSchema = z.enum(resourceKindValues);

export const nodeBaseSchema = z.object({
  /**
   * A unique identifier for the node
   */
  id: z.string(),
  /**
   * Incrementing node version
   */
  version: z.number().default(1),
  /**
   * The times at which the node was created
   */
  created: z.number().default(() => Date.now()),
  /**
   * The time at which the node was updated
   */
  updated: z.number().default(() => Date.now()),
  /**
   * The time at which the node was deleted, or zero if not deleted
   */
  deleted: z.number().default(0),
  /**
   * Reference to an ID from another, external system
   */
  external_id: z.optional(z.string()),
});

export const currencyValues = [
  "aud",
  "brl",
  "cad",
  "chf",
  "eur",
  "gbp",
  "inr",
  "jpy",
  "mxn",
  "nzd",
  "sgd",
  "usd",
  "zar",
] as const;

export const currencySchema = z.enum(currencyValues);

export const defaultTagColor = "#0091FF";

export const backgroundTypeSchema = z.enum(["color", "gradient"]);

export type BackgroundType = z.infer<typeof backgroundTypeSchema>;

export const cornerTypeSchema = z.enum(["square", "rounded", "circular"]);

export type CornerType = z.infer<typeof cornerTypeSchema>;

export const themeSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type.
   */
  type: z.literal("theme").default("theme"),
  /**
   * The order of the node in its list.
   */
  order: z.number().default(0.5),
  /**
   * The name of the theme.
   */
  name: z.string().max(Limit.ThemeName).default(""),
  logo_image: z.nullable(z.string()).default(null),
  background_image: z.nullable(z.string()).default(null),
  background_type: backgroundTypeSchema.default("color"),
  background_color: z.string().default("#1E4B55"),
  foreground_color: z.string().default("#FFFFFF"),
  gradient1_color: z.string().default("#1E4B55"),
  gradient2_color: z.string().default("#173E4C"),
  text_primary_color: z.string().default("#F2FCFF"),
  text_secondary_color: z.string().default("#C3C4C4"),
  text_branded_color: z.string().default("#64CDAD"),
  shape_color: z.string().default("#64CDAD"),
  shape_hover_color: z.string().default("#93BD43"),
  shape_text_color: z.string().default("#000000"),
  shape_corner_type: cornerTypeSchema.default("circular"),
  gradient_rotation: z.number().default(0),
  background_image_blur: z.number().default(0),
  background_image_opacity: z.number().default(1),
  font_name: z.string().default("Source Sans 3"),
  title_font_name: z.optional(z.string()).default("Source Sans 3"),
  title_font_weight: z.optional(z.string()).default("600"),
  title_font_style: z.optional(z.string()).default("normal"),
  header_right: z.string().max(Limit.ThemeHeader).default("Estii Studios"),
  footer_right: z.string().max(Limit.ThemeFooter).default("Commercial in Confidence"),
  branding_theme: z.optional(z.union([z.literal("dark"), z.literal("light")])),
});

export type Theme = z.infer<typeof themeSchema>;

export const accountSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type.
   */
  type: z.literal("account").default("account"),
  /**
   * The order of the node in its list.
   */
  order: z.number().default(0.5),
  /**
   * The name of the customer account in the space.
   */
  name: z.string().max(Limit.AccountName).default(""),
});

export type Account = z.infer<typeof accountSchema>;

export const flagTypeSchema = z.enum([
  "delivery_mode",
  "client_mode",
  "deal_probability",
  "multiple_phases",
  "priorities",
  "risks",
  "task_assignees",
  "tags",
  "presence",
  "inbox",
  "activity_feed",
  // 'margins',
  // 'payment_milestones',
  // 'progress_status',
  // 'deal_templates',
]);

export type FlagType = z.infer<typeof flagTypeSchema>;

export const spaceSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type.
   */
  type: z.literal("space").default("space"),
  /**
   * The name of the space.
   *
   * @deprecated
   */
  name: z.optional(z.string().max(Limit.SpaceName)),
  /**
   * The default currency of the space, all rates and deals are priced in it.
   */
  currency: currencySchema.default("usd"),
  /**
   * The default rounding to apply to deal rate cards.
   */
  rounding: z.number().default(1),
  /**
   * The default period in which to display role rates.
   */
  work_unit: z.enum(["day", "hour"]).default("day"),
  /**
   * Contingency to add to risk 0
   */
  contingency_none: z.number().default(0),
  /**
   * Contingency to add to risk 1
   */
  contingency_low: z.number().default(0.1),
  /**
   * Contingency to add to risk 2
   */
  contingency_normal: z.number().default(0.15),
  /**
   * Contingency to add to risk 3
   */
  contingency_high: z.number().default(0.2),
  /**
   * Whether a user completed onboarding, or dismissed the onboarding panel.
   */
  onboarded: z.boolean().default(false),
  /**
   * When estimating role resources, the number of hours allocated
   * when the estimation unit is in "day" is:
   *
   * `amount * space.work_hours_per_day`
   */
  work_hours_per_day: z.number().default(8),
  /**
   * When estimating role resources, the number of hours allocated
   * when the estimation unit is in "week" is:
   *
   * `amount * space.work_days_per_week * space.work_hours_per_day`
   */
  work_days_per_week: z.number().default(5),
  /**
   * When estimating role resources, the number of hours allocated
   * when the estimation unit is in "year" is:
   *
   * `amount * * space.work_weeks_per_year * space.work_days_per_week * space.work_hours_per_day`
   */
  work_weeks_per_year: z.number().default(48),

  /**
   * The default probability of winning a draft deal
   */
  probability_draft: z.optional(z.number()).default(0.25),
  /**
   * The default probability of winning an approved deal
   */
  probability_approved: z.optional(z.number()).default(0.5),
  /**
   * The probability of winning a progressed deal
   */
  probability_progressed: z.optional(z.number()).default(0.75),
  /**
   * The list of preset probabilities for a progressed deal
   * Defaults to (10%, 25%, 50%, 75%, 90%)
   */
  probability_options: z.optional(z.array(z.number())).default(() => [0.1, 0.25, 0.5, 0.75, 0.9]),

  /**
   * Feature flags set in this space
   */
  flags: z.optional(z.record(flagTypeSchema, z.boolean())).default({} as any),

  /**
   * Terminology for the space
   */

  terminology: z.optional(z.record(z.string(), z.string())).default({}),

  /**
   * If this space was retimed during import, this was the value of `Date.now()` at the time.
   */
  now: z.number().optional(),
});

export type Space = z.infer<typeof spaceSchema>;

export const conditionSchema = z.object({
  id: z.string(),
  op: z.enum(["set", "changed", "is", "is_not", "was", "was_not"]),
  field: z.string(),
  value: z.nullable(z.string()),
});

export type AutomationCondition = z.infer<typeof conditionSchema>;

export const propertySchema = z.object({
  id: z.string(),
  get: z.string(),
  set: z.string(),
});

export type AutomationProperty = z.infer<typeof propertySchema>;

export const providerSchema = z.enum(["estii", "salesforce", "slack"]);

export const actionSchema = z.object({
  id: z.string(),
  hook_id: z.string(),
  properties: z.array(propertySchema),
});

export type AutomationAction = z.infer<typeof actionSchema>;

export const automationSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type.
   */
  type: z.literal("automation").default("automation"),
  order: z.number().default(0.5),
  active: z.boolean().default(false),
  /**
   * The event that will trigger the automation to run
   */
  hook_id: z.string().default("estii_deal_updated"),
  /**
   * An array of conditions that must all evaluate to true for the automation to run.
   */
  conditions: z.array(conditionSchema).default(() => []),
  /**
   * An array of properties that configure the action.
   */
  actions: z.array(actionSchema).default(() => []),
});

export type Automation = z.infer<typeof automationSchema>;

export const integrationSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type
   */
  type: z.literal("integration").default("integration"),
  /**
   * The id of the integration service for this integration.
   */
  service_id: z.string(),
  /**
   * The settings for the integration
   */
  settings: z.record(z.string(), z.string()).default(() => ({})),
  /**
   * The creator of the integration
   */
  creator: z.string(),
});

export type Integration = z.infer<typeof integrationSchema>;

export const tagSchema = nodeBaseSchema.extend({
  type: z.literal("tag").default("tag"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),

  /**
   * The contents of the comment
   */
  name: z.string().max(Limit.TagName).default(""),
  /**
   * The color of the tag
   */
  color: z.string().default(defaultTagColor),
});

export type Tag = z.infer<typeof tagSchema>;

export const resourceTagSchema = nodeBaseSchema.extend({
  type: z.literal("resource_tag").default("resource_tag"),
  /**
   * The kind of resource this tag applies to (separate pools)
   */
  kind: z.enum(["role", "product"]),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The name of the resource tag
   */
  name: z.string().max(Limit.ResourceTagName).default(""),
  /**
   * The color of the tag
   */
  color: z.string().default(defaultTagColor),
  /**
   * The count of resources with this tag
   */
  count: z.number().default(0),
});

export type ResourceTag = z.infer<typeof resourceTagSchema>;

export type IntegrationOption = {
  value: string;
  label: string;
};

export type IntegrationField = {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options: IntegrationOption[];
  help?: string;
};

export type IntegrationHook = {
  id: string;
  type: "action" | "event";
  name: string;
  description: string;
};

export type IntegrationService = {
  id: "estii" | "salesforce" | "slack" | "zapier" | "clickup" | "jira" | "webhook";
  name: string;
  description: string;
  state: "system" | "inactive" | "active" | "preview";
  hooks: IntegrationHook[];
  fields: IntegrationField[];
  integration?: Integration;
  tags: Array<"automation" | "export">;
};

export type FeatureFlag = {
  id: FlagType;
  name: string;
  description: string;
  value: boolean;
  group?: string;
};

export const presenceSchema = nodeBaseSchema.extend({
  type: z.literal("presence").default("presence"),
  user_id: z.string(),
  path: z.string(),
  category_id: z.nullable(z.string()).default(null),
  section_id: z.nullable(z.string()).default(null),
  feature_id: z.nullable(z.string()).default(null),
  task_id: z.nullable(z.string()).default(null),
  block_id: z.nullable(z.string()).default(null),
  focus_id: z.nullable(z.string()).default(null),
});

export type Presence = z.infer<typeof presenceSchema>;

export const phaseTemplateSchema = nodeBaseSchema.extend({
  type: z.literal("phase_template").default("phase_template"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The display name of the phase template
   */
  name: z.string().max(Limit.PhaseTemplateName).default(""),
  /**
   * Optional description of the phase template
   */
  description: z.optional(z.string().max(Limit.PhaseTemplateDescription)),
  /**
   * Whether this is the default template applied to new phases
   */
  is_default: z.boolean().default(false),
});

export type PhaseTemplate = z.infer<typeof phaseTemplateSchema>;

const categoryProposalValueSchema = z.enum(["include", "exclude", "isolate"]).default("include");

export const categoryProposalSchema = z.object({
  breakdown: categoryProposalValueSchema,
  recurring: categoryProposalValueSchema,
  scope: categoryProposalValueSchema,
  sections: categoryProposalValueSchema,
});

export type CategoryProposal = z.infer<typeof categoryProposalSchema>;

export const categoryTemplateSchema = nodeBaseSchema.extend({
  type: z.literal("category_template").default("category_template"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The phase template to which this category template belongs
   */
  phase_template_id: z.string(),
  /**
   * The display name of the category template
   */
  name: z.string().max(Limit.CategoryName).default(""),
  /**
   * Optional description
   */
  description: z.optional(z.string().max(Limit.CategoryDescription)),
  /**
   * The resource kinds allowed (empty means allow all)
   */
  resource_kinds: z.array(resourceKindSchema).default(() => []),
  /**
   * Whether fixed-price features are allowed
   */
  allow_fixed: z.boolean().default(true),
  /**
   * Whether recurring features are allowed
   */
  allow_recurring: z.boolean().default(true),
  /**
   * Proposal presentation controls for this category template
   */
  proposal: categoryProposalSchema.default({} as any),
  /**
   * Whether a matching Category node is automatically created when this template is applied
   */
  auto_create: z.boolean().default(true),
});

export type CategoryTemplate = z.infer<typeof categoryTemplateSchema>;

export const sectionTemplateSchema = nodeBaseSchema.extend({
  type: z.literal("section_template").default("section_template"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The category template to which this section template belongs
   */
  category_template_id: z.string(),
  /**
   * The display name of the section template
   */
  name: z.string().max(Limit.SectionName).default(""),
  /**
   * Optional description
   */
  description: z.optional(z.string().max(Limit.SectionDescription)),
  /**
   * Whether a matching Section node is automatically created when this template is applied
   */
  auto_create: z.boolean().default(true),
});

export const periodValues = ["second", "minute", "hour", "day", "week", "month", "year"] as const;

export const quantityValues = [
  "none",
  "mixed",
  "unit",
  "time",
  "work",
  "data",
  "currency",
] as const;

export const resourceModelValues = ["flat", "unit", "tier", "volume", "stair"] as const;

export type SectionTemplate = z.infer<typeof sectionTemplateSchema>;

export type ResourceKind = z.infer<typeof resourceKindSchema>;

export const resourceModelSchema = z.enum(resourceModelValues);

export type ResourceModel = z.infer<typeof resourceModelSchema>;

export const quantitySchema = z.enum(quantityValues);

export type Quantity = z.infer<typeof quantitySchema>;

export const periodSchema = z.nullable(z.enum(periodValues));

export type Period = z.infer<typeof periodSchema>;

export const cardSchema = nodeBaseSchema.extend({
  type: z.literal("card").default("card"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The name of the rate card
   */
  name: z.string().max(Limit.CardName).default(""),
  /**
   * The minimum margin of the rate card
   */
  margin_min: z.number().default(0.4),
  /**
   * The medium margin of the rate card
   */
  margin_med: z.number().default(0.5),
  /**
   * The maximum margin of the rate card
   */
  margin_max: z.number().default(0.6),
});

export type Card = z.infer<typeof cardSchema>;

export const rateSchema = z.object({
  id: z.string(),
  type: z.literal("rate").default("rate"),
  /**
   * The rate card to which this rate belongs
   */
  card_id: z.string().default("default_card"),
  /**
   * The cost of the rate, in rate.currency, or space.currency if null
   *
   * If null the price will be taken from the default card, or zero
   */
  cost_raw: z.number().default(0),
  cost_unit: z.string(),
  cost_set: z.boolean().default(false),
  cost_amount: z.number().default(0),
  /**
   * The currency of the cost and price
   */
  currency: currencySchema.default("usd"),
  /**
   * The price of the rate, in space.currency
   *
   * If null the price will be calculated from the cost with the rate card margin applied
   */
  price: z.number().default(0),
  cost: z.number().default(0),
  price_set: z.boolean().default(false),
  unit: z.string(),
  amount: z.number().default(1),
  max_units: z.number().default(0),
});

export type Rate = z.infer<typeof rateSchema>;

export const allocationSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type.
   */
  type: z.literal("allocation").default("allocation"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The resource to which the allocation belongs
   */
  resource_id: z.string(),
  /**
   * The allocation amount as a ratio
   */
  amount: z.number().default(1),
  /**
   * The resource to allocate
   */
  target_resource_id: z.string(),
  /**
   * Whether the target resource is dedicated it's parent
   */
  dedicated: z.boolean().default(false),
});

export type Allocation = z.infer<typeof allocationSchema>;

export const resourceSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type.
   */
  type: z.literal("resource").default("resource"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The kind of resource:
   *
   * - "role" for human resources
   * - "stream" for teams are groups of roles
   * - "product" for service / expense resources
   */
  kind: resourceKindSchema.default("role"),
  /**
   * The name of the resource
   */
  name: z.string().max(Limit.ResourceName).default(""),
  /**
   * The rates chargeable for the resource
   */
  rates: z.array(rateSchema).default(() => []),
  /**
   * The pricing model
   */
  model: z.optional(resourceModelSchema),
  /**
   * The pricing unit
   */
  unit: z.optional(z.string()),
  /**
   * The pricing period
   */
  period: periodSchema.default(null),
  /**
   * The pricing margin
   */
  margin: z.optional(z.number()),
  /**
   * The quantity of the resource
   */
  quantity: quantitySchema.default("work"),
  /**
   * Optional reference to ResourceTag.id (roles and products only)
   */
  tag_id: z.optional(z.nullable(z.string())),
});

export type Resource = z.infer<typeof resourceSchema>;

export type AllocationTree = Allocation & { resource: ResourceTree };
export type ResourceTree = Resource & { allocations: AllocationTree[] };

export const categoryLegacyValues = ["feature", "overhead", "service", "expense"] as const;

export const Priority = {
  None: 0,
  Low: 1,
  Normal: 2,
  High: 3,
  Critical: 4,
} as const;

export const Risk = {
  None: 0,
  Low: 1,
  Normal: 2,
  High: 3,
} as const;

export const dealAvatarColorValues = [
  "#0091FF",
  "#68DDFD",
  "#99D52A",
  "#F5D90A",
  "#8E4EC6",
  "#AB4ABA",
  "#D6409F",
  "#E5484D",
  "#E54D2E",
  "#E93D82",
  "#F76808",
  "#FFB224",
  "#05A2C2",
  "#12A594",
  "#30A46C",
  "#333333",
  "#3E63DD",
  "#46A758",
  "#6E56CF",
  "#978365",
  "#FFFFFF",
  "#000000",
];

export const sectionParamsSchema = z.record(z.string(), z.any());

export type SectionParams = z.infer<typeof sectionParamsSchema>;

export const deckParamsSchema = z.record(z.string(), sectionParamsSchema).default(() => ({}));

export type DeckParams = z.infer<typeof deckParamsSchema>;

export const dealStatusSchema = z
  .enum(["draft", "approved", "progressed", "won", "lost", "abandoned"])
  .default("draft");

export type DealStatus = z.infer<typeof dealStatusSchema>;

export const milestoneDateRoundingSchema = z.enum(["day", "week", "month"]);

export type MilestoneDateRounding = z.infer<typeof milestoneDateRoundingSchema>;

export const milestoneKindSchema = z.enum([
  "none",
  "start",
  "end",
  "halves",
  "thirds",
  "quarters",
  "fifths",
  "sixths",
  "fortnightly",
  "fortnightly_split",
  "monthly",
  "monthly_split",
  "quarterly",
  "quarterly_split",
  "custom",
]);

export type MilestoneKind = z.infer<typeof milestoneKindSchema>;

export const milestonePeriodSchema = z.enum(["week", "fortnight", "month", "quarter"]);
export type MilestonePeriod = z.infer<typeof milestonePeriodSchema>;

export const breakdownTypes = [
  "priority",
  "category",
  "feature",
  "tag",
  "risk",
  "role",
  "role_tag",
  "stream",
  "product",
  "product_tag",
  "section",
  "resource_type",
  "estimate_type",
] as const;

export const breakdownTypeSchema = z.enum(breakdownTypes);
export type BreakdownType = z.infer<typeof breakdownTypeSchema>;

export const exchangeRateSchema = z.object({
  from: currencySchema,
  to: currencySchema,
  rate: z.number(),
});

export const dealSchema = nodeBaseSchema.extend({
  /**
   * String representing the node's type.
   */
  type: z.literal("deal").default("deal"),
  /**
   * The order of the deal in the customers pipeline
   */
  order: z.number().default(0.5),
  /**
   * The id of the space to which the deal belongs
   */
  space_id: z.string(),
  /**
   * The name of the deal
   */
  name: z.string().max(Limit.DealName).default(""),
  /**
   * The id of the account for the deal
   */
  account_id: z.nullable(z.string()).default(null),
  /**
   * The key of the deal's avatar in files KV, or null if no avatar is set
   */
  avatar: z.nullable(z.string()).default(null),
  /**
   * The color of the deal icon (should be avatar_color)
   */
  avatar_color: z.string().default("#0091FF"),
  /**
   * The icon of the deal avatar (should be avatar_icon)
   */
  avatar_icon: z.string().default("LetterD"),
  /**
   * The cost of the deal, in space.currency (updated by client model)
   */
  cost: z.number().default(0),
  /**
   * The price of the deal, in space.currency (updated by client model)
   */
  price: z.number().default(0),
  /**
   * The margin of the deal, (updated by client model)
   */
  margin: z.number().default(0),
  /**
   * The max number of roles required for the deal, (updated by client model)
   */
  roles: z.number().default(0),
  /**
   * Contingency to add to risk 0
   */
  contingency_none: z.number().default(0),
  /**
   * Contingency to add to risk 1
   */
  contingency_low: z.number().default(0.1),
  /**
   * Contingency to add to risk 2
   */
  contingency_normal: z.number().default(0.15),
  /**
   * Contingency to add to risk 3
   */
  contingency_high: z.number().default(0.2),
  /**
   * The capacity settings when last updated
   */
  work_hours_per_day: z.number().default(8),
  work_days_per_week: z.number().default(5),
  work_weeks_per_year: z.number().default(48),

  /**
   * The default period in which to estimate work
   */
  work_unit: z.enum(["day", "hour"]).default("day"),
  /**
   * The currency in which the deal will be presented
   */
  space_currency: currencySchema.default("usd"),
  /**
   * The currency in which the deal will be presented
   */
  currency: currencySchema.default("usd"),
  /**
   * Exchange rates for the deal
   */
  exchange_rates: z.array(exchangeRateSchema).default(() => []),
  /**
   * The rounding to apply to the deal's rate cards
   */
  rounding: z.number().default(1),
  /**
   * The id of the rate card to use for the deal
   */
  card_id: z.string().default("default_card"),
  /**
   * The target gross margin for the deal
   */
  target_margin: z.number().default(0.5),
  /**
   * The target price for the deal, in space.currency
   */
  target_price: z.number().default(0),
  /**
   * The due date for the deal
   */
  due: z.number().default(0),
  /**
   * The estimated start date for the project
   */
  start: z.number().default(0),
  /**
   * The estimated end date for the project (updated by client model)
   */
  end: z.number().default(0),
  /**
   * The workflow status of the Deal
   */
  status: dealStatusSchema,
  /**
   * The likelihood of winning the deal
   */
  probability: z.number().default(0),
  /**
   * Date on which the deal was approved, or zero if not approved
   */
  approved: z.number().default(0),
  /**
   * Date on which the deal was last progressed, or zero if not progressed
   */
  progressed: z.number().default(0),
  /**
   * The date on which the deal was closed, or zero if not closed
   */
  closed: z.number().default(0),
  /**
   * The reason the deal was closed
   */
  closed_reason: z.nullable(z.string()).default(null),
  /**
   * Date on which the deal was archived, or null if not archived
   */
  archived: z.number().default(0),
  /**
   * The id of the theme used to present the deal
   */
  theme_id: z.nullable(z.string()).default(null),
  /**
   * JSON object containing slide parameters used to present the deal
   */
  deck_params: deckParamsSchema,
  /**
   * The dealId to clone in the form of spaces/$spaceId/deals/$dealId
   */
  clone_of: z.nullable(z.string()).default(null),
  /**
   * The date at which the deal was last updated with resources and settings from it's space
   */
  last_updated: z.number().default(0),
  /**
   * Flag to indicate that deal is a template
   */
  template: z.boolean().default(false),
  /**
   * The member who owns the deal (member id)
   */
  owner_id: z.nullable(z.string()).default(null),

  /**
   * The kind of milestones
   */
  milestone_kind: milestoneKindSchema.default("none"),
  /**
   * The settings for calculating milestone date and price
   */
  milestone_date_rounding: milestoneDateRoundingSchema.default("day"),
  milestone_price_rounding: z.number().default(1),

  /**
   * Additional text to include with milestones
   */
  milestone_terms: z.string().default(""),

  /**
   * Optional description for the deal
   */
  description: z.string().default(""),
  /**
   * Display order of scope breakdowns
   */
  breakdowns: z
    .array(breakdownTypeSchema)
    .default(() => ["priority", "feature", "category"] as BreakdownType[]),
  /**
   * If this deal was retimed during import, this was the value of `Date.now()` at the time.
   */
  now: z.number().optional(),

  /**
   * Override default (or space) terminology
   */
  terminology: z.optional(z.record(z.string(), z.string())).default({}),
  /**
   * Snapshot of space resource tags at deal creation/sync time
   */
  resourceTags: z.optional(z.array(z.lazy(() => resourceTagSchema))).default(() => []),
});

export type Deal = z.infer<typeof dealSchema>;

export const distributionSchema = z.enum(["left", "right", "middle", "cycle"]);

export type Distribution = z.infer<typeof distributionSchema>;

export const phaseStartTypeSchema = z.enum(["auto", "deal", "phase", "date"]);

export type PhaseStartType = z.infer<typeof phaseStartTypeSchema>;

export const phaseSchema = nodeBaseSchema.extend({
  type: z.literal("phase").default("phase"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The name of the phase
   */
  name: z.string().max(Limit.PhaseName).default(""),
  /**
   * The ids of the features and streams excluded from phase scope
   */
  exclusions: z.array(z.string()).default(() => []),
  /**
   * The id of the phase rate card
   */
  card_id: z.nullable(z.string()).default(null),
  /**
   * A custom margin to apply to the phase rate card
   */
  card_margin: z.nullable(z.number()).default(null),
  /**
   * The number of scheduled days in the phase
   */
  days: z.number().default(0),
  /**
   * The delivery cycle of the phase, in days (Day 1, Week 5, Fortnight 10, Month 20)
   */
  cycle: z.number().default(1),
  /**
   * The distribution of resources in the phase schedule
   */
  distribution: distributionSchema.default("left"),

  /**
   * The type of dependency for start date
   */
  start_type: phaseStartTypeSchema.default("auto"),
  /**
   * The explicit start date for the phase
   */
  start_date: z.number().default(0),
  /**
   * An optional dependency, either deal id (deal start) or phase id (phase end)
   */
  start_phase_id: z.nullable(z.string()).default(null),
  /**
   * An offset in weeks from the dependency anchor, stored as ms (weeks × time.week)
   */
  start_offset: z.number().default(0),

  /**
   * Optional reference to a space PhaseTemplate
   */
  template_id: z.optional(z.string()),
});

export type Phase = z.infer<typeof phaseSchema>;

export const featureCategorySchema = z.enum(categoryLegacyValues);

export type FeatureCategory = z.infer<typeof featureCategorySchema>;

export const tagReference = z.object({
  id: z.string(),
  name: z.string(),
});

export type TagReference = z.infer<typeof tagReference>;

export const featureSchema = nodeBaseSchema.extend({
  type: z.literal("feature").default("feature"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The phase to which the feature belongs
   */
  phase_id: z.string(),
  /**
   * The name of the feature
   */
  name: z.string().max(Limit.FeatureName).default(""),
  /**
   * The priority of the feature
   */
  priority: z.nativeEnum(Priority).default(0),
  /**
   * The risk of the feature, used to add contingency
   */
  risk: z.nativeEnum(Risk).default(0),
  /**
   * The category of the feature
   * @deprecated replaced by category nodes
   */
  category: z.preprocess((v) => v ?? undefined, featureCategorySchema.optional()),

  /**
   * The optional tags on a feature
   */
  tag_refs: z.optional(z.array(tagReference)).default(() => []),

  /**
   * The section to which the feature belongs (optional during dual-mode, required post-migration)
   */
  section_id: z.optional(z.string()),
});

export type Feature = z.infer<typeof featureSchema>;

export const categorySchema = nodeBaseSchema.extend({
  type: z.literal("category").default("category"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The phase to which the category belongs
   */
  phase_id: z.string(),
  /**
   * The display name of the category
   */
  name: z.string().max(Limit.CategoryName).default(""),
  /**
   * Optional description for the category
   */
  description: z.optional(z.string().max(Limit.CategoryDescription)),
  /**
   * The resource kinds allowed in this category (empty means allow all)
   */
  resource_kinds: z.array(resourceKindSchema).default(() => []),
  /**
   * Whether fixed-price features are allowed in this category
   */
  allow_fixed: z.boolean().default(true),
  /**
   * Whether recurring features are allowed in this category
   */
  allow_recurring: z.boolean().default(true),
  /**
   * Proposal presentation controls for this category
   */
  proposal: categoryProposalSchema.default({} as any),
});

export type Category = z.infer<typeof categorySchema>;

export const sectionSchema = nodeBaseSchema.extend({
  type: z.literal("section").default("section"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The category to which the section belongs
   */
  category_id: z.string(),
  /**
   * The display name of the section
   */
  name: z.string().max(Limit.SectionName).default(""),
  /**
   * Optional description for the section
   */
  description: z.optional(z.string().max(Limit.SectionDescription)),
});

export type Section = z.infer<typeof sectionSchema>;

export const taskSchema = nodeBaseSchema.extend({
  type: z.literal("task").default("task"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The feature to which the task belongs
   */
  feature_id: z.string(),
  /**
   * The name of the task
   */
  name: z.string().default(""),
  /**
   * A description of the task in tiptap JSON
   */
  description: z.string().default(""),
  /**
   * The optional owners of a task
   */
  owner_ids: z.optional(z.array(z.string())).default(() => []),

  /**
   * The optional tags on a task
   */
  tag_refs: z.optional(z.array(tagReference)).default(() => []),

  /**
   * The priority of the task. null = inherit from feature. 0..4 = explicit override (0 = None).
   */
  priority: z.nativeEnum(Priority).nullable().default(null),

  /**
   * The risk of the task. null = inherit from feature. 0..3 = explicit override.
   */
  risk: z.nativeEnum(Risk).nullable().default(null),
});

export const time = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  // 30.4167 * 24 * 60 * 60_000
  month: 2_628_002_880,
  // 12 * 30.4167 * 24 * 60 * 60_000
  year: 31_536_034_560,
} as const;

export const data = {
  B: 1,
  KB: 1_000,
  MB: 1_000_000,
  GB: 1_000_000_000,
  TB: 1_000_000_000_000,
  PB: 1_000_000_000_000_000,
} as const;

export const metric = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
  T: 1_000_000_000_000,
} as const;

export type Task = z.infer<typeof taskSchema>;

export const estimateSchema = nodeBaseSchema.extend({
  type: z.literal("estimate").default("estimate"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The allocation amount as a ratio
   */
  amount: z.number().default(1),
  /**
   * The resource to allocate
   */
  target_resource_id: z.string(),
  /**
   * The task to which the estimate belongs
   */
  task_id: z.string(),
  /**
   * The display units for the estimate (not that amount is stored in base units)
   */
  unit: z.nullable(z.string()),
  /**
   * The time period for the estimate
   */
  period: periodSchema.default(null),
  /**
   * The variable to use for the estimate
   */
  variable_id: z.optional(z.nullable(z.string())).default(null),
});

export type Estimate = z.infer<typeof estimateSchema>;

export const formulaSchema = z.enum([
  "fixed",
  "linear",
  "percent",
  "compound",
  "ease_in",
  "ease_out",
  "ease_in_out",
]);

export type Formula = z.infer<typeof formulaSchema>;

export const variableSchema = nodeBaseSchema.extend({
  type: z.literal("variable").default("variable"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The name of the variable
   */
  name: z.string().default(""),
  /**
   * The formula of the variable
   */
  formula: formulaSchema.default("fixed"),
  unit: z.optional(z.string()).default("unit"),
  value: z.number().default(1),
  period: z.number().default(time.month),
  delta: z.number().default(0),
  delta_period: z.number().default(time.month * 12),
  rounding: z.number().default(0),
});

export type Variable = z.infer<typeof variableSchema>;

export const commentSchema = nodeBaseSchema.extend({
  type: z.literal("comment").default("comment"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),

  /**
   * The task to which the comment belongs (set if comment is on a task)
   */
  task_id: z.optional(z.string()),

  /**
   * The feature to which the comment belongs (set if comment is on a feature)
   */
  feature_id: z.optional(z.string()),

  /**
   * The contents of the comment
   */
  contents: z.string().default(""),

  /**
   * The author of the thread
   */
  member_id: z.string(),

  /**
   * Date on which the comment was resolved, or 0 if open
   */
  resolved: z.number().default(0),

  /**
   * The member (ids) mentioned in the contents
   */
  mentions: z.optional(z.array(z.string())).default(() => []),
});

export type Comment = z.infer<typeof commentSchema>;

export const replySchema = nodeBaseSchema.extend({
  type: z.literal("reply").default("reply"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The contents of the comment
   */
  contents: z.string().default(""),

  /**
   * The comment to which the reply belongs
   */
  comment_id: z.string(),

  /**
   * The member who wrote the reply
   */
  member_id: z.string(),

  /**
   * The member (ids) mentioned in the contents
   */
  mentions: z.optional(z.array(z.string())).default(() => []),
});

export type Reply = z.infer<typeof replySchema>;

export const milestoneSchema = nodeBaseSchema.extend({
  type: z.literal("milestone").default("milestone"),

  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),

  /**
   * The name of the milestone
   */
  name: z.string().max(Limit.MilestoneName).default(""),
  /**
   * A description of the milestone
   */
  description: z.string().default(""),
  /**
   * The phase the milestone is associated with (or null if deal)
   */
  phase_id: z.nullable(z.string()),

  /**
   * The progress within the phase (or deal) as a percentage from 0 - 1
   */
  progress: z.number().default(0),

  /**
   * A fixed date (overrides phase id and progress)
   */
  date: z.number().default(0),
  date_set: z.boolean().default(false),

  /**
   * A period used in combination with date for dynamic milestones
   */
  period: z.nullable(milestonePeriodSchema).default(null),
  period_set: z.boolean().default(false),

  /**
   * A fixed number of days(overrides phase id and progress)
   */
  days: z.number().default(0),
  days_set: z.boolean().default(false),

  /**
   * The percent of total value to assign to the milestone
   */
  percent: z.number().default(0),
  percent_set: z.boolean().default(false),

  /**
   * The value in the space currency
   */
  amount: z.number().default(0),
  amount_set: z.boolean().default(false),
});

export type Milestone = z.infer<typeof milestoneSchema>;

export const versionSchema = nodeBaseSchema.extend({
  type: z.literal("version").default("version"),

  /**
   * The name of the milestone
   */
  name: z.string().max(Limit.VersionName).default(""),
  /**
   * A description of the milestone
   */
  description: z.string().max(Limit.VersionDescription).default(""),

  /**
   * The status of the Deal in this version
   */
  status: dealStatusSchema.default("draft"),

  /**
   * The price of the deal in this version
   */
  price: z.number().default(0),

  /**
   * The user who created the version
   */
  owner: z.nullable(z.string()).default(null),
  /**
   * Users who contributed to the version
   */
  contributors: z.array(z.string()).default(() => []),
});

export type Version = z.infer<typeof versionSchema>;

export type EstimateTree = Estimate & {
  variable: Variable | null;
  resource: ResourceTree;
};
export type CommentTree = Comment & { replies: Reply[] };

export type TaskTree = Task & {
  estimates: EstimateTree[];
  comments: CommentTree[];
};
export type FeatureTree = Feature & { tasks: TaskTree[]; comments: CommentTree[] };
export type SectionTree = Section & { features: FeatureTree[] };
export type CategoryTree = Category & { sections: SectionTree[] };
export type PhaseTree = Phase & {
  features: FeatureTree[];
  categories?: CategoryTree[];
  card?: Card;
};
export type DealTree = Deal & {
  phases: PhaseTree[];
  card: Card;
  milestones: Milestone[];
  tags: TagReference[];
};

export type VariableTree = Variable & {
  min: number;
  max: number;
  maxUnits: number;
  total: number;
  average: number;
  count: number;
  months: { units: number; state: "active" | "inactive" | "extra" }[];
};

export type TagReferenceTree = TagReference & {
  count: number;
  local?: boolean;
  color?: string;
};

// deprecated types

/**
 * @deprecated Use feature.category = 'overhead' as of 2026-02-03
 */
export const overheadSchema = nodeBaseSchema.extend({
  type: z.literal("overhead").default("overhead"),
  /**
   * The order of the node in its list
   */
  order: z.number().default(0.5),
  /**
   * The allocation amount as a ratio
   */
  amount: z.number().default(1),
  /**
   * The resource to allocate
   */
  target_resource_id: z.string(),
  /**
   * The phase to which the overhead belongs
   */
  phase_id: z.string(),
});

/**
 * @deprecated Use feature.category = 'overhead' as of 2026-02-03
 */
export type Overhead = z.infer<typeof overheadSchema>;

/**
 * @deprecated Replaced by feature.category = 'overhead' as of 2026-02-03
 */
export type OverheadTree = Overhead & { resource: ResourceTree };
