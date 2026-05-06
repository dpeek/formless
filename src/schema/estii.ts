/**
 * Estii domain model reference.
 *
 * This module is intentionally type-only. It describes the normalized record
 * shapes and keeps former validation/default details as JSDoc instead of
 * runtime validators.
 */

export type ResourceKind = "generic" | "role" | "stream" | "product";

export type Currency =
  | "aud"
  | "brl"
  | "cad"
  | "chf"
  | "eur"
  | "gbp"
  | "inr"
  | "jpy"
  | "mxn"
  | "nzd"
  | "sgd"
  | "usd"
  | "zar";

export type BackgroundType = "color" | "gradient";
export type CornerType = "square" | "rounded" | "circular";

export type FlagType =
  | "delivery_mode"
  | "client_mode"
  | "deal_probability"
  | "multiple_phases"
  | "priorities"
  | "risks"
  | "task_assignees"
  | "tags"
  | "presence"
  | "inbox"
  | "activity_feed";

export type Provider = "estii" | "salesforce" | "slack";

export type IntegrationServiceId =
  | "estii"
  | "salesforce"
  | "slack"
  | "zapier"
  | "clickup"
  | "jira"
  | "webhook";

export type ProposalValue = "include" | "exclude" | "isolate";

export type PeriodUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
export type Period = PeriodUnit | null;

export type Quantity = "none" | "mixed" | "unit" | "time" | "work" | "data" | "currency";
export type ResourceModel = "flat" | "unit" | "tier" | "volume" | "stair";

export type Priority = 0 | 1 | 2 | 3 | 4;
export type Risk = 0 | 1 | 2 | 3;

export type DealAvatarColor =
  | "#0091FF"
  | "#68DDFD"
  | "#99D52A"
  | "#F5D90A"
  | "#8E4EC6"
  | "#AB4ABA"
  | "#D6409F"
  | "#E5484D"
  | "#E54D2E"
  | "#E93D82"
  | "#F76808"
  | "#FFB224"
  | "#05A2C2"
  | "#12A594"
  | "#30A46C"
  | "#333333"
  | "#3E63DD"
  | "#46A758"
  | "#6E56CF"
  | "#978365"
  | "#FFFFFF"
  | "#000000";

export type SectionParams = Record<string, unknown>;
export type DeckParams = Record<string, SectionParams>;

export type DealStatus = "draft" | "approved" | "progressed" | "won" | "lost" | "abandoned";
export type MilestoneDateRounding = "day" | "week" | "month";

export type MilestoneKind =
  | "none"
  | "start"
  | "end"
  | "halves"
  | "thirds"
  | "quarters"
  | "fifths"
  | "sixths"
  | "fortnightly"
  | "fortnightly_split"
  | "monthly"
  | "monthly_split"
  | "quarterly"
  | "quarterly_split"
  | "custom";

export type MilestonePeriod = "week" | "fortnight" | "month" | "quarter";

export type BreakdownType =
  | "priority"
  | "category"
  | "feature"
  | "tag"
  | "risk"
  | "role"
  | "role_tag"
  | "stream"
  | "product"
  | "product_tag"
  | "section"
  | "resource_type"
  | "estimate_type";

export type Distribution = "left" | "right" | "middle" | "cycle";
export type PhaseStartType = "auto" | "deal" | "phase" | "date";
export type FeatureCategory = "feature" | "overhead" | "service" | "expense";
export type Formula =
  | "fixed"
  | "linear"
  | "percent"
  | "compound"
  | "ease_in"
  | "ease_out"
  | "ease_in_out";

/**
 * Shared fields present on most Estii records.
 */
export interface NodeBase {
  /** Unique node id. */
  id: string;
  /** Incrementing node version. @default 1 */
  version: number;
  /** Creation timestamp in milliseconds. */
  created: number;
  /** Last update timestamp in milliseconds. */
  updated: number;
  /** Deletion timestamp, or 0 while active. @default 0 */
  deleted: number;
  /** Id from another external system. */
  external_id?: string;
}

