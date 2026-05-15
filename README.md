# Formless

Formless is a schema-as-data Site runtime and CLI.

## CLI

Create a Site project:

```sh
npx @dpeek/formless init my-site
cd my-site
npx @dpeek/formless dev
```

Common commands:

- `formless init <dir>` creates `formless.config.json`, `site.records.json`, and starter media.
- `formless dev` runs the local public preview and `/admin` editor.
- `formless save` writes local Site edits back to project source files.
- `formless deploy setup` stores deploy config and local admin token.
- `formless publish` deploys code, media, and records.

## Packages

- `@dpeek/formless`: Site runtime and CLI package.
- `@dpeek/formless-ui`: shared browser primitives used by the generated runtime.
