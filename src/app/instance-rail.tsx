import { Link } from "wouter";
import { PublishIcon } from "@dpeek/formless-ui/icons";
import type { AppInstall, AppInstallLaunchLink } from "@dpeek/formless-installed-apps";

export type InstanceRailLink = {
  href: `/${string}`;
  installId: string;
  isCurrent: boolean;
  key: string;
  label: string;
  packageAppKey: string;
  routeKind: AppInstallLaunchLink["routeKind"];
};

export function InstanceRail({
  currentPath,
  installs,
}: {
  currentPath: string;
  installs: readonly AppInstall[];
}) {
  const links = selectInstanceRailLinks({ currentPath, installs });
  const settingsIsCurrent = normalizeInstanceRailPath(currentPath) === "/";

  return (
    <nav
      aria-label="Instance navigation"
      className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar px-2 py-3 text-sidebar-fg md:flex"
      data-formless-instance-rail="true"
    >
      <InstanceRailTile
        ariaLabel="Open Instance Settings"
        href="/"
        isCurrent={settingsIsCurrent}
        mark="I"
      />
      {links.length > 0 ? <span aria-hidden="true" className="my-1 h-px w-8 bg-border" /> : null}
      {links.map((link) => (
        <InstanceRailTile
          ariaLabel={instanceRailLinkAccessibleName(link)}
          href={link.href}
          icon={link.routeKind === "publicSite" ? "publicSite" : undefined}
          isCurrent={link.isCurrent}
          key={link.key}
          mark={appInstallInitial(link.label)}
        />
      ))}
    </nav>
  );
}

export function selectInstanceRailLinks({
  currentPath,
  installs,
}: {
  currentPath: string;
  installs: readonly AppInstall[];
}): InstanceRailLink[] {
  const current = normalizeInstanceRailPath(currentPath);

  return installs.flatMap((install) =>
    appInstallInstanceRailLinks(install).map((link) => ({
      ...link,
      isCurrent: instanceRailPathMatches(current, link.href),
    })),
  );
}

function appInstallInstanceRailLinks(install: AppInstall): Omit<InstanceRailLink, "isCurrent">[] {
  const launchLinks = install.launchLinks;
  const links =
    launchLinks && launchLinks.length > 0
      ? launchLinks.filter((link) => link.routeKind === "admin" || link.routeKind === "publicSite")
      : fallbackAppInstallLaunchLinks(install);

  return links.map((link) => ({
    href: link.href,
    installId: link.installId,
    key: `${link.packageAppKey}:${link.installId}:${link.routeId ?? link.routeKind}:${link.href}`,
    label: link.label,
    packageAppKey: link.packageAppKey,
    routeKind: link.routeKind,
  }));
}

function fallbackAppInstallLaunchLinks(install: AppInstall): AppInstallLaunchLink[] {
  const links: AppInstallLaunchLink[] = [
    {
      access: "owner",
      href: install.adminRoute,
      installId: install.installId,
      label: install.label,
      packageAppKey: install.packageAppKey,
      routeKind: "admin",
    },
  ];

  if (install.publicRoute) {
    links.push({
      access: "anonymous",
      href: install.publicRoute,
      installId: install.installId,
      label: install.label,
      packageAppKey: install.packageAppKey,
      routeKind: "publicSite",
    });
  }

  return links;
}

function InstanceRailTile({
  ariaLabel,
  href,
  icon,
  isCurrent,
  mark,
}: {
  ariaLabel: string;
  href: `/${string}`;
  icon?: "publicSite" | undefined;
  isCurrent: boolean;
  mark: string;
}) {
  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      aria-label={ariaLabel}
      className={instanceRailTileClassName(isCurrent)}
      data-current={isCurrent ? "true" : undefined}
      href={href}
      title={ariaLabel}
    >
      {icon === "publicSite" ? (
        <PublishIcon aria-hidden="true" className="size-4" />
      ) : (
        <span aria-hidden="true">{mark}</span>
      )}
    </Link>
  );
}

function instanceRailTileClassName(isCurrent: boolean) {
  const base =
    "flex size-10 items-center justify-center rounded-lg border text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return isCurrent
    ? `${base} border-fg bg-fg text-bg`
    : `${base} border-border bg-bg text-fg hover:border-fg hover:bg-secondary`;
}

function instanceRailLinkAccessibleName(link: Pick<InstanceRailLink, "label" | "routeKind">) {
  return link.routeKind === "publicSite"
    ? `Open ${link.label} public Site`
    : `Open ${link.label} admin`;
}

function appInstallInitial(label: string) {
  const initial = label.trim().match(/\p{L}|\p{N}/u)?.[0];

  return initial?.toLocaleUpperCase() ?? "?";
}

function instanceRailPathMatches(currentPath: string, href: `/${string}`) {
  const normalizedHref = normalizeInstanceRailPath(href);

  return currentPath === normalizedHref || currentPath.startsWith(`${normalizedHref}/`);
}

function normalizeInstanceRailPath(path: string) {
  const normalized = path.split(/[?#]/)[0] || "/";

  return normalized.endsWith("/") && normalized !== "/" ? normalized.slice(0, -1) : normalized;
}
