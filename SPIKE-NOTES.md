# Markdown Smart Tables — v0.1 spike notes

This is the de-risking prototype the PRD §14 asks for: prove the highest-risk loop
(**Q2** — interactive typed cells that write back to the *exact* Markdown source range,
on a **plain pipe table**) before building the sidebar or the full type system.

## What this spike proves (works)
- **Config in an adjacent HTML comment** (PRD §10 Strategy A) is parsed and matched to the
  table directly below it. Tables without a comment are left untouched.
- **Rendering path** via `registerMarkdownPostProcessor` — fires in **Reading view** and in
  **Live Preview's inactive (rendered) tables**, so one code path covers both (PRD §11 Q3).
- **Interactive cells + write-back (Q2):**
  - `checkbox` → clickable box, writes `[x]`/`[ ]` back to the exact cell.
  - `select` → dropdown from `options`, writes the chosen text back.
- **Formatting (display only, source stays canonical):** `currency` (Intl), `date` (locale,
  ISO kept in tooltip), `percentage` (right-aligned).
- **Command** "Mark table under cursor as smart table" — inserts a config comment, inferring
  column types from the data (checkbox/date/percentage/currency/text).
- **Disable = clean fallback:** turn the plugin off → plain GFM tables + an ignored comment.
- **Verified** by an offline test (config parse + exact pipe-cell replacement + load/wiring):
  14/14 checks pass. Cell replacement keeps column count intact and touches only the target cell.

## What is deliberately deferred (matches PRD honesty)
- **True cell-by-cell editing while the table is the ACTIVE edit target in Live Preview.**
  Obsidian natively reverts an active table to raw source — a known limitation. Here, controls
  show on the *inactive/rendered* table and the source is edited directly when the cursor is
  inside it (decisions C5/C6). The CM6 `StateField` + `Decoration.replace` widget path that would
  keep widgets live *during* active editing is the next, harder prototype — not attempted here.
- **The configuration sidebar** (Apple Numbers–like). MVP scope, but not needed to prove Q2;
  for now edit the HTML comment by hand or use the command.
- **Column-width re-alignment on write-back** (Open Question #1) — currently writes ` value `
  without re-padding to keep the change minimal.

## How to smoke-test in Obsidian (manual)
1. Reload Obsidian (Ctrl+P → "Reload app without saving") so the new plugin is discovered.
2. Settings → Community plugins → enable **Markdown Smart Tables** (already added to
   `community-plugins.json`).
3. Open `SmartTables-Demo.md` (vault root). In Reading view / Live Preview: toggle a checkbox
   and change a Status dropdown; open the note in source mode and confirm the `.md` updated.
4. Confirm the "Plain table (no config comment)" section is untouched.
5. Disable the plugin → confirm everything is clean plain Markdown again.

## Files
- `manifest.json` — plugin manifest.
- `main.js` — the whole spike (plain JS, no build step; `require('obsidian')`/`@codemirror/*`
  resolve to Obsidian's bundled copies at runtime).
- `styles.css` — minimal cell affordances using Obsidian theme variables.
