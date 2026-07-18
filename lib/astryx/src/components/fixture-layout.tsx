import * as stylex from "@stylexjs/stylex";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { MediaTheme, useTheme } from "@astryxdesign/core/theme";
import { colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import type { ReactNode } from "react";

export function FormlessFixtureLayout<FixtureId extends string>({
  ariaLabel,
  children,
  fixtures,
  label,
  onSelectionChange,
  selectedFixtureId,
}: {
  ariaLabel: string;
  children: ReactNode;
  fixtures: readonly { id: FixtureId; label: string }[];
  label: string;
  onSelectionChange: (fixtureId: FixtureId) => void;
  selectedFixtureId: FixtureId;
}) {
  const { mode } = useTheme();

  return (
    <>
      <HStack
        aria-label={ariaLabel}
        as="nav"
        justify="center"
        paddingBlock={2}
        paddingInline={4}
        width="100%"
        xstyle={styles.fixtureNav}
      >
        <MediaTheme mode={mode === "light" ? "dark" : "light"}>
          <SegmentedControl
            label={label}
            layout="hug"
            onChange={(value) => onSelectionChange(value as FixtureId)}
            value={selectedFixtureId}
          >
            {fixtures.map((fixture) => (
              <SegmentedControlItem key={fixture.id} label={fixture.label} value={fixture.id} />
            ))}
          </SegmentedControl>
        </MediaTheme>
      </HStack>
      {children}
    </>
  );
}

const styles = stylex.create({
  fixtureNav: {
    backgroundColor: colorVars["--color-background-inverted"],
    overflowX: "auto",
  },
});
