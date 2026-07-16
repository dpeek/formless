import { AppShell } from "@astryxdesign/core/AppShell";
import { memo, type ReactNode, useState } from "react";
import type {
  FormlessUiShellIntentHandler,
  FormlessUiShellManifestContract,
  FormlessUiShellManifestReference,
  FormlessUiShellNavigationSectionContract,
} from "../formless-ui-contract.ts";
import { useFormlessUiShellManifest } from "../formless-ui-contract-host-react.tsx";
import { AstryxApplicationSideNav, AstryxSubscribedApplicationSideNav } from "./side-nav.tsx";

export function AstryxApplicationShellRenderer({
  children,
  manifest,
  onIntent,
  sections,
}: {
  children: ReactNode;
  manifest: FormlessUiShellManifestContract;
  onIntent: FormlessUiShellIntentHandler;
  sections: readonly FormlessUiShellNavigationSectionContract[];
}) {
  const orderedSections = orderShellSections(manifest, sections);

  return (
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
}

export const AstryxSubscribedApplicationShellRenderer = memo(
  function AstryxSubscribedApplicationShellRenderer({
    children,
    shellReference,
  }: {
    children: ReactNode;
    shellReference: FormlessUiShellManifestReference;
  }) {
    const manifest = useFormlessUiShellManifest(shellReference);

    if (!manifest) {
      return children;
    }

    return (
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
  },
  (previous, next) =>
    previous.shellReference.shellId === next.shellReference.shellId &&
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