export interface Theme extends NodeBase {
  type: "theme";
  /** List order. @default 0.5 */
  order: number;
  /** Theme name. @maxLength 20 */
  name: string;
  logo_image: string | null;
  background_image: string | null;
  /** @default "color" */
  background_type: BackgroundType;
  /** @default "#1E4B55" */
  background_color: string;
  /** @default "#FFFFFF" */
  foreground_color: string;
  gradient1_color: string;
  gradient2_color: string;
  text_primary_color: string;
  text_secondary_color: string;
  text_branded_color: string;
  shape_color: string;
  shape_hover_color: string;
  shape_text_color: string;
  /** @default "circular" */
  shape_corner_type: CornerType;
  gradient_rotation: number;
  background_image_blur: number;
  background_image_opacity: number;
  font_name: string;
  title_font_name: string;
  title_font_weight: string;
  title_font_style: string;
  /** Right header text in generated proposal output. @maxLength 60 */
  header_right: string;
  /** Right footer text in generated proposal output. @maxLength 60 */
  footer_right: string;
  branding_theme?: "dark" | "light";
}

export interface Account extends NodeBase {
  type: "account";
  /** List order. @default 0.5 */
  order: number;
  /** Customer account name. @maxLength 32 */
  name: string;
}

export interface Space extends NodeBase {
  type: "space";
  /** @deprecated Space names are no longer the primary display model. @maxLength 32 */
  name?: string;
  /** Default currency for rates and deals. @default "usd" */
  currency: Currency;
  /** Default rate-card rounding. @default 1 */
  rounding: number;
  /** Default period used to display role rates. @default "day" */
  work_unit: "day" | "hour";
  contingency_none: number;
  contingency_low: number;
  contingency_normal: number;
  contingency_high: number;
  /** Whether onboarding was completed or dismissed. */
  onboarded: boolean;
  /** Capacity conversion for day-based estimates. @default 8 */
  work_hours_per_day: number;
  /** Capacity conversion for week-based estimates. @default 5 */
  work_days_per_week: number;
  /** Capacity conversion for year-based estimates. @default 48 */
  work_weeks_per_year: number;
  probability_draft: number;
  probability_approved: number;
  probability_progressed: number;
  /** Preset progressed-deal probabilities. @default [0.1, 0.25, 0.5, 0.75, 0.9] */
  probability_options: number[];
  /** Enabled feature flags for this space. */
  flags: Partial<Record<FlagType, boolean>>;
  /** Space-specific terminology overrides. */
  terminology: Record<string, string>;
  /** Date.now() value used when this space was retimed during import. */
  now?: number;
}

export interface AutomationCondition {
  id: string;
  op: "set" | "changed" | "is" | "is_not" | "was" | "was_not";
  field: string;
  value: string | null;
}

export interface AutomationProperty {
  id: string;
  get: string;
  set: string;
}

export interface AutomationAction {
  id: string;
  hook_id: string;
  properties: AutomationProperty[];
}

export interface Automation extends NodeBase {
  type: "automation";
  /** List order. @default 0.5 */
  order: number;
  active: boolean;
  /** Event hook that triggers the automation. @default "estii_deal_updated" */
  hook_id: string;
  /** Conditions that must all pass before actions run. */
  conditions: AutomationCondition[];
  /** Configured actions for the automation. */
  actions: AutomationAction[];
}

export interface Integration extends NodeBase {
  type: "integration";
  /** Integration service id. */
  service_id: string;
  /** Service-specific settings. */
  settings: Record<string, string>;
  /** Creator user id. */
  creator: string;
}

export interface Tag extends NodeBase {
  type: "tag";
  /** List order. @default 0.5 */
  order: number;
  /** Tag label. @maxLength 24 */
  name: string;
  /** Display color. @default "#0091FF" */
  color: string;
}

export interface ResourceTag extends NodeBase {
  type: "resource_tag";
  /** Resource pool this tag applies to. */
  kind: "role" | "product";
  /** List order. @default 0.5 */
  order: number;
  /** Tag label. @maxLength 20 */
  name: string;
  /** Display color. @default "#0091FF" */
  color: string;
  /** Count of resources with this tag. */
  count: number;
}

export interface IntegrationOption {
  value: string;
  label: string;
}

export interface IntegrationField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options: IntegrationOption[];
  help?: string;
}

export interface IntegrationHook {
  id: string;
  type: "action" | "event";
  name: string;
  description: string;
}

export interface IntegrationService {
  id: IntegrationServiceId;
  name: string;
  description: string;
  state: "system" | "inactive" | "active" | "preview";
  hooks: IntegrationHook[];
  fields: IntegrationField[];
  integration?: Integration;
  tags: Array<"automation" | "export">;
}

export interface FeatureFlag {
  id: FlagType;
  name: string;
  description: string;
  value: boolean;
  group?: string;
}

export interface Presence extends NodeBase {
  type: "presence";
  user_id: string;
  path: string;
  category_id: string | null;
  section_id: string | null;
  feature_id: string | null;
  task_id: string | null;
  block_id: string | null;
  focus_id: string | null;
}

