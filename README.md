# Table Fields

**Give your Markdown table columns a type** — checkbox, select, date, currency, percentage — with
inline controls (clickable checkboxes, dropdowns) and clean formatting, in **both Live Preview and
Reading view**.

The whole point: your table stays a **plain Markdown pipe table on disk**. Turn the plugin off and
you're left with an ordinary, readable table — no JSON blob, no database, no note-per-row.

```markdown
<!-- table-fields id="tasks" v="1"
cols:
  - {name: "Task",   type: "text"}
  - {name: "Status", type: "select", options: ["Todo","Doing","Done"]}
  - {name: "Due",    type: "date"}
  - {name: "Done",   type: "checkbox"}
-->
| Task           | Status | Due        | Done |
| -------------- | ------ | ---------- | ---- |
| Draft PRD      | Doing  | 2026-07-22 | [x]  |
| Review designs | Todo   | 2026-07-24 | [ ]  |
```

With the little comment on top, `Status` becomes a dropdown, `Due` is formatted, and `Done` is a
real checkbox you can click — while the source on disk stays exactly the plain table above.

## Features

- ✅ **Typed columns**: text, checkbox, select, date, currency, percentage.
- ✅ **Interactive in Live Preview *and* Reading view**: toggle checkboxes, pick from dropdowns.
- ✅ **Writes back to the exact Markdown cell** — your file stays the source of truth.
- ✅ **Right-click a column header** to set its type (spreadsheet-style; rewrites the config for you).
- ✅ **Auto-detect** column types from existing data via a command.
- ✅ **Clean fallback**: disable the plugin and it's just a normal Markdown table again.

## Why not Bases or a spreadsheet plugin?

- **Obsidian Bases** turns rows into notes — a database. Great when your data wants to be many
  notes; overkill when you just want a little structure in one table in one note.
- **Rich table plugins** usually store the table as a fenced JSON code block, so you lose the plain
  Markdown table.
- **Table Fields** sits in the middle: richer than a plain table, but still *just a pipe table*.

## Quick start

1. Have a normal Markdown table.
2. Put your cursor in it and run **"Table Fields: Mark table under cursor as Table Fields"**
   (`Ctrl`/`Cmd`-`P`). It inserts a config comment with column types inferred from your data.
3. Fine-tune: in Live Preview, **right-click any column header** to change its type. Or edit the
   `<!-- table-fields ... -->` comment by hand.

Tables **without** a `table-fields` comment are left completely untouched.

### The config comment

```markdown
<!-- table-fields id="budget" v="1"
cols:
  - {name: "Item",     type: "text"}
  - {name: "Category", type: "select", options: ["Housing","Food","Utility"]}
  - {name: "Amount",   type: "currency", options: ["USD"]}
  - {name: "Paid",     type: "checkbox"}
-->
```

- `id` — identifies the table (so multiple tables per note don't collide).
- `v` — config version (used for future migrations).
- each column: `name`, `type`, and optional `options` (dropdown values, or a currency code).

## Column types

| Type | Stored in the cell | Shown as |
| --- | --- | --- |
| `text` | plain text | text |
| `checkbox` | `[x]` / `[ ]` | a clickable checkbox |
| `select` | the chosen option's text | a dropdown (options from config) |
| `date` | ISO `YYYY-MM-DD` | locale-formatted (ISO on hover) |
| `currency` | a plain number, e.g. `1200.00` | right-aligned currency (symbol from `options: ["USD"]`) |
| `percentage` | a `NN%` literal, e.g. `60%` | right-aligned |

Values are stored in a **clean, human-readable form**; formatting is display-only. Editing a control
writes the value back to the exact cell in the Markdown source. There are **no formulas** — values
are literals, by design.

## Behavior by view

| View | Behavior |
| --- | --- |
| **Live Preview** | Interactive controls when the cursor is outside the table. Click *into* the table and it becomes normal editable source (by design). |
| **Reading view** | Interactive controls + formatting. |
| **Source mode** | Untouched raw Markdown. |

## Install (manual)

Not in the community catalog yet. To use it:

1. Copy this folder into `<your vault>/.obsidian/plugins/table-fields/`.
2. Obsidian → Settings → Community plugins → enable **Table Fields**.
3. Reload if needed (`Ctrl`/`Cmd`-`P` → "Reload app without saving").

Ships as plain JS — no build step. Files: `manifest.json`, `main.js`, `styles.css`, `versions.json`.

A ready-made `TableFields-Demo.md` (with budget / habit / project tables) is included in this repo's
history for trying things out.

## Roadmap

More spreadsheet-style right-click actions — all just text transforms on the Markdown source:

- Insert / delete / duplicate rows.
- Insert / delete / rename / reorder columns.
- Edit `select` options and currency code from the menu.
- Sort by column.
- Optional column-width auto-alignment on write-back.

Deliberately **not** planned: charts, pivots, a formula engine, cross-table references, or a
database/note-per-row model. Table Fields stays lightweight and Markdown-first.

## How it works (for developers)

- **Reading view** uses `registerMarkdownPostProcessor`.
- **Live Preview** uses a CodeMirror 6 `StateField` that replaces the table's source lines with an
  interactive widget, and yields back to source when the cursor is inside. Source mode is detected
  via Obsidian's `editorLivePreviewField`.
- Edits are applied as minimal CM6 transactions over the exact cell / config source range.
- No bundler required: `require("obsidian")` and `require("@codemirror/*")` resolve to Obsidian's
  bundled copies at runtime.
