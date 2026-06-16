export function cloudflareRedirectRuleExpressionForRequestUrl(
  requestUrl: string | undefined,
): string | undefined {
  if (requestUrl === undefined) {
    return undefined;
  }

  const url = new URL(requestUrl);

  if (url.pathname !== "/*") {
    return undefined;
  }

  const protocolExpression =
    url.protocol === "https:" ? "ssl" : url.protocol === "http:" ? "not ssl" : undefined;

  return [`http.host == ${cloudflareRulesString(url.hostname)}`, protocolExpression]
    .filter((part) => part !== undefined)
    .join(" and ");
}

export function cloudflareRedirectRuleTargetExpressionForTargetUrl(
  targetUrl: string,
): string | undefined {
  const placeholderSuffix = "/${1}";

  if (!targetUrl.endsWith(placeholderSuffix)) {
    return undefined;
  }

  const targetUrlBase = targetUrl.slice(0, -placeholderSuffix.length);

  return `concat(${cloudflareRulesString(targetUrlBase)}, http.request.uri.path)`;
}

function cloudflareRulesString(value: string): string {
  return JSON.stringify(value);
}