export interface PhaseTemplate extends NodeBase {
  type: "phase_template";
  /** List order. @default 0.5 */
  order: number;
  /** Display name. @maxLength 32 */
  name: string;
  /** Optional description. @maxLength 240 */
  description?: string;
  /** Whether this template is applied to new phases by default. */
  is_default: boolean;
}

export interface CategoryProposal {
  breakdown: ProposalValue;
  recurring: ProposalValue;
  scope: ProposalValue;
  sections: ProposalValue;
}

export interface CategoryTemplate extends NodeBase {
  type: "category_template";
  /** List order. @default 0.5 */
  order: number;
  /** Owning phase template id. */
  phase_template_id: string;
  /** Display name. @maxLength 32 */
  name: string;
  /** Optional description. @maxLength 240 */
  description?: string;
  /** Allowed resource kinds. Empty means all kinds. */
  resource_kinds: ResourceKind[];
  /** Whether fixed-price features are allowed. */
  allow_fixed: boolean;
  /** Whether recurring features are allowed. */
  allow_recurring: boolean;
  /** Proposal presentation controls. */
  proposal: CategoryProposal;
  /** Whether applying this template auto-creates a matching category. */
  auto_create: boolean;
}

export interface SectionTemplate extends NodeBase {
  type: "section_template";
  /** List order. @default 0.5 */
  order: number;
  /** Owning category template id. */
  category_template_id: string;
  /** Display name. @maxLength 60 */
  name: string;
  /** Optional description. @maxLength 240 */
  description?: string;
  /** Whether applying this template auto-creates a matching section. */
  auto_create: boolean;
}

export interface Card extends NodeBase {
  type: "card";
  /** List order. @default 0.5 */
  order: number;
  /** Rate card name. @maxLength 20 */
  name: string;
  /** Minimum margin. @default 0.4 */
  margin_min: number;
  /** Medium margin. @default 0.5 */
  margin_med: number;
  /** Maximum margin. @default 0.6 */
  margin_max: number;
}

export interface Rate {
  id: string;
  type: "rate";
  /** Owning rate card id. @default "default_card" */
  card_id: string;
  /** Raw cost in this rate's currency. */
  cost_raw: number;
  cost_unit: string;
  cost_set: boolean;
  cost_amount: number;
  /** Currency for cost and price. @default "usd" */
  currency: Currency;
  /** Price in space currency. */
  price: number;
  cost: number;
  price_set: boolean;
  unit: string;
  amount: number;
  max_units: number;
}

export interface Allocation extends NodeBase {
  type: "allocation";
  /** List order. @default 0.5 */
  order: number;
  /** Owning resource id. */
  resource_id: string;
  /** Allocation amount as a ratio. */
  amount: number;
  /** Allocated child resource id. */
  target_resource_id: string;
  /** Whether the child resource is dedicated to its parent. */
  dedicated: boolean;
}

export interface Resource extends NodeBase {
  type: "resource";
  /** List order. @default 0.5 */
  order: number;
  /** Role, stream, product, or generic resource. */
  kind: ResourceKind;
  /** Resource name. @maxLength 32 */
  name: string;
  /** Rates chargeable for this resource. */
  rates: Rate[];
  /** Pricing model. */
  model?: ResourceModel;
  /** Pricing unit. */
  unit?: string;
  /** Pricing period. */
  period: Period;
  /** Pricing margin. */
  margin?: number;
  /** Quantity semantics for this resource. @default "work" */
  quantity: Quantity;
  /** Optional ResourceTag id for role and product resources. */
  tag_id?: string | null;
}

export type AllocationTree = Allocation & { resource: ResourceTree };
export type ResourceTree = Resource & { allocations: AllocationTree[] };

export interface ExchangeRate {
  from: Currency;
  to: Currency;
  rate: number;
}

