---
name: rules-update-branch
description: rules.update emits exactly one of rule.enabled / rule.disabled / rule.updated per call
metadata:
  type: project
---

In `src/server/routers/rules.ts`, the `update` mutation's event-type selection is:

```
input.enabled !== undefined && input.enabled !== before.enabled
  ? (input.enabled ? 'rule.enabled' : 'rule.disabled')
  : 'rule.updated'
```

Cases produced:
- `input.enabled === undefined` → `rule.updated`
- `input.enabled === before.enabled` (no-op flip) → `rule.updated`
- toggle off → on → `rule.enabled`
- toggle on → off → `rule.disabled`

**Important nuance:** if the manager flips `enabled` AND changes other fields in the same call, only the dedicated `rule.enabled`/`rule.disabled` event fires — the other field deltas live in `payload.before` vs `payload.after`, not in a separate `rule.updated` event. This is deliberate (one event per mutation) and matches the in-code comment.

**How to apply:** When reviewing changes to `rules.update`, verify the single-event guarantee still holds. Multiple `writeAuditEvent` calls in one update branch would be a regression.

See also: [[audit-api]].
