export function normalizeSitePageSlug(slug: string | undefined): string {
  const trimmed = (slug ?? "").replace(/^\/+/, "").trim();

  if (trimmed === "") {
    return "home";
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}
