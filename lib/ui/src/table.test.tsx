import { describe, expect, it } from "vite-plus/test";

import { renderToStaticMarkup } from "react-dom/server";

import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@dpeek/formless-ui/table";
import {
  Table as RootTable,
  TableBody as RootTableBody,
  TableCell as RootTableCell,
  TableColumn as RootTableColumn,
  TableHeader as RootTableHeader,
  TableRow as RootTableRow,
} from "@dpeek/formless-ui";

describe("Table", () => {
  it("renders the IntentUI-shaped React Aria table slots", () => {
    const markup = renderToStaticMarkup(
      <Table aria-label="Bands">
        <TableHeader>
          <TableColumn id="name" isRowHeader allowsSorting>
            Name
          </TableColumn>
          <TableColumn id="genre">Genre</TableColumn>
        </TableHeader>
        <TableBody>
          <TableRow id="nirvana">
            <TableCell>Nirvana</TableCell>
            <TableCell>Grunge</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(markup).toContain('data-slot="table-header"');
    expect(markup).toContain('data-slot="table-column"');
    expect(markup).toContain('data-slot="table-body"');
    expect(markup).toContain('data-slot="table-row"');
    expect(markup).toContain('data-slot="table-cell"');
    expect(markup).toContain("Nirvana");
    expect(markup).toContain("Grunge");
    expect(markup).toContain("lucide-chevron-down");
  });

  it("renders the default empty state from the table primitive", () => {
    const markup = renderToStaticMarkup(
      <Table aria-label="Empty table">
        <TableHeader>
          <TableColumn id="name" isRowHeader>
            Name
          </TableColumn>
        </TableHeader>
        <TableBody items={[]}>
          {(item: { name: string }) => <TableRow>{item.name}</TableRow>}
        </TableBody>
      </Table>,
    );

    expect(markup).toContain("No data found");
    expect(markup).toContain("No information is currently available in this section.");
  });

  it("keeps the React Aria table surface available from the root export", () => {
    const markup = renderToStaticMarkup(
      <RootTable aria-label="Root table" allowResize>
        <RootTableHeader>
          <RootTableColumn id="name" isRowHeader isResizable>
            Name
          </RootTableColumn>
        </RootTableHeader>
        <RootTableBody>
          <RootTableRow id="root">
            <RootTableCell>Root export</RootTableCell>
          </RootTableRow>
        </RootTableBody>
      </RootTable>,
    );

    expect(markup).toContain('data-slot="table-resizable-container"');
    expect(markup).toContain('data-slot="table-column"');
    expect(markup).toContain("Root export");
  });
});
