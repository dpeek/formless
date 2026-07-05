import { Avatar } from "@astryxdesign/core/Avatar";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { NavHeadingMenu, NavHeadingMenuItem } from "@astryxdesign/core/NavMenu";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import {
  ArchiveBoxIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  Cog6ToothIcon,
  InboxIcon,
  MapIcon,
  Squares2X2Icon,
  SquaresPlusIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { FormlessThemeToggle } from "./theme.tsx";

export function FormlessSideNav() {
  return (
    <SideNav
      collapsible
      header={
        <SideNavHeading
          icon={<NavIcon icon={<Icon icon={CheckCircleIcon} color="inherit" size="sm" />} />}
          superheading="Acme Studio"
          heading="Tasks"
          headingHref="#app-shell"
          menu={<FormlessAppSwitcher />}
        />
      }
      footerIcons={
        <>
          <IconButton
            label="Instance settings"
            tooltip="Instance settings"
            variant="ghost"
            icon={<Icon icon={Cog6ToothIcon} color="inherit" size="sm" />}
          />
          <FormlessUserMenu />
          <FormlessThemeToggle />
        </>
      }
    >
      <SideNavSection title="Tasks" isHeaderHidden>
        <SideNavItem label="Inbox" href="#app-shell" icon={InboxIcon} />
        <SideNavItem label="Today" href="#app-shell" icon={CalendarDaysIcon} isSelected />
        <SideNavItem label="Upcoming" href="#app-shell" icon={ClockIcon} />
        <SideNavItem label="Completed" href="#app-shell" icon={ArchiveBoxIcon} />
      </SideNavSection>
      <SideNavSection title="Manage">
        <SideNavItem label="Projects" href="#app-shell" icon={Squares2X2Icon} />
        <SideNavItem label="Automations" href="#app-shell" icon={WrenchScrewdriverIcon} />
        <SideNavItem label="App settings" href="#app-shell" icon={Cog6ToothIcon} />
      </SideNavSection>
    </SideNav>
  );
}

function FormlessAppSwitcher() {
  return (
    <NavHeadingMenu size="lg">
      <NavHeadingMenuItem
        label="Tasks"
        description="Project work"
        href="#app-shell"
        icon={CheckCircleIcon}
      />
      <NavHeadingMenuItem
        label="CRM"
        description="Customers and pipeline"
        href="#app-shell"
        icon={UserGroupIcon}
      />
      <NavHeadingMenuItem
        label="Site"
        description="Public pages"
        href="#app-shell"
        icon={Squares2X2Icon}
      />
      <NavHeadingMenuItem label="Apps" href="#app-shell" icon={SquaresPlusIcon} />
      <NavHeadingMenuItem label="Routes" href="#app-shell" icon={MapIcon} />
    </NavHeadingMenu>
  );
}

function FormlessUserMenu() {
  return (
    <DropdownMenu
      button={{
        label: "User settings",
        tooltip: "User settings",
        variant: "ghost",
        size: "md",
        children: <Avatar name="Drew Peek" size="tiny" />,
      }}
      hasChevron={false}
      placement="above"
      items={[
        {
          type: "section",
          items: [
            { label: "Profile" },
            { label: "Account settings" },
            { label: "Sign out" },
          ],
        },
      ]}
    />
  );
}
