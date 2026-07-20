# State Transition Affordance

Status: backlog. This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

Make a visible state-machine field the default home for its valid transitions
across record, list, table, and detail surfaces. Use the existing table pairing
behavior as the reference. Keep separate transition actions only when the
matching field is hidden or absent.

Preserve normal operation execution, pending and disabled state, and success or
error toast feedback. State-transition field facts currently carry availability
and pending state but not result feedback; close that contract gap before
removing paired actions such as `Complete`.
