import { HStack } from "@astryxdesign/core/HStack";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { FormlessThemeToggle } from "./theme.tsx";

export function FormlessSideNav() {
  return (
    <SideNav
      header={<SideNavHeading heading="Formless" subheading="UX prototype" headingHref="#" />}
      footer={
        <HStack hAlign="center" vAlign="center">
          <FormlessThemeToggle />
        </HStack>
      }
    >
      <SideNavSection title="Workspace" isHeaderHidden>
        <SideNavItem label="Overview" href="#" isSelected />
        <SideNavItem label="Apps" href="#" />
        <SideNavItem label="Data" href="#" />
      </SideNavSection>
      <SideNavSection title="Build">
        <SideNavItem label="Schema" href="#" />
        <SideNavItem label="Screens" href="#" />
        <SideNavItem label="Actions" href="#" />
      </SideNavSection>
    </SideNav>
  );
}
