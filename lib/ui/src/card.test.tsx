import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@dpeek/formless-ui/card";
import { CardTitle as RootCardTitle } from "@dpeek/formless-ui";

describe("Card", () => {
  it("renders source-aligned card slots for table empty states", () => {
    const markup = renderToStaticMarkup(
      <Card data-card="root">
        <CardHeader title="Inventory" description="Current stock">
          <CardAction>Refresh</CardAction>
        </CardHeader>
        <CardContent>
          <CardTitle>No data found</CardTitle>
          <CardDescription>No information is currently available.</CardDescription>
        </CardContent>
        <CardFooter>Updated now</CardFooter>
      </Card>,
    );

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="card-header"');
    expect(markup).toContain('data-slot="card-action"');
    expect(markup).toContain('data-slot="card-content"');
    expect(markup).toContain('data-slot="card-footer"');
    expect(markup).toContain('data-slot="card-title"');
    expect(markup).toContain('data-slot="card-description"');
    expect(markup).toContain("No data found");
    expect(markup).toContain("No information is currently available.");
  });

  it("keeps the card primitive available from the root export", () => {
    const markup = renderToStaticMarkup(<RootCardTitle>Root export</RootCardTitle>);

    expect(markup).toContain('data-slot="card-title"');
    expect(markup).toContain("Root export");
  });
});
