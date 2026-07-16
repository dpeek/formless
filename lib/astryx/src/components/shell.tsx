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
} from "../formless-ui-contract.ts";
import { useFormlessUiShellManifest } from "../formless-ui-contract-host-react.tsx";
import { AstryxApplicationSideNav, AstryxSubscribedApplicationSideNav } from "./side-nav.tsx";
import { AstryxDocumentThemeRenderer, AstryxSubscribedDocumentThemeRenderer } from "./theme.tsx";

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

  const shell = (
    <AstryxApplicationShellFrame
      manifest={manifest}
      sideNav={
        <AstryxApplicationSideNav
          manifest={manifest}
          onIntent={onIntent}
          sections={orderedSections}
        />
      }
    >
      {children}
    </AstryxApplicationShellFrame>
  );

  return theme && onThemeIntent ? (
    <AstryxDocumentThemeRenderer onIntent={onThemeIntent} theme={theme}>
      {shell}
    </AstryxDocumentThemeRenderer>
  ) : (
    shell
  );
}

export const AstryxSubscribedApplicationShellRenderer = memo(
  function AstryxSubscribedApplicationShellRenderer({
    children,
    shellReference,
    themeReference,
  }: {
    children: ReactNode;
    shellReference: FormlessUiShellManifestReference;
    themeReference?: FormlessUiDocumentThemeReference | undefined;
  }) {
    const manifest = useFormlessUiShellManifest(shellReference);

    if (!manifest) {
      return children;
    }

    const shell = (
      <AstryxApplicationShellFrame
        manifest={manifest}
        sideNav={
          <AstryxSubscribedApplicationSideNav
            manifest={manifest}
            references={manifest.navigationSections}
          />
        }
      >
        {children}
      </AstryxApplicationShellFrame>
    );

    return themeReference ? (
      <AstryxSubscribedDocumentThemeRenderer themeReference={themeReference}>
        {shell}
      </AstryxSubscribedDocumentThemeRenderer>
    ) : (
      shell
    );
  },
  (previous, next) =>
    previous.shellReference.shellId === next.shellReference.shellId &&
    previous.themeReference?.themeId === next.themeReference?.themeId &&
    previous.children === next.children,
);

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
