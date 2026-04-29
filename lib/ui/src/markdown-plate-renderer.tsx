import { cn } from "@formless/ui/utils";
import { useMemo } from "react";
import { createStaticEditor, PlateStatic } from "platejs/static";

import { markdownPlateComponents } from "./markdown-plate-components.js";
import { createMarkdownPlatePlugins } from "./markdown-plate-kit.js";
import {
  decorateMarkdownPlateValue,
  deserializeMarkdownToPlateValue,
  type MarkdownHeadingLevel,
} from "./markdown-plate-value.js";

export type { MarkdownHeadingLevel } from "./markdown-plate-value.js";

export function MarkdownRenderer({
  className,
  content,
  minHeadingLevel,
}: {
  className?: string;
  content: string;
  minHeadingLevel?: MarkdownHeadingLevel;
}) {
  const value = useMemo(
    () =>
      decorateMarkdownPlateValue(
        deserializeMarkdownToPlateValue(content, { minHeadingLevel }),
        content,
        {
          minHeadingLevel,
        },
      ),
    [content, minHeadingLevel],
  );
  const editor = useMemo(
    () =>
      createStaticEditor({
        components: markdownPlateComponents,
        plugins: createMarkdownPlatePlugins(),
        value,
      }),
    [value],
  );

  return (
    <PlateStatic
      className={cn("graph-markdown prose max-w-none dark:prose-invert", className)}
      data-web-markdown-renderer="plate"
      editor={editor}
    />
  );
}
