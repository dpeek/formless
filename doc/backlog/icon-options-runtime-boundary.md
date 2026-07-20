# Icon Options Runtime Boundary

Purpose: capture future work for id-based icon values in generated UI and the
Formless Renderer.

Status: backlog. This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Current State

- Generated icon fields store and edit a string value.
- The current icon picker can choose a built-in SVG source or accept custom SVG
  source through the popover.
- `FormlessUiFieldOptions` has enum, reference, and media asset options, but no
  icon options.
- `FormlessUiEnumOption` can include resolved SVG presentation for enum values.
- The current Formless UI contract and projection preserve existing icon
  behavior, but they do not model icons as selectable runtime options.

## Direction

Icon fields should eventually store an icon id, not SVG source.

The runtime should provide icon options, similar to `mediaAssetOptions`:

- default icon catalog options from the runtime;
- future override or extension points;
- user-added custom SVG icons represented as options with stable ids;
- missing option handling when a stored icon id is not available.

Possible contract shape:

```ts
type FormlessUiIconOption = {
  id: string;
  label: string;
  source: string;
  group?: string;
  custom?: boolean;
  missing?: boolean;
};
```

`FormlessUiFieldOptions` can grow `iconOptions`, and icon editor fields can use
id drafts and stored values. Custom SVG input becomes an intent that creates or
updates an icon option, not the stored field value itself.

## Open Decisions

- Stored id format: catalog id, custom icon id, or namespaced id.
- Storage owner for user-added SVG icons: app records, instance-owned icon
  library, schema extension, or another package boundary.
- Whether enum presentation icons and icon editor fields share one option
  catalog.
- Whether SVG source crosses the field contract only through options.
- Import/export behavior for custom icon options.

## First Slice

A first implementation slice:

1. Add `FormlessUiIconOption` and `iconOptions` to the platform UI contract.
2. Project the default icon catalog into icon options.
3. Define missing icon option behavior.
4. Add tests for icon field projection with catalog, custom, and missing ids.
