import { Resource, type Context } from "alchemy";
import {
  createCloudflareApi,
  getZoneByDomain,
  handleApiError,
  type CloudflareApi,
  type CloudflareApiOptions,
  type RedirectRule,
  type RedirectRuleProps,
  type Zone,
} from "alchemy/cloudflare";

export type FormlessCloudflareRedirectRuleProps = Omit<RedirectRuleProps, "requestUrl"> &
  CloudflareApiOptions & {
    targetUrlExpression: string;
  };

type CloudflareResponse<T> = {
  result: T;
};

type CloudflareRuleset = {
  id: string;
  last_updated: string;
  name: string;
  phase: string;
  rules?: CloudflareRule[];
  version: string;
};

type CloudflareRule = {
  description?: string;
  enabled?: boolean;
  expression?: string;
  id: string;
  last_updated: string;
};

type RuleData = {
  api: CloudflareApi;
  description: string;
  expression: string;
  preserveQueryString: boolean;
  ruleId?: string;
  rulesetId: string;
  statusCode: number;
  targetUrl: string;
  targetUrlExpression: string;
  zoneId: string;
};

export const FormlessCloudflareRedirectRule = Resource(
  "formless::CloudflareRedirectRule",
  async function (
    this: Context<RedirectRule>,
    id: string,
    props: FormlessCloudflareRedirectRuleProps,
  ): Promise<RedirectRule> {
    const api = await createCloudflareApi(props);
    const description = props.description ?? this.scope.createPhysicalName(id);
    const zoneId = await redirectRuleZoneId(api, props.zone);

    if (this.phase === "delete") {
      if (this.output?.ruleId && this.output?.rulesetId) {
        await deleteRule({
          api,
          ruleId: this.output.ruleId,
          rulesetId: this.output.rulesetId,
          zoneId,
        });
      }

      return this.destroy();
    }

    const statusCode = props.statusCode ?? 301;
    const preserveQueryString = props.preserveQueryString ?? true;

    if (this.phase === "update" && this.output?.ruleId && this.output?.rulesetId) {
      const updatedRule = await updateRule({
        api,
        description,
        expression: props.expression ?? "true",
        preserveQueryString,
        ruleId: this.output.ruleId,
        rulesetId: this.output.rulesetId,
        statusCode,
        targetUrl: props.targetUrl,
        targetUrlExpression: props.targetUrlExpression,
        zoneId,
      });

      return redirectRuleOutput({
        description,
        preserveQueryString,
        props,
        rule: updatedRule,
        rulesetId: this.output.rulesetId,
        statusCode,
        zoneId,
      });
    }

    const rulesetId = await getOrCreateRedirectRuleset(api, zoneId);
    const ruleFields = {
      api,
      description,
      expression: props.expression ?? "true",
      preserveQueryString,
      rulesetId,
      statusCode,
      targetUrl: props.targetUrl,
      targetUrlExpression: props.targetUrlExpression,
      zoneId,
    };
    const existingRule = await findExistingRedirectRule({
      api,
      description,
      expression: ruleFields.expression,
      rulesetId,
      zoneId,
    });
    const createdRule =
      existingRule === undefined
        ? await createRule(ruleFields)
        : await updateRule({ ...ruleFields, ruleId: existingRule.id });

    return redirectRuleOutput({
      description,
      preserveQueryString,
      props,
      rule: createdRule,
      rulesetId,
      statusCode,
      zoneId,
    });
  },
);

async function redirectRuleZoneId(api: CloudflareApi, zone: string | Zone): Promise<string> {
  const zoneId =
    typeof zone === "string"
      ? zone.includes(".")
        ? (await getZoneByDomain(api, zone))?.id
        : zone
      : zone.id;

  if (!zoneId) {
    throw new Error(`Zone ${String(zone)} not found`);
  }

  return zoneId;
}

async function getRedirectRuleset(api: CloudflareApi, zoneId: string): Promise<string | null> {
  const response = await api.get(`/zones/${zoneId}/rulesets`);

  if (!response.ok) {
    return null;
  }

  const result = (await response.json()) as CloudflareResponse<CloudflareRuleset[]>;
  const redirectRuleset = result.result.find(
    (ruleset) => ruleset.phase === "http_request_dynamic_redirect",
  );

  return redirectRuleset?.id ?? null;
}

