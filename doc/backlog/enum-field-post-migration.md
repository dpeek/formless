# Enum Field Post-Migration UX

Status: backlog. This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

After enum rendering reaches migration completeness, consider separately:

## Stored-value integrity

- Warn when a required field's stored value is unset.
- Warn when a stored enum value is undeclared.
- Keep stored-integrity warnings distinct from rejected-draft validation errors.
- Define repair or recovery actions for invalid stored values.
- Decide how enum integrity warnings align visually with invalid state-machine values.

## Validation lifecycle

- Decide whether validation-error visibility needs an explicit change, blur, or submit policy independent of commit policy.
- Model touched, pristine, and submitted state only if product behavior requires it.
- Decide whether submit errors revalidate on every later change.

## Options and presentation

- Distinguish unavailable options from options that have not loaded yet.
- Consider state-like badges or filled triggers beyond legacy semantic styling.
- Consider color-only swatches and additional presentation-token families.
- Consider rich icon and semantic-color presentation in Create and Operation forms.
- Revisit empty labels, placeholders, and clearing behavior.
- Consider field-level committed or success feedback.

Each item needs an explicit foundation contract and product decision before it
appears in fixtures or renderers. Astryx must not infer these behaviors from
enum value names or raw presentation tokens.
