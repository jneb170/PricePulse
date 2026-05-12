# PricePulse — Read Me First

## 1. Before you start

PricePulse is a rule-based pricing demo for a fictional donated-goods retail chain with 11 stores. It is single-tenant and has no real authentication — the demo-user picker stands in for a manager login so every mutation has a recorded actor. Everything you see is seeded simulated data.

At the top of every page there is an amber **DemoBanner**. State is shared across every visitor to this sandbox, container restarts wipe the database back to its seeded shape, and the banner is dismissible (it stays dismissed for the rest of the session). See `src/client/components/DemoBanner.tsx`.

In the top-right of the header is the **DemoUserPicker** — a dropdown listing the seeded managers (Alex, Sam, Jordan). Buttons that mutate state are disabled until a manager is selected. Switching mid-session is fine: the next request picks up the new user. See `src/client/components/DemoUserPicker.tsx`.

## 2. Dashboard — `src/client/screens/Dashboard.tsx`

**Purpose.** The item-by-store table showing current price, suggested price, 24h velocity, 7d velocity per day, days listed, inventory, and condition.

**At a glance.** Rows with a pending suggestion are tinted blue. The suggested price shows a reason badge (rule fired, manager override, manual correction, or rollback) plus a relative timestamp — hover for the absolute time.

**What you can do.**

- Filter by store, category, or **Pending only**. Filters combine, and a **Clear Filters** button appears when any filter is active.
- **Approve** a pending suggestion — optimistic update, current price flips immediately.
- **Reject** a pending suggestion — reveals an optional note input; a second click confirms.
- **Override** the current price inline via the pencil icon — `$`-prefixed input, required reason field, Enter saves, Esc cancels.

**Worth knowing.** The dashboard polls every 15 seconds and refetches on window focus. Overrides and pending suggestions are independent of each other — overriding a row does not clear a pending suggestion on the same row.

## 3. Rules — `src/client/screens/Rules.tsx` (+ `src/client/rules/RulesList.tsx`, `src/client/rules/RuleForm.tsx`)

**Purpose.** Declarative pricing rules the engine evaluates against current item state.

**At a glance.** A table of rules with priority, name, conditions (for example `velocity 24h < 3, inventory > 10, condition {excellent, good}`), action (`multiply`, `set`, `floor`, or `ceiling`), and an Enabled / Disabled status badge.

**What you can do.**

- **+ New rule** opens a side drawer with name, description, priority, enabled toggle, conditions (dynamic — add and remove rows), and action (one of the four types).
- **Edit** an existing rule — the drawer pre-fills with the rule's current values.
- **Toggle enabled** by clicking the status badge directly.
- **Delete** a rule — confirmation dialog.
- **Run engine** evaluates all enabled rules and writes pending suggestions. A green success banner reports `Engine evaluated X items → Y new suggestions, Z skipped (already pending)` and auto-fades after about 8 seconds.

**Worth knowing.** The form validates on submit only. The client's zod schema mirrors the server's, so validation is end-to-end safe. Running the engine is what populates the suggestions you see on the Dashboard.

## 4. Audit log — `src/client/screens/Audit.tsx`

**Purpose.** The append-only domain-event stream — every state-changing action in the system shows up here.

**At a glance.** A table of events with relative timestamp (hover for ISO), color-coded event badge, actor (manager name, or italicized `system` for engine-driven events), and a human-readable detail. For rule-driven price changes the detail names the firing rule; for overrides it includes the reason; for rule, store, and item events it includes the entity name.

**What you can do.**

- Filter by event type, entity type, and date range (since / until — the bounds are inclusive of the full day).
- Combine filters; a **Clear Filters** button appears when any is active.
- **Load more** to paginate. The cursor is keyed on `(occurredAt, id)`, so events inserted while you browse do not cause skips or duplicates.

**Worth knowing.** Events are never edited or deleted. Rule attribution is preserved on every rule-driven price change.

## 5. Settings — `src/client/screens/Settings.tsx`

**Purpose.** CRUD over the data the demo runs against.

**At a glance.** Two tabs — **Stores** (default) and **Rules** (a read-only view of the rules list).

**What you can do.**

- **+ New store** opens a modal with name, location, and timezone (defaults to `America/Los_Angeles`).
- **Edit** a store opens the same modal, with the addition of an **Active** toggle (only shown when editing, not when creating).
- Browse rules read-only on the Rules tab — for edit and delete, use the Rules screen.

**Worth knowing.** New stores are always created Active; deactivating happens only via Edit.

## 6. Try this first

1. Pick a manager from the top-right dropdown.
2. Go to **Rules** → **+ New rule** (for example, `if velocity_24h < 3 and inventory > 10, multiply price by 0.9`).
3. Click **Run engine** — note the success banner.
4. Go to **Dashboard**; matched rows now show suggested prices with a reason badge.
5. Approve one row, reject one with a note, and override one via the pencil icon.
6. Open the **Audit log** — every action from step 5 (plus `rule.created` and `price_change.proposed` events) is recorded with your manager name as the actor.
