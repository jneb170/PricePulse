# PricePulse follow-ups

Non-blocking items identified during build. Each is independently shippable; pick them off when time allows.

---

## UI: audit badge formatting

**Where:** `src/client/screens/Audit.tsx` (the event-type badge component).

**What:** The badge renders event types in screaming uppercase (`PRICE_CHANGE.APPLIED`) but the underlying schema strings are lowercase with a dot separator (`price_change.applied`). The uppercase is a display transform.

**Why it matters:** Minor — but `PRICE_CHANGE.APPLIED` reads as a constant, not a domain event. For interview demo purposes, lowercase with the namespace prefix (`price_change.applied`) communicates "this is the literal event type" more clearly, and color-coding by verb is more legible than caps.

**Fix:** In the audit row component, drop the `.toUpperCase()` (or whatever transform is in use). Optionally split on `.` and show namespace + verb with distinct styling.

---

## Architecture: chicken-and-egg in `useKnownUsers`

**Where:** `src/client/lib/useKnownUsers.ts` and `src/client/components/DemoUserPicker.tsx`.

**What:** The demo-user picker derives its list of users from the audit feed (scanning unique `actorId`/`actorName` pairs from `audit.list`). On a freshly seeded DB, the audit feed contains only system-actor events (rule-engine proposals with `actorId = null`), so the picker is empty. The user can't act until they pick a user, and a user can't appear in the picker until someone has acted as them. We worked around this by pasting a cuid via the manual-entry path.

**Why it matters:** Real bug, not cosmetic — it broke the first end-to-end smoke test. Anyone re-running the demo from a fresh seed will hit it.

**Fix:** Add a `users.list` public procedure on the server (`src/server/routers/users.ts`, mirrored under `appRouter.users`). Have the picker use that as its primary source. Keep `useKnownUsers` as a fallback only when the procedure is unavailable. The `users` table already has the data; this is a small router change plus a small client refactor.

---

## UI: manager override flow

**Where:** `src/client/screens/Dashboard.tsx` (likely a new inline control on each row), and possibly a dedicated detail view.

**What:** The backend has `prices.override` fully implemented — it lets a manager set a price directly, bypassing the suggestion/approval queue, with reason `manager_override`. There is currently no UI for it. The dashboard's only mutations are Approve and Reject on rule-suggested changes.

**Why it matters:** Scott explicitly flagged manager override as an operational concern in the original brief, alongside the audit log and rollback. The backend implements it; the UI just doesn't surface it. Mentioning the backend in a code review is fine but a working UI button is more compelling.

**Fix:** Add a small "Set price" control on each dashboard row (an inline input + button, or a dropdown menu with "Override price…" / "Revert last change…"). Call `trpc.prices.override.useMutation({ itemId, toPriceCents, note })`. Invalidate the dashboard, pending list, and audit list on success. Bonus: surface `prices.revert` on items that have an applied change.

---

## How to add new items to this list

When something comes up that's worth noting but not worth fixing right now, just say *"add this to followups"* and I'll append a new section in this format. Keep each entry short — name the file/area, state the issue, say why it matters, sketch the fix.
