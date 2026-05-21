# Issue Tracker

Issue tracker: GitHub Issues for `dpeek/formless`.

Remote evidence: `git@github.com:dpeek/formless.git`.

Use the `gh` CLI for issue operations from this repo.

## Commands

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Unlabel: `gh issue edit <number> --remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

## PRDs

- New PRD workstreams live in GitHub Issues.
- Use a `PRD` title prefix or a PRD label when one exists.
- Put `Branch name: <short-name>` near the top of each PRD issue body.
- Keep branch names short, lower-case, and issue-independent, for example `site-publish`.
- Ralph uses `codex/<short-name>` when the value has no slash.
- `bun ralph --branch <name>` is a one-run override, not the PRD-owned default.
- PRD issues own chunks, blockers, decisions, evidence, and promote notes.
- Existing `prd/*.md` files are legacy workstream records kept until retired.
- Do not create new local PRD files.
- If explicitly assigned a legacy PRD file, update only that file until it is retired.
- Retire legacy PRD files only after their useful shipped facts move into `doc/topics/*.md`.
