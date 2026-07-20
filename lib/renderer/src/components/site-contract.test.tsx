import type { ComponentProps } from "react";
import { describe, expect, it } from "vite-plus/test";
import type {
  SiteBlockNode,
  SitePageTree,
  SitePublicOperationInputFieldNode,
  SitePublicRendererComponent,
  SitePublicRendererProps,
  SitePublicSystemStateRendererComponent,
  SitePublicSystemStateRendererProps,
} from "@dpeek/formless-site-app";

import { publicSitePageFixture } from "../fixtures/public-site-page.ts";
import type {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "../site-renderer.tsx";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

const rendererProps: SitePublicRendererProps = publicSitePageFixture.rendererProps;
const tree: SitePageTree = rendererProps.tree;
const page: SiteBlockNode = tree.page;
const operationField: SitePublicOperationInputFieldNode | undefined = page.placements
  .flatMap(({ block }) => block.placements)
  .flatMap(({ block }) => block.publicOperation?.fields ?? [])[0];
const rendererPropsAreExact: Equal<
  ComponentProps<typeof FormlessSitePageRenderer>,
  SitePublicRendererProps
> = true;
const rendererUsesCanonicalComponent: Equal<
  typeof FormlessSitePageRenderer,
  SitePublicRendererComponent
> = true;
const systemStatePropsAreExact: Equal<
  ComponentProps<typeof FormlessSiteSystemStateRenderer>,
  SitePublicSystemStateRendererProps
> = true;
const systemStateRendererUsesCanonicalComponent: Equal<
  typeof FormlessSiteSystemStateRenderer,
  SitePublicSystemStateRendererComponent
> = true;

describe("Astryx public Site renderer contract", () => {
  it("uses the canonical Site renderer and projection contracts", () => {
    expect(rendererUsesCanonicalComponent).toBe(true);
    expect(rendererPropsAreExact).toBe(true);
    expect(systemStateRendererUsesCanonicalComponent).toBe(true);
    expect(systemStatePropsAreExact).toBe(true);
    expect(rendererProps.linkMode).toBe("installed");
    expect(tree.meta.slug).toBe("home");
    expect(page.type).toBe("page");
    expect(operationField?.name).toBeDefined();
    expect(rendererProps).not.toHaveProperty("currentPath");
  });
});
