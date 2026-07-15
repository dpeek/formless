# Astryx Contract Hygiene

Status: backlog. This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

After the Astryx migration is complete, revisit the presentation contracts only
if the current schema-shaped approach causes a concrete stability, ownership,
or bundle problem.

Possible improvements include removing renderer-unused facts, separating
package-local fixture or session state from public renderer contracts, and
keeping runtime effect-planning details out of presentation payloads.

Do not create presentation-only copies of core schema types solely to remove the
`@dpeek/formless-schema` dependency.