export interface Deal extends NodeBase {
  type: "deal";
  /** Customer pipeline order. @default 0.5 */
  order: number;
  /** Owning space id. */
  space_id: string;
  /** Deal name. @maxLength 32 */
  name: string;
  /** Customer account id. */
  account_id: string | null;
  /** Avatar file key, or null when unset. */
  avatar: string | null;
  /** Deal avatar color. */
  avatar_color: string;
  /** Deal avatar icon. */
  avatar_icon: string;
  /** Client-maintained cost in space currency. */
  cost: number;
  /** Client-maintained price in space currency. */
  price: number;
  /** Client-maintained margin. */
  margin: number;
  /** Client-maintained max role count. */
  roles: number;
  contingency_none: number;
  contingency_low: number;
  contingency_normal: number;
  contingency_high: number;
  work_hours_per_day: number;
  work_days_per_week: number;
  work_weeks_per_year: number;
  /** Default period for work estimates. */
  work_unit: "day" | "hour";
  /** Space currency snapshot. */
  space_currency: Currency;
  /** Presentation currency. */
  currency: Currency;
  /** Exchange rates used by this deal. */
  exchange_rates: ExchangeRate[];
  /** Rate-card rounding. */
  rounding: number;
  /** Rate card id. @default "default_card" */
  card_id: string;
  /** Target gross margin. @default 0.5 */
  target_margin: number;
  /** Target price in space currency. */
  target_price: number;
  /** Due date timestamp. */
  due: number;
  /** Estimated project start timestamp. */
  start: number;
  /** Client-maintained estimated project end timestamp. */
  end: number;
  /** Workflow status. */
  status: DealStatus;
  /** Win probability as a ratio. */
  probability: number;
  /** Approval timestamp, or 0 if not approved. */
  approved: number;
  /** Last progressed timestamp, or 0 if not progressed. */
  progressed: number;
  /** Close timestamp, or 0 if not closed. */
  closed: number;
  /** Reason the deal was closed. */
  closed_reason: string | null;
  /** Archive timestamp, or 0 if not archived. */
  archived: number;
  /** Proposal theme id. */
  theme_id: string | null;
  /** Proposal deck parameters by section. */
  deck_params: DeckParams;
  /** Source deal reference for clones. */
  clone_of: string | null;
  /** Last resource/settings sync timestamp. */
  last_updated: number;
  /** Whether this deal is a reusable template. */
  template: boolean;
  /** Owner member id. */
  owner_id: string | null;
  milestone_kind: MilestoneKind;
  milestone_date_rounding: MilestoneDateRounding;
  milestone_price_rounding: number;
  /** Extra text included with milestones. */
  milestone_terms: string;
  /** Deal description. */
  description: string;
  /** Display order for scope breakdowns. */
  breakdowns: BreakdownType[];
  /** Date.now() value used when this deal was retimed during import. */
  now?: number;
  /** Deal-specific terminology overrides. */
  terminology: Record<string, string>;
  /** Snapshot of space resource tags at deal creation or sync time. */
  resourceTags: ResourceTag[];
}

export interface Phase extends NodeBase {
  type: "phase";
  /** List order. @default 0.5 */
  order: number;
  /** Phase name. @maxLength 32 */
  name: string;
  /** Feature and stream ids excluded from phase scope. */
  exclusions: string[];
  /** Phase rate-card id. */
  card_id: string | null;
  /** Custom margin for the phase rate card. */
  card_margin: number | null;
  /** Scheduled days in this phase. */
  days: number;
  /** Delivery cycle length in days. */
  cycle: number;
  /** Resource distribution across the phase schedule. */
  distribution: Distribution;
  /** Start-date dependency mode. */
  start_type: PhaseStartType;
  /** Explicit phase start timestamp. */
  start_date: number;
  /** Optional dependency, either deal id or phase id. */
  start_phase_id: string | null;
  /** Offset from dependency anchor, stored in milliseconds. */
  start_offset: number;
  /** Optional space PhaseTemplate id. */
  template_id?: string;
}

export interface TagReference {
  id: string;
  name: string;
}

export interface Feature extends NodeBase {
  type: "feature";
  /** List order. @default 0.5 */
  order: number;
  /** Owning phase id. */
  phase_id: string;
  /** Feature name. @maxLength 60 */
  name: string;
  /** Feature priority. 0 is None, 4 is Critical. */
  priority: Priority;
  /** Feature risk. 0 is None, 3 is High. */
  risk: Risk;
  /** @deprecated Replaced by category nodes. */
  category?: FeatureCategory;
  /** Local tag references. */
  tag_refs: TagReference[];
  /** Optional section id during the category/section migration. */
  section_id?: string;
}

export interface Category extends NodeBase {
  type: "category";
  /** List order. @default 0.5 */
  order: number;
  /** Owning phase id. */
  phase_id: string;
  /** Display name. @maxLength 32 */
  name: string;
  /** Optional description. @maxLength 240 */
  description?: string;
  /** Allowed resource kinds. Empty means all kinds. */
  resource_kinds: ResourceKind[];
  /** Whether fixed-price features are allowed. */
  allow_fixed: boolean;
  /** Whether recurring features are allowed. */
  allow_recurring: boolean;
  /** Proposal presentation controls. */
  proposal: CategoryProposal;
}

