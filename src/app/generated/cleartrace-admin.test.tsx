import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import { selectScreenModelByPath } from "../../client/views.ts";
import { cleartraceSeedRecords, cleartraceSourceSchema } from "../../test/schema-apps.ts";
import { bootstrapResponse } from "../../test/protocol-builders.ts";
import { HomeScreen } from "./screen.tsx";

describe("generated ClearTrace admin workflows", () => {
  beforeEach(() => {
    resetClientStore();
  });

  it("renders seeded order workflow sections with related order records", () => {
    const html = renderCleartraceScreen("/", {
      lines: "rec_cleartrace_order_1001",
      samples: "rec_cleartrace_order_1001",
    });

    expect(html).toContain(">Orders<");
    expect(html).toContain(">Customers<");
    expect(html).toContain(">Order lines<");
    expect(html).toContain(">Order samples<");
    expect(html).toContain("CT-1001");
    expect(html).toContain("Ada Research");
    expect(html).toContain("Identity verification for CT-S-1001-A");
    expect(html).toContain("CT-S-1001-A");
    expect(html).toContain("Add order line");
    expect(html).toContain("Add sample");
    expect(html).not.toContain("/schema");
  });

  it("renders seeded report workflow sections with versions and verification records", () => {
    const html = renderCleartraceScreen("/reports", {
      verification: "rec_cleartrace_report_1001_a",
      versions: "rec_cleartrace_report_1001_a",
    });

    expect(html).toContain(">Reports<");
    expect(html).toContain(">Report versions<");
    expect(html).toContain(">Verification<");
    expect(html).toContain("CT-R-1001-A");
    expect(html).toContain("Certificate of analysis CT-S-1001-A");
    expect(html).toContain("VERIFY-CT-1001-A");
    expect(html).toContain("/verify/VERIFY-CT-1001-A");
    expect(html).toContain("Add version");
    expect(html).toContain("Add verification record");
    expect(html).not.toContain("contentHash");
  });
});

function renderCleartraceScreen(path: string, selectedContextBySection: Record<string, string>) {
  const screen = selectScreenModelByPath(cleartraceSourceSchema, path);

  if (!screen) {
    throw new Error(`Missing ClearTrace screen "${path}".`);
  }

  applyBootstrapResponse(
    bootstrapResponse(cleartraceSourceSchema, cleartraceSeedRecords, {
      cursor: cleartraceSeedRecords.length,
      schemaUpdatedAt: "2026-06-09T00:00:00.000Z",
    }),
    "cleartrace",
  );

  return renderToStaticMarkup(
    <HomeScreen
      getSectionSelection={(section) => ({
        selectedContextRecordId: selectedContextBySection[section.id] ?? null,
      })}
      onSelectContext={() => {}}
      onSelectQuery={() => {}}
      screen={screen}
      today="2026-06-09"
    />,
  );
}
