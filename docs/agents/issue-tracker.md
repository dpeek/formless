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

## Repo PRDs

- PRD workstreams live in `prd/*.md`.
- PRD files own chunks, blockers, decisions, evidence, and promote notes.
- Do not create or move PRDs through GitHub Issues unless the user asks.

