import { AppShell } from "@astryxdesign/core/AppShell";
import { memo, type ReactNode, useState } from "react";
import type {
  FormlessUiDocumentThemeContract,
  FormlessUiDocumentThemeIntentHandler,
  FormlessUiDocumentThemeReference,
  FormlessUiShellIntentHandler,
  FormlessUiShellManifestContract,
  FormlessUiShellManifestReference,
  FormlessUiShellNavigationSectionContract,
} from "@dpeek/formless-presentation/contract";
import {
  useFormlessUiDocumentTheme,
  useFormlessUiDocumentThemeIntentHandler,
  useFormlessUiShellManifest,
} from "@dpeek/formless-presentation/contract-host/react";
import { AstryxApplicationSideNav, AstryxSubscribedApplicationSideNav } from "./side-nav.tsx";
import { FormlessThemeIconToggle } from "./theme.tsx";

type AstryxApplicationShellRendererProps = {
  children: ReactNode;
  manifest: FormlessUiShellManifestContract;
  onIntent: FormlessUiShellIntentHandler;
  sections: readonly FormlessUiShellNavigationSectionContract[];
} & (
  | {
      onThemeIntent: FormlessUiDocumentThemeIntentHandler;
      theme: FormlessUiDocumentThemeContract;
    }
  | {
      onThemeIntent?: undefined;
      theme?: undefined;
    }
);

export function AstryxApplicationShellRenderer({
  children,
  manifest,
  onIntent,
  onThemeIntent,
  sections,
  theme,
}: AstryxApplicationShellRendererProps) {
  const orderedSections = orderShellSections(manifest, sections);
  const themeControl =
    theme?.selectionControl && onThemeIntent ? (
      <FormlessThemeIconToggle
        activeMode={theme.activeMode}
        control={theme.selectionControl}
        onIntent={onThemeIntent}
      />
    ) : undefined;

  const shell = (
    <AstryxApplicationShellFrame
      manifest={manifest}
      sideNav={
        <AstryxApplicationSideNav
          manifest={manifest}
          onIntent={onIntent}
          sections={orderedSections}
          themeControl={themeControl}
        />
      }
    >
      {children}
    </AstryxApplicationShellFrame>
  );

  return shell;
}

export const AstryxSubscribedApplicationShellRenderer = memo(
  function AstryxSubscribedApplicationShellRenderer({
    children,
    shellReference,
    themeControl,
    themeReference,
  }: {
    children: ReactNode;
    shellReference: FormlessUiShellManifestReference;
    themeControl?: ReactNode;
    themeReference?: FormlessUiDocumentThemeReference | undefined;
  }) {
    const manifest = useFormlessUiShellManifest(shellReference);

    if (!manifest) {
      return children;
    }

    return themeReference ? (
      <AstryxSubscribedThemedApplicationShell
        manifest={manifest}
        themeControl={themeControl}
        themeReference={themeReference}
      >
        {children}
      </AstryxSubscribedThemedApplicationShell>
    ) : (
      <AstryxSubscribedApplicationShellContent manifest={manifest} themeControl={themeControl}>
        {children}
      </AstryxSubscribedApplicationShellContent>
    );
  },
  (previous, next) =>
    previous.shellReference.shellId === next.shellReference.shellId &&
    previous.themeReference?.themeId === next.themeReference?.themeId &&
    previous.themeControl === next.themeControl &&
    previous.children === next.children,
);

function AstryxSubscribedThemedApplicationShell({
  children,
  manifest,
  themeControl,
  themeReference,
}: {
  children: ReactNode;
  manifest: FormlessUiShellManifestContract;
  themeControl?: ReactNode;
  themeReference: FormlessUiDocumentThemeReference;
}) {
  const onThemeIntent = useFormlessUiDocumentThemeIntentHandler();
  const theme = useFormlessUiDocumentTheme(themeReference);
  const resolvedThemeControl = theme ? (
    theme.selectionControl ? (
      <FormlessThemeIconToggle
        activeMode={theme.activeMode}
        control={theme.selectionControl}
        onIntent={onThemeIntent}
      />
    ) : undefined
  ) : (
    themeControl
  );
  const shell = (
    <AstryxSubscribedApplicationShellContent
      manifest={manifest}
      themeControl={resolvedThemeControl}
    >
      {children}
    </AstryxSubscribedApplicationShellContent>
  );

  return shell;
}

function AstryxSubscribedApplicationShellContent({
  children,
  manifest,
  themeControl,
}: {
  children: ReactNode;
  manifest: FormlessUiShellManifestContract;
  themeControl?: ReactNode;
}) {
  return (
    <AstryxApplicationShellFrame
      manifest={manifest}
      sideNav={
        <AstryxSubscribedApplicationSideNav
          manifest={manifest}
          references={manifest.navigationSections}
          themeControl={themeControl}
        />
      }
    >
      {children}
    </AstryxApplicationShellFrame>
  );
}

function AstryxApplicationShellFrame({
  children,
  manifest,
  sideNav,
}: {
  children: ReactNode;
  manifest: FormlessUiShellManifestContract;
  sideNav: ReactNode;
}) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  return (
    <div
      aria-label={manifest.accessibilityLabel}
      data-formless-astryx-shell-scope={manifest.scope}
      role="application"
    >
      <AppShell
        contentPadding={4}
        data-testid={`formless-astryx-application-shell:${manifest.id}`}
        mobileNav={{
          breakpoint: "md",
          isOpen: isMobileNavigationOpen,
          onOpenChange: setIsMobileNavigationOpen,
        }}
        sideNav={sideNav}
      >
        {children}
      </AppShell>
    </div>
  );
}

function orderShellSections(
  manifest: FormlessUiShellManifestContract,
  sections: readonly FormlessUiShellNavigationSectionContract[],
) {
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  return manifest.navigationSections.flatMap((reference) => {
    const section = sectionById.get(reference.sectionId);
    return section?.shellId === reference.shellId ? [section] : [];
  });
}
