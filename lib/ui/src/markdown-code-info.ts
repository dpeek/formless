const LANGUAGE_ALIASES = {
  bash: "bash",
  cjs: "javascript",
  css: "css",
  cts: "typescript",
  diff: "diff",
  htm: "html",
  html: "html",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  markdown: "markdown",
  md: "markdown",
  mdx: "mdx",
  mjs: "javascript",
  mts: "typescript",
  nohighlight: "plaintext",
  patch: "diff",
  plain: "plaintext",
  plaintext: "plaintext",
  scss: "scss",
  sh: "bash",
  shell: "bash",
  sql: "sql",
  text: "plaintext",
  ts: "typescript",
  tsx: "tsx",
  txt: "plaintext",
  typescript: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
} as const;

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  css: "CSS",
  diff: "Diff",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  jsonc: "JSONC",
  jsx: "JSX",
  markdown: "Markdown",
  mdx: "MDX",
  plaintext: "Text",
  scss: "SCSS",
  sql: "SQL",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
};

const HIGHLIGHT_LANGUAGES = new Set([
  "bash",
  "css",
  "diff",
  "html",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "scss",
  "sql",
  "tsx",
  "typescript",
  "xml",
  "yaml",
]);

const PLAIN_LANGUAGES = new Set(["plaintext"]);

const FILENAME_ATTRIBUTE_NAMES = ["filename", "file", "name", "title"];

export type MarkdownCodeInfo = {
  filename: string | null;
  highlightLanguage: string | null;
  label: string | null;
  language: string | null;
};

export type MarkdownCodeInfoInput = {
  language?: string | null;
  meta?: string | null;
};

export function parseMarkdownCodeInfo({ language, meta }: MarkdownCodeInfoInput): MarkdownCodeInfo {
  const firstToken = cleanInfoValue(language);
  const attributes = parseInfoAttributes(meta ?? "");
  const firstTokenAttributes =
    firstToken && firstToken.includes("=") ? parseInfoAttributes(firstToken) : {};
  const filename =
    firstDefinedAttribute(attributes, FILENAME_ATTRIBUTE_NAMES) ??
    firstDefinedAttribute(firstTokenAttributes, FILENAME_ATTRIBUTE_NAMES);

  const firstTokenIsMetadata = Object.keys(firstTokenAttributes).length > 0;
  const parsed = firstToken && !firstTokenIsMetadata ? parseFirstInfoToken(firstToken) : null;

  const resolvedFilename = filename ?? (parsed?.kind === "filename" ? parsed.filename : null);
  const languageInfo = parsed?.kind === "language" ? parsed : null;

  if (languageInfo) {
    return {
      filename: resolvedFilename,
      highlightLanguage: languageInfo.highlightLanguage,
      label: resolvedFilename ?? languageInfo.label,
      language: languageInfo.language,
    };
  }

  const inferredLanguage = resolvedFilename ? languageFromFilename(resolvedFilename) : null;
  const highlightLanguage = highlightLanguageFromNormalized(inferredLanguage);

  return {
    filename: resolvedFilename,
    highlightLanguage,
    label: resolvedFilename ?? languageLabel(inferredLanguage),
    language: inferredLanguage,
  };
}

export function isSupportedHighlightLanguage(language: string | null | undefined): boolean {
  return highlightLanguageFromNormalized(language) !== null;
}

export function lowlightLanguageForMarkdownCode({ language, meta }: MarkdownCodeInfoInput): string {
  return parseMarkdownCodeInfo({ language, meta }).highlightLanguage ?? "plaintext";
}

function parseFirstInfoToken(
  token: string,
):
  | { kind: "filename"; filename: string }
  | { highlightLanguage: string | null; kind: "language"; label: string; language: string } {
  if (looksLikePathOrFilename(token)) {
    return { kind: "filename", filename: token };
  }

  if (!looksLikeLanguageIdentifier(token)) {
    return { kind: "filename", filename: token };
  }

  const normalizedLanguage = normalizeLanguage(token);
  const highlightLanguage = highlightLanguageFromNormalized(normalizedLanguage);

  return {
    highlightLanguage,
    kind: "language",
    label: languageLabel(normalizedLanguage) ?? token,
    language: normalizedLanguage ?? token,
  };
}

function normalizeLanguage(language: string | null | undefined): string | null {
  const key = cleanInfoValue(language)?.toLowerCase();

  if (!key) {
    return null;
  }

  return LANGUAGE_ALIASES[key as keyof typeof LANGUAGE_ALIASES] ?? key;
}

function languageFromFilename(filename: string): string | null {
  const normalizedFilename = filename.replace(/[?#].*$/, "");
  const basename = normalizedFilename.split(/[\\/]/).pop() ?? normalizedFilename;
  const extension = basename.includes(".") ? basename.split(".").pop() : null;

  return normalizeLanguage(extension);
}

function highlightLanguageFromNormalized(language: string | null | undefined): string | null {
  const normalizedLanguage = normalizeLanguage(language);

  if (!normalizedLanguage || PLAIN_LANGUAGES.has(normalizedLanguage)) {
    return null;
  }

  return HIGHLIGHT_LANGUAGES.has(normalizedLanguage) ? normalizedLanguage : null;
}

function languageLabel(language: string | null | undefined): string | null {
  const normalizedLanguage = normalizeLanguage(language);

  if (!normalizedLanguage) {
    return null;
  }

  return LANGUAGE_LABELS[normalizedLanguage] ?? normalizedLanguage;
}

function looksLikeLanguageIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9_+-]*$/i.test(value);
}

function looksLikePathOrFilename(value: string): boolean {
  return /[./\\]/.test(value);
}

function firstDefinedAttribute(
  attributes: Record<string, string>,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = attributes[name];

    if (value) {
      return value;
    }
  }

  return null;
}

function cleanInfoValue(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function parseInfoAttributes(meta: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /(?:^|\s)([a-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi;

  for (const match of meta.matchAll(attributePattern)) {
    const [, key, doubleQuotedValue, singleQuotedValue, unquotedValue] = match;

    if (!key) {
      continue;
    }

    attributes[key.toLowerCase()] = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue ?? "";
  }

  return attributes;
}
