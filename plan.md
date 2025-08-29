0) Mission, Loud and Clear

Fix three things without breaking production:

Sub-category filtering shows only sub-categories of the selected category (Sales + Products flows).

Search by barcode value so ops can instantly find items for labels or manual add-to-cart.

Barcode regeneration: clarify/limit behavior to avoid invalidating existing labels unless explicitly chosen.

Do this as a surgical patch, not a reinstall. No touching hardware code (printing, barcode scanner integration). No deep rewrites.

1) Non-Negotiable Guardrails (Read twice)

Do not modify: any printer code, barcode scanner device handlers, low-level IPC for hardware, driver assumptions, or timing.

Do not refactor: stable modules/functions unrelated to the three issues.

No DOM structure churn: keep existing IDs/classes and event bindings intact. Avoid introducing new nested wrappers that risk renderer regressions.

No new global state: if state is needed, keep it local and disposable.

Feature-flag every change with defaults OFF (except the safe subcategory fix which can be ON if isolated and proven harmless).

Zero changes to database schema and existing migrations.

No user-visible copy changes that could expand scope (except concise warnings/labels strictly tied to Issue #3).

Skip deployment/packaging steps here. (Tabrez will do it.)

2) Scope (Tight, Minimal, Patchable)

Files potentially touched (small, contained edits only):

renderer.js (UI logic only; no hardware calls)

main.js (IPC exposure for barcode search, if required)

db.js (read-only lookup method for barcode search)

Out of scope: printing flows, barcode scanner input listeners, invoice/label templates, electron bootstrapping, preload scripts, CSS/theming.

3) Issues & Plans
3.1 Sub-Category Filtering (Sales + Products)

Current: Sub-category dropdown shows all sub-categories.
Goal: Show only sub-categories belonging to the selected category.

Plan:

Keep existing category change events; do not change element IDs or add wrappers.

On category selection:

Filter data client-side using already-available category→subCategory mapping or via the existing data source used for dropdown population.

Reset selection state deterministically (no stale option retained). Do not rely on value comparison quirks.

Refresh dropdown options atomically to avoid UI flicker or phantom selections.

Feature flag: SUBCAT_FILTER_FIX=true (default ON is acceptable if isolated).

Risk: Low. No backend changes. No hardware.

Acceptance checks:

Selecting “Cricket” lists only “Cricket” sub-cats (e.g., “Bats”), excludes “Tennis” items (“Rackets”, “Nets”).

Works identically in Sales and Products flows.

Changing category clears/normalizes sub-category selection every time.

3.2 Search by Barcode Value

Current: Search excludes barcode_value.
Goal: Allow exact or partial lookup by barcode value to quickly find products for label print or manual add.

Plan:

Primary path: Extend existing UI search to include barcode_value alongside name/brand/model. This is UI-only logic; no UI redesign.

Backend assist (if strictly needed):

Add a read-only lookup method in db.js for fast equality match by barcode_value.

Expose via IPC in main.js.

Do not alter scanner event handlers or keyboard wedge behavior—this is for manual text search only.

Feature flag: BARCODE_SEARCH=true (default ON allowed).

Risk: Low. Query-only. No schema change. No hardware.

Acceptance checks:

Typing a full barcode returns that single product immediately.

Partial input narrows results (if current UX supports partials; else exact-match is acceptable).

No degradation in existing name/brand/model search.

3.3 Barcode Regeneration Behavior (Safety First)

Current concern: “Regenerate All Barcodes” may nuke existing values → invalid labels in the field.
Goal: Prevent accidental mass invalidation; enable safe path for only-missing barcodes.

Plan (two-mode model, default safe):

Keep current function unchanged under the hood to avoid regression.

Introduce two logical modes, both behind a feature flag:

Generate Missing Barcodes: Only fill NULL/empty barcode_value. (Default action if invoked programmatically via new safe entry point.)

Regenerate All Barcodes: Existing behavior with a strong confirmation explaining consequences.

If UI text is touched, keep it minimal and precise. Otherwise, implement logic + confirmation gating only.

Feature flags:

BARCODE_REGEN_SAFE_MODE=true (enables “missing-only” path)

BARCODE_REGEN_ALLOW_ALL=false (keeps destructive mode hidden unless explicitly enabled for maintenance)

Risk: Medium if “All” is used; Low if “Missing-only” is default.

Acceptance checks:

Triggering “safe” path does not change existing valid barcodes.

“All” path is explicitly confirmed and not reachable unless the admin toggles the flag.

4) Operational Controls

Feature flags (read at runtime):

SUBCAT_FILTER_FIX (default: true)

BARCODE_SEARCH (default: true)

BARCODE_REGEN_SAFE_MODE (default: true)

BARCODE_REGEN_ALLOW_ALL (default: false)

Logging (non-verbose):

Log feature-flag states once at init.

Log when sub-category filter refresh occurs (categoryId, count).

Log barcode search intent (input length, redacted) and result count (no PII/values).

Log regeneration mode used (missing-only vs all), number of affected rows.

No telemetry expansion beyond these minimal, non-sensitive crumbs.

5) Test Plan (Manual, Production-Safe)

Environment: Local dev with production-like data. No hardware required.

Sub-category filter

Switch categories rapidly; verify sub-cats list always matches parent.

Try previously selected sub-cat; ensure it resets logically.

Validate in Sales and Products.

Barcode search

Search with full barcode → exact 1 result.

Search with partial (if UX supports) → narrowed list.

Confirm name/brand/model searches unaffected.

Barcode regeneration

Prepare dataset: mix of products with/without barcode_value.

Run missing-only mode → only nulls filled; others unchanged.

Attempt all mode with flag off → blocked/unavailable.

Enable all mode temporarily → confirmation appears; abort works; proceed changes all values.

Regression smoke

Add to cart, apply discount, generate quotation, preview invoice, print paths untouched (no execution here, just code path inspection).

Label printing UI reachable; no new errors.

6) Rollback & Safety

Changes are confined to renderer.js, main.js, db.js with feature flags allowing instant logical rollback by toggling values.

No schema migration; no irreversible data writes except when user explicitly confirms “Regenerate All”.

If any anomaly: set flags to disable new behaviors and revert files as a unit.

7) Deliverables (from Gemini)

Minimal diffs to:

renderer.js (subcategory filtering logic; optional UI search expansion)

db.js (barcode lookup, read-only)

main.js (IPC bridge for lookup, if needed)

Feature-flag wiring (env/config read).

Concise confirmation gate text for “Regenerate All” (if UI text is adjusted).

Test notes confirming acceptance checks above.

Note: Do not include deployment/packaging steps. Tabrez handles that.

8) Out-of-Scope (Do not touch)

Printing (invoice, label), device selection, print templates.

Barcode scanner event handling or device libraries.

App-level bundling, preload.js, electron boot, OS services, drivers.

Global CSS/theme, DOM structure contracts.

9) Risk Matrix (short)
Area	Risk	Mitigation
Sub-cat filter	Low	Pure UI filter; atomic refresh; reset selection.
Barcode search	Low	Read-only query; feature-flagged.
Barcode regen	Med (if “All”)	Default to missing-only; hard confirmation; separate flag to enable “All”.
Hardware	Zero	Strictly out-of-scope by policy.
10) Acceptance Summary

Sub-category lists are contextual and stable across tabs.

Users can search by barcode value without touching scanner flows.

Regeneration cannot accidentally invalidate field labels; missing-only mode is safe default, all mode gated.

No regressions in printing or scanner integrations.

Patch remains surgical and reversible.