import { AppShell } from "@astryxdesign/core/AppShell";
import { FormlessMainContent } from "./content.tsx";
import { FormlessSideNav } from "./side-nav.tsx";

export function FormlessAppShell() {
  return (
    <AppShell contentPadding={6} sideNav={<FormlessSideNav />}>
      <FormlessMainContent />
    </AppShell>
  );
}