async function getRuleset(
  api: CloudflareApi,
  zoneId: string,
  rulesetId: string,
): Promise<CloudflareRuleset> {
  const response = await api.get(`/zones/${zoneId}/rulesets/${rulesetId}`);

  if (!response.ok) {
    await handleApiError(response, "reading", "redirect ruleset", rulesetId);
  }

  const result = (await response.json()) as CloudflareResponse<CloudflareRuleset>;

  return result.result;
}

async function findExistingRedirectRule(input: {
  api: CloudflareApi;
  description: string;
  expression: string;
  rulesetId: string;
  zoneId: string;
}): Promise<CloudflareRule | undefined> {
  const ruleset = await getRuleset(input.api, input.zoneId, input.rulesetId);

  return ruleset.rules?.find(
    (rule) => rule.description === input.description && rule.expression === input.expression,
  );
}

async function createRedirectRuleset(api: CloudflareApi, zoneId: string): Promise<string> {
  const response = await api.post(`/zones/${zoneId}/rulesets`, {
    description: "Redirect rules for the zone",
    kind: "zone",
    name: "Zone-level redirect ruleset",
    phase: "http_request_dynamic_redirect",
  });

  if (!response.ok) {
    await handleApiError(response, "creating", "redirect ruleset", zoneId);
  }

  const result = (await response.json()) as CloudflareResponse<CloudflareRuleset>;

  return result.result.id;
}

async function getOrCreateRedirectRuleset(api: CloudflareApi, zoneId: string): Promise<string> {
  return (await getRedirectRuleset(api, zoneId)) ?? createRedirectRuleset(api, zoneId);
}

async function createRule(data: Omit<RuleData, "ruleId">): Promise<CloudflareRule> {
  const { api, zoneId, rulesetId, ...ruleFields } = data;
  const response = await api.post(
    `/zones/${zoneId}/rulesets/${rulesetId}/rules`,
    buildRuleBody(ruleFields),
  );

  if (!response.ok) {
    await handleApiError(response, "creating", "redirect rule", rulesetId);
  }

  const result = (await response.json()) as CloudflareResponse<CloudflareRuleset>;
  const createdRule = result.result.rules?.[result.result.rules.length - 1];

  if (!createdRule) {
    throw new Error("Created redirect rule not found in response.");
  }

  return createdRule;
}

async function updateRule(data: RuleData): Promise<CloudflareRule> {
  const { api, zoneId, rulesetId, ruleId, ...ruleFields } = data;

  if (!ruleId) {
    throw new Error("Redirect rule id is required for update.");
  }

  const response = await api.patch(
    `/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`,
    buildRuleBody(ruleFields),
  );

  if (!response.ok) {
    await handleApiError(response, "updating", "redirect rule", ruleId);
  }

  const result = (await response.json()) as CloudflareResponse<CloudflareRuleset>;
  const updatedRule = result.result.rules?.find((rule) => rule.id === ruleId);

  if (!updatedRule) {
    throw new Error(`Updated redirect rule "${ruleId}" not found in response.`);
  }

  return updatedRule;
}

async function deleteRule(input: {
  api: CloudflareApi;
  ruleId: string;
  rulesetId: string;
  zoneId: string;
}) {
  const response = await input.api.delete(
    `/zones/${input.zoneId}/rulesets/${input.rulesetId}/rules/${input.ruleId}`,
  );

  if (!response.ok && response.status !== 404) {
    await handleApiError(response, "deleting", "redirect rule", input.ruleId);
  }
}

function buildRuleBody(data: Omit<RuleData, "api" | "ruleId" | "rulesetId" | "zoneId">) {
  return {
    action: "redirect" as const,
    action_parameters: {
      from_value: {
        preserve_query_string: data.preserveQueryString,
        status_code: data.statusCode,
        target_url: {
          expression: data.targetUrlExpression,
        },
      },
    },
    description: data.description,
    enabled: true,
    expression: data.expression,
  };
}

function redirectRuleOutput(input: {
  description: string;
  preserveQueryString: boolean;
  props: FormlessCloudflareRedirectRuleProps;
  rule: CloudflareRule;
  rulesetId: string;
  statusCode: number;
  zoneId: string;
}): RedirectRule {
  return {
    description: input.description,
    enabled: input.rule.enabled ?? true,
    expression: input.props.expression,
    lastUpdated: input.rule.last_updated,
    preserveQueryString: input.preserveQueryString,
    ruleId: input.rule.id,
    rulesetId: input.rulesetId,
    statusCode: input.statusCode,
    targetUrl: input.props.targetUrl,
    zoneId: input.zoneId,
  };
}
