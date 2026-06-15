import type { SiteBlockNode, SitePlacementNode } from "../types.ts";

export function displayLabel(block: SiteBlockNode, placement?: SitePlacementNode): string {
  return placement?.label ?? block.label;
}

export function PlainText({ className, text }: { className?: string; text: string }) {
  return (
    <div className={className}>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
