import type { SiteBlockNode, SitePlacementNode } from "../../shared/protocol.ts";

export type PublicSitePrimaryImageVariant = "post-detail" | "summary";

export function ImageBlock({ block }: { block: SiteBlockNode }) {
  const aspectRatio = imageAspectRatio(block);

  return (
    <figure className="overflow-hidden rounded-md border border-zinc-200 bg-teal-50 dark:border-zinc-800 dark:bg-teal-950/40">
      {block.href ? (
        <img
          alt={block.label}
          className="h-full w-full object-cover"
          height={block.height}
          src={block.href}
          style={{ aspectRatio }}
          width={block.width}
        />
      ) : (
        <div
          aria-label={block.label}
          className="flex min-h-64 items-center justify-center bg-teal-100 p-6 text-center text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100"
          style={{ aspectRatio }}
        >
          <span>{block.label}</span>
        </div>
      )}
      <figcaption className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
        {block.label}
      </figcaption>
    </figure>
  );
}

export function PrimaryImage({
  placement,
  variant,
}: {
  placement: SitePlacementNode;
  variant: PublicSitePrimaryImageVariant;
}) {
  const block = placement.block;

  if (block.type !== "image") {
    return null;
  }

  const aspectRatio = imageAspectRatio(block);
  const imageClassName =
    variant === "summary"
      ? "block h-auto max-h-64 w-full object-contain sm:max-h-52"
      : "h-full w-full object-cover";
  const placeholderClassName =
    variant === "summary"
      ? "flex min-h-32 items-center justify-center bg-teal-100 p-4 text-center text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100"
      : "flex min-h-48 items-center justify-center bg-teal-100 p-6 text-center text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100";

  return (
    <figure
      className="overflow-hidden rounded-md border border-zinc-200 bg-teal-50 dark:border-zinc-800 dark:bg-teal-950/40"
      data-site-primary-image={variant}
    >
      {block.href ? (
        <img
          alt={block.label}
          className={imageClassName}
          height={block.height}
          src={block.href}
          style={{ aspectRatio }}
          width={block.width}
        />
      ) : (
        <div aria-label={block.label} className={placeholderClassName} style={{ aspectRatio }}>
          <span>{block.label}</span>
        </div>
      )}
    </figure>
  );
}

export function imagePlacements(block: SiteBlockNode): SitePlacementNode[] {
  return block.placements.filter((placement) => placement.block.type === "image");
}

export function primaryImagePlacement(block: SiteBlockNode): SitePlacementNode | undefined {
  return block.placements.find(
    (placement) => placement.slot === "primaryImage" && placement.block.type === "image",
  );
}

export function slottedImagePlacements(block: SiteBlockNode, slot: string): SitePlacementNode[] {
  return block.placements.filter(
    (placement) => placement.slot === slot && placement.block.type === "image",
  );
}

function imageAspectRatio(block: SiteBlockNode): string {
  return block.width && block.height ? `${block.width} / ${block.height}` : "4 / 3";
}