export interface Section extends NodeBase {
  type: "section";
  /** List order. @default 0.5 */
  order: number;
  /** Owning category id. */
  category_id: string;
  /** Display name. @maxLength 60 */
  name: string;
  /** Optional description. @maxLength 240 */
  description?: string;
}

export interface Task extends NodeBase {
  type: "task";
  /** List order. @default 0.5 */
  order: number;
  /** Owning feature id. */
  feature_id: string;
  /** Task name. */
  name: string;
  /** Tiptap JSON description. */
  description: string;
  /** Owner member ids. */
  owner_ids: string[];
  /** Local tag references. */
  tag_refs: TagReference[];
  /** Null inherits from feature; number is an explicit override. */
  priority: Priority | null;
  /** Null inherits from feature; number is an explicit override. */
  risk: Risk | null;
}

export interface Estimate extends NodeBase {
  type: "estimate";
  /** List order. @default 0.5 */
  order: number;
  /** Allocation amount as a ratio. */
  amount: number;
  /** Allocated resource id. */
  target_resource_id: string;
  /** Owning task id. */
  task_id: string;
  /** Display unit; amount is stored in base units. */
  unit: string | null;
  /** Estimate period. */
  period: Period;
  /** Optional variable id for dynamic estimates. */
  variable_id: string | null;
}

export interface Variable extends NodeBase {
  type: "variable";
  /** List order. @default 0.5 */
  order: number;
  /** Variable name. */
  name: string;
  /** Formula used to compute the variable. */
  formula: Formula;
  /** Unit label. @default "unit" */
  unit: string;
  /** Base value. */
  value: number;
  /** Period in milliseconds. @default one month */
  period: number;
  delta: number;
  /** Delta period in milliseconds. @default one year */
  delta_period: number;
  rounding: number;
}

export interface Comment extends NodeBase {
  type: "comment";
  /** List order. @default 0.5 */
  order: number;
  /** Present when the comment is on a task. */
  task_id?: string;
  /** Present when the comment is on a feature. */
  feature_id?: string;
  /** Comment text. */
  contents: string;
  /** Author member id. */
  member_id: string;
  /** Resolution timestamp, or 0 while open. */
  resolved: number;
  /** Mentioned member ids. */
  mentions: string[];
}

export interface Reply extends NodeBase {
  type: "reply";
  /** List order. @default 0.5 */
  order: number;
  /** Reply text. */
  contents: string;
  /** Parent comment id. */
  comment_id: string;
  /** Author member id. */
  member_id: string;
  /** Mentioned member ids. */
  mentions: string[];
}

export interface Milestone extends NodeBase {
  type: "milestone";
  /** List order. @default 0.5 */
  order: number;
  /** Milestone name. @maxLength 32 */
  name: string;
  /** Milestone description. */
  description: string;
  /** Associated phase id, or null for deal-level milestones. */
  phase_id: string | null;
  /** Progress within the phase or deal, as 0..1. */
  progress: number;
  /** Fixed date override timestamp. */
  date: number;
  date_set: boolean;
  /** Dynamic milestone period. */
  period: MilestonePeriod | null;
  period_set: boolean;
  /** Fixed day-count override. */
  days: number;
  days_set: boolean;
  /** Percent of total value assigned to this milestone. */
  percent: number;
  percent_set: boolean;
  /** Amount in the space currency. */
  amount: number;
  amount_set: boolean;
}

export interface Version extends NodeBase {
  type: "version";
  /** Version name. @maxLength 32 */
  name: string;
  /** Version description. @maxLength 64 */
  description: string;
  /** Deal status captured in this version. */
  status: DealStatus;
  /** Deal price captured in this version. */
  price: number;
  /** Creator member id. */
  owner: string | null;
  /** Contributor member ids. */
  contributors: string[];
}

export type EstimateTree = Estimate & {
  variable: Variable | null;
  resource: ResourceTree;
};

export type CommentTree = Comment & {
  replies: Reply[];
};

export type TaskTree = Task & {
  estimates: EstimateTree[];
  comments: CommentTree[];
};

export type FeatureTree = Feature & {
  tasks: TaskTree[];
  comments: CommentTree[];
};

export type SectionTree = Section & {
  features: FeatureTree[];
};

export type CategoryTree = Category & {
  sections: SectionTree[];
};

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
  months: Array<{ units: number; state: "active" | "inactive" | "extra" }>;
};

export type TagReferenceTree = TagReference & {
  count: number;
  local?: boolean;
  color?: string;
};
