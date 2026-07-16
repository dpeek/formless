import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import { ToastViewport } from "@astryxdesign/core/Toast";
import { createStaticSource, type SearchableItem } from "@astryxdesign/core/Typeahead";
import { FormlessAuthLayout } from "./components/auth.tsx";
import { FormlessApplicationShellLayout } from "./components/application-shell.tsx";
import { FormlessCreateSurfacesLayout } from "./components/create-surfaces.tsx";
import { FormlessCanonicalFieldsLayout } from "./components/formless-ui-fields.tsx";
import { FormlessFieldsLayout } from "./components/fields.tsx";
import { FormlessGeneratedFieldsLayout } from "./components/generated-fields.tsx";
import { FormlessGeneratedWorkspaceLayout } from "./components/generated-workspace.tsx";
import { FormlessListsLayout } from "./components/lists.tsx";
import { FormlessOperationsLayout } from "./components/operations.tsx";
import { FormlessRecordResultsLayout } from "./components/record-results.tsx";
import { FormlessSiteLayout } from "./components/site.tsx";
import { FormlessTablesLayout } from "./components/tables.tsx";
import { FormlessThemeProvider } from "./theme.tsx";
import type { FormlessUiDocumentThemeContract } from "./formless-ui-contract.ts";

type FormlessPrototypeLayout = {
  name: string;
  anchor: string;
  render: () => ReactNode;
};

type LayoutCommandItem = SearchableItem<{
  anchor: string;
  group: string;
}>;

const formlessPrototypeLayouts: FormlessPrototypeLayout[] = [
  createFormlessPrototypeLayout("Public Site", () => <FormlessSiteLayout />),
  createFormlessPrototypeLayout("Auth", () => <FormlessAuthLayout />),
  createFormlessPrototypeLayout("Operations", () => <FormlessOperationsLayout />),
  createFormlessPrototypeLayout("Create", () => <FormlessCreateSurfacesLayout />),
  createFormlessPrototypeLayout("Fields", () => <FormlessFieldsLayout />),
  createFormlessPrototypeLayout("Canonical Fields", () => <FormlessCanonicalFieldsLayout />),
  createFormlessPrototypeLayout("Generated Fields", () => <FormlessGeneratedFieldsLayout />),
  createFormlessPrototypeLayout("Generated Workspace", () => <FormlessGeneratedWorkspaceLayout />),
  createFormlessPrototypeLayout("Application Shell", () => <FormlessApplicationShellLayout />),
  createFormlessPrototypeLayout("Record Results", () => <FormlessRecordResultsLayout />),
  createFormlessPrototypeLayout("Lists", () => <FormlessListsLayout />),
  createFormlessPrototypeLayout("Tables", () => <FormlessTablesLayout />),
];

const defaultLayout = formlessPrototypeLayouts[0];
const layoutByAnchor = new Map(formlessPrototypeLayouts.map((layout) => [layout.anchor, layout]));
const layoutCommandItems: LayoutCommandItem[] = formlessPrototypeLayouts.map((layout) => ({
  id: layout.anchor,
  label: layout.name,
  auxiliaryData: {
    anchor: layout.anchor,
    group: "Layouts",
  },
}));
const layoutSearchSource = createStaticSource(layoutCommandItems, {
  keywords: (item) => [item.auxiliaryData?.anchor ?? item.id],
});

const prototypeTheme: FormlessUiDocumentThemeContract = {
  activeMode: "light",
  id: "theme:prototype",
  kind: "documentTheme",
  policy: { kind: "fixed", mode: "light" },
};

export function FormlessRoot() {
  const currentLayoutAnchor = useCurrentLayoutAnchor(defaultLayout.anchor);
  const currentLayout = layoutByAnchor.get(currentLayoutAnchor) ?? defaultLayout;

  return (
    <FormlessThemeProvider theme={prototypeTheme}>
      <ToastViewport position="bottomEnd" maxVisible={5}>
        {currentLayout.render()}
        <FormlessLayoutCommandPalette currentLayoutAnchor={currentLayout.anchor} />
      </ToastViewport>
    </FormlessThemeProvider>
  );
}

type FormlessLayoutCommandPaletteProps = {
  currentLayoutAnchor: string;
};

function FormlessLayoutCommandPalette({ currentLayoutAnchor }: FormlessLayoutCommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((currentIsOpen) => !currentIsOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleValueChange = useCallback((anchor: string) => {
    if (!layoutByAnchor.has(anchor)) {
      return;
    }

    window.location.hash = anchor;
  }, []);

  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      searchSource={layoutSearchSource}
      value={currentLayoutAnchor}
      onValueChange={handleValueChange}
      label="Switch layout"
      emptyBootstrapText="No layouts"
      emptySearchText="No layouts"
    />
  );
}

function useCurrentLayoutAnchor(defaultAnchor: string) {
  const [currentLayoutAnchor, setCurrentLayoutAnchor] = useState(() =>
    resolveLayoutAnchor(readLocationHashAnchor(), defaultAnchor),
  );

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentLayoutAnchor(resolveLayoutAnchor(readLocationHashAnchor(), defaultAnchor));
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [defaultAnchor]);

  return currentLayoutAnchor;
}

function createFormlessPrototypeLayout(
  name: string,
  render: FormlessPrototypeLayout["render"],
): FormlessPrototypeLayout {
  return {
    name,
    anchor: inferLayoutAnchor(name),
    render,
  };
}

function resolveLayoutAnchor(anchor: string | null, defaultAnchor: string) {
  if (anchor && layoutByAnchor.has(anchor)) {
    return anchor;
  }

  return defaultAnchor;
}

function readLocationHashAnchor() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hash.replace(/^#/, "") || null;
}

function inferLayoutAnchor(layoutName: string) {
  return layoutName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}
