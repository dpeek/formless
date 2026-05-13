import type { StoredRecord } from "../shared/protocol.ts";

const githubIconSource =
  '<svg viewBox="0 0 24 24"><path d="M12 .5C5.65 .5.5 5.65.5 12c0 5.1 3.29 9.42 7.86 10.95.58.11.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18A11.1 11.1 0 0 1 12 6.07c.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.04.78 2.1v3.12c0 .31.21.68.79.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>';

const linkedInIconSource =
  '<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.64h.05c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.6c0-1.34-.02-3.06-1.86-3.06-1.87 0-2.16 1.46-2.16 2.96V21h-4V9Z"/></svg>';

export const testSiteSeedRecords: StoredRecord[] = [
  block("rec_site_media_avatar", "2026-05-05T00:00:01.000Z", {
    type: "image",
    label: "Site owner portrait",
    href: "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 1200 1200%27%3E%3Crect width=%271200%27 height=%271200%27 fill=%27%230f766e%27/%3E%3Ctext x=%27600%27 y=%27620%27 font-size=%2796%27 text-anchor=%27middle%27 fill=%27white%27%3ESite owner%3C/text%3E%3C/svg%3E",
    width: 1200,
    height: 1200,
  }),
  block("rec_site_content_profile_intro", "2026-05-05T00:00:03.000Z", {
    type: "profile",
    label: "Intro",
    body: "I design and build schema-backed software for teams that need their tools to keep up with the work.",
    templateKey: "profile-intro",
  }),
  block("rec_site_content_home", "2026-05-05T00:00:04.000Z", {
    type: "page",
    label: "Home",
    body: "A concise personal site for current work, writing, and project notes.",
    href: "/",
    templateKey: "home",
  }),
  block("rec_site_content_blog", "2026-05-05T00:00:05.000Z", {
    type: "page",
    label: "Blog",
    body: "Notes on product engineering",
    href: "/blog",
    templateKey: "post-index",
  }),
  block("rec_site_content_resume", "2026-05-05T00:00:06.000Z", {
    type: "page",
    label: "Resume",
    body: "A practical summary of roles, projects, and strengths.",
    href: "/resume",
    templateKey: "resume",
  }),
  block("rec_site_content_projects", "2026-05-05T00:00:07.000Z", {
    type: "page",
    label: "Projects",
    body: "Current and recent product work",
    href: "/projects",
    templateKey: "project-index",
  }),
  block("rec_site_content_project_estii", "2026-05-05T00:00:08.000Z", {
    type: "project",
    label: "Estii",
    body: "Estii helps teams turn **operational assumptions** into clear, reusable [pricing structures](https://estii.com).",
    href: "/projects/estii",
    templateKey: "project",
  }),
  block("rec_site_content_project_opensurf", "2026-05-05T00:00:09.000Z", {
    type: "project",
    label: "OpenSurf",
    body: "OpenSurf explores reliable browser automation and local-first agent execution.",
    href: "/projects/opensurf",
    templateKey: "project",
  }),
  block("rec_site_content_project_formless", "2026-05-05T00:00:10.000Z", {
    type: "project",
    label: "Formless",
    body: "Formless makes app schema describe enough behavior to produce useful generated software.",
    href: "/projects/formless",
    templateKey: "project",
  }),
  block("rec_site_content_post_shipped_schema", "2026-05-05T00:00:11.000Z", {
    type: "post",
    label: "Shipping schema-backed authoring",
    body: "The first useful content app should keep records flat and move composition into relationships and views.",
    href: "/blog/shipping-schema-backed-authoring",
    templateKey: "post",
  }),
  block("rec_site_content_post_draft_notes", "2026-05-05T00:00:12.000Z", {
    type: "post",
    label: "Draft notes on generated editorial tools",
    body: "Draft thoughts on where generic generated admin surfaces are helpful and where authoring affordances need more shape.",
    href: "/blog/generated-editorial-tools",
    templateKey: "post",
  }),
  block("rec_site_content_link_home", "2026-05-05T00:00:12.100Z", {
    type: "link",
    label: "Home",
    href: "/",
  }),
  block("rec_site_content_link_blog", "2026-05-05T00:00:12.200Z", {
    type: "link",
    label: "Blog",
    href: "/blog",
  }),
  block("rec_site_content_link_projects", "2026-05-05T00:00:12.300Z", {
    type: "link",
    label: "Projects",
    href: "/projects",
  }),
  block("rec_site_content_link_resume", "2026-05-05T00:00:12.400Z", {
    type: "link",
    label: "Resume",
    href: "/resume",
  }),
  block("rec_site_content_link_github", "2026-05-05T00:00:13.000Z", {
    type: "link",
    label: "GitHub",
    href: "https://github.com/dpeek",
    icon: githubIconSource,
  }),
  block("rec_site_content_link_linkedin", "2026-05-05T00:00:14.000Z", {
    type: "link",
    label: "LinkedIn",
    href: "https://linkedin.com/in/dpeekdotcom",
    icon: linkedInIconSource,
  }),
  block("rec_site_content_group_header", "2026-05-05T00:00:16.000Z", {
    type: "header",
    label: "Header",
    templateKey: "header",
  }),
  block("rec_site_content_group_footer", "2026-05-05T00:00:16.500Z", {
    type: "footer",
    label: "Footer",
    templateKey: "footer",
  }),
  block("rec_site_content_group_footer_main", "2026-05-05T00:00:17.000Z", {
    type: "group",
    label: "Explore",
    templateKey: "footer-group",
  }),
  block("rec_site_content_group_footer_social", "2026-05-05T00:00:18.000Z", {
    type: "group",
    label: "Social",
    templateKey: "footer-social",
  }),
  block("rec_site_block_home_hero", "2026-05-05T00:00:18.100Z", {
    type: "hero",
    label: "Schema-backed software for content-heavy products",
    body: "I design and build schema-backed software for teams that need their tools to keep up with the work.",
    templateKey: "home-hero",
  }),
  block("rec_site_block_home_recent_posts", "2026-05-05T00:00:18.200Z", {
    type: "group",
    label: "Recent posts",
  }),
  block("rec_site_block_home_projects", "2026-05-05T00:00:18.300Z", {
    type: "group",
    label: "Featured projects",
  }),
  block("rec_site_block_post_body", "2026-05-05T00:00:18.400Z", {
    type: "markdown",
    label: "Body",
    body: "The first useful content app should keep records flat and move composition into relationships and views.",
    templateKey: "post-body",
  }),
  placement(
    "rec_site_place_header_home",
    "2026-05-05T00:00:19.000Z",
    "rec_site_content_group_header",
    "rec_site_content_link_home",
    1000,
  ),
  placement(
    "rec_site_place_header_blog",
    "2026-05-05T00:00:20.000Z",
    "rec_site_content_group_header",
    "rec_site_content_link_blog",
    2000,
  ),
  placement(
    "rec_site_place_header_projects",
    "2026-05-05T00:00:21.000Z",
    "rec_site_content_group_header",
    "rec_site_content_link_projects",
    3000,
  ),
  placement(
    "rec_site_place_header_resume",
    "2026-05-05T00:00:22.000Z",
    "rec_site_content_group_header",
    "rec_site_content_link_resume",
    4000,
  ),
  placement(
    "rec_site_place_footer_projects",
    "2026-05-05T00:00:23.000Z",
    "rec_site_content_group_footer_main",
    "rec_site_content_link_projects",
    1000,
  ),
  placement(
    "rec_site_place_footer_resume",
    "2026-05-05T00:00:24.000Z",
    "rec_site_content_group_footer_main",
    "rec_site_content_link_resume",
    2000,
  ),
  placement(
    "rec_site_place_footer_github",
    "2026-05-05T00:00:25.000Z",
    "rec_site_content_group_footer_social",
    "rec_site_content_link_github",
    1000,
  ),
  placement(
    "rec_site_place_footer_linkedin",
    "2026-05-05T00:00:26.000Z",
    "rec_site_content_group_footer_social",
    "rec_site_content_link_linkedin",
    2000,
  ),
  placement(
    "rec_site_place_footer_section_explore",
    "2026-05-05T00:00:26.200Z",
    "rec_site_content_group_footer",
    "rec_site_content_group_footer_main",
    1000,
  ),
  placement(
    "rec_site_place_footer_section_social",
    "2026-05-05T00:00:26.300Z",
    "rec_site_content_group_footer",
    "rec_site_content_group_footer_social",
    2000,
  ),
  placement(
    "rec_site_place_home_hero",
    "2026-05-05T00:00:27.000Z",
    "rec_site_content_home",
    "rec_site_block_home_hero",
    1000,
  ),
  placement(
    "rec_site_place_home_hero_image",
    "2026-05-05T00:00:27.100Z",
    "rec_site_block_home_hero",
    "rec_site_media_avatar",
    1000,
    "Portrait",
  ),
  placement(
    "rec_site_place_home_recent_posts",
    "2026-05-05T00:00:28.000Z",
    "rec_site_content_home",
    "rec_site_block_home_recent_posts",
    2000,
  ),
  placement(
    "rec_site_place_home_projects",
    "2026-05-05T00:00:29.000Z",
    "rec_site_content_home",
    "rec_site_block_home_projects",
    3000,
  ),
  placement(
    "rec_site_place_recent_posts_shipped_schema",
    "2026-05-05T00:00:29.100Z",
    "rec_site_block_home_recent_posts",
    "rec_site_content_post_shipped_schema",
    1000,
  ),
  placement(
    "rec_site_place_recent_posts_draft_notes",
    "2026-05-05T00:00:29.200Z",
    "rec_site_block_home_recent_posts",
    "rec_site_content_post_draft_notes",
    2000,
  ),
  placement(
    "rec_site_place_featured_project_estii",
    "2026-05-05T00:00:29.300Z",
    "rec_site_block_home_projects",
    "rec_site_content_project_estii",
    1000,
  ),
  placement(
    "rec_site_place_featured_project_opensurf",
    "2026-05-05T00:00:29.400Z",
    "rec_site_block_home_projects",
    "rec_site_content_project_opensurf",
    2000,
  ),
  placement(
    "rec_site_place_featured_project_formless",
    "2026-05-05T00:00:29.500Z",
    "rec_site_block_home_projects",
    "rec_site_content_project_formless",
    3000,
  ),
  placement(
    "rec_site_place_projects_estii",
    "2026-05-05T00:00:29.600Z",
    "rec_site_content_projects",
    "rec_site_content_project_estii",
    1000,
  ),
  placement(
    "rec_site_place_projects_opensurf",
    "2026-05-05T00:00:29.700Z",
    "rec_site_content_projects",
    "rec_site_content_project_opensurf",
    2000,
  ),
  placement(
    "rec_site_place_projects_formless",
    "2026-05-05T00:00:29.800Z",
    "rec_site_content_projects",
    "rec_site_content_project_formless",
    3000,
  ),
  placement(
    "rec_site_place_post_body",
    "2026-05-05T00:00:30.000Z",
    "rec_site_content_post_shipped_schema",
    "rec_site_block_post_body",
    1000,
  ),
  placement(
    "rec_site_place_post_profile",
    "2026-05-05T00:00:31.000Z",
    "rec_site_content_post_shipped_schema",
    "rec_site_content_profile_intro",
    2000,
    "Profile",
  ),
];

function block(id: string, createdAt: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt,
  };
}

function placement(
  id: string,
  createdAt: string,
  parent: string,
  child: string,
  order: number,
  label?: string,
): StoredRecord {
  return {
    id,
    entity: "blockPlacement",
    values: {
      parent,
      block: child,
      order,
      ...(label === undefined ? {} : { label }),
    },
    createdAt,
  };
}
