# Key values (key-value pairs)

Built 2026-11-16. Not deployed (backend deploy to Heroku is manual).

A generic way to give records typed sections of "key: value" rows — a product's specifications is the
first use. Nothing here is e-commerce specific.

## Pieces

| Piece | Where |
| --- | --- |
| **Key values** model (`KeyValue`, route `key-values`): name, description, keys (tags) | Built into every **new** project on creation — `library/functions/keyValueKit.function.ts` (`projectHooks.onCreated`) |
| Field kind **`keyvalue`** ("Key-value pairs") | `dynamicModels.function.ts`, `models.controller.ts`, `modelDefinition.model.ts` |
| Which groups a field shows | `library/functions/keyValue.function.ts` → `keyValueGroups()` |
| Endpoint `GET /<route>/get/keyvalue/:field?value=<v>[,<v>]` | `routes-admin/common/router.ts` (read permission) |
| Panel input / view / builder pickers | mint-tenant: `VKeyValue.tsx`, `KeyValueSections.tsx`, `FieldsEditor.tsx` (`KeyValuePickers`) |
| Smoke | `scripts/tenancy-smoke/key-values.mjs` (22 checks) |

## The field's settings

- `groups` — Key values records shown always ("Always show").
- `from` — another field of the same model whose value decides more groups: a link (reference/references),
  a choice (select/multiselect), yes/no or text.
- `rules` — `[{ value, groups }]`: groups per value of `from` (case-insensitive). Needed when `from` is not a link.
- `via` — when `from` is a link: the field on the linked record that lists its groups (a Category's
  "Specifications"). With a link `from` and no `via` / rules, the picked records themselves are the groups.

The field needs `groups` or a `from`. The builder refuses rules without `from`, a non-link `from` without
rules, and a `via` that isn't a link field on the linked model.

## The stored value

```json
[{ "group": "<KeyValue id>", "title": "Display", "description": "The screen",
   "items": [{ "key": "Size", "value": "14 inch" }] }]
```

Mixed, tidied on save (empty rows/sections dropped). Title and description are copied so the record still
reads right if the group is renamed or archived later. The schema hands the panel `kv = { route, from, via?, fixed? }`
and `convertToFormFields` passes it through to the form.

## Decisions

- **D1 — generic model, not "Specifications".** Per the user: one Key values model per project that any
  model can link to directly, by a choice's value, or through a picked record.
- **D2 — tenant scoped.** Key values records are ordinary project records (tenantScoped plugin + project
  scope), so a store only sees its own.
- **D3 — new projects only.** Existing projects/stores are not given the model and no store upgrade runs
  (user: "do not need to add in existing apps now"). Think Tech's own Specification model is untouched.
  An existing project can still build a model named Key values with route `key-values` by hand.
- **D4 — values remembered while editing.** Switching the category back before saving brings typed values
  back; only the current sections are saved.
- **D5 — not captured by Template Studio.** `groups`/`rules` hold project-specific ids; `via` is captured.
- **D6 — kept out of automations' field pickers and the public API filters** (it's a list of sections, not a value).

## Not done / later

- Table cell is a placeholder (no column rendering yet).
- Public API returns the stored array as-is; no storefront component yet.
- No migration to add Key values to existing projects (by choice, D3).
