# Table Fields

Give your Markdown table **columns a type** — checkbox, select, date, currency, percentage —
and get inline controls (clickable checkboxes, dropdowns) and clean formatting, **in both Live
Preview and Reading view**.

The whole point: your table stays a **plain Markdown pipe table on disk**. Turn the plugin off
and you're left with an ordinary, readable table — no JSON blob, no database, no note-per-row.

```
| Task           | Status | Owner | Due        | Done |
| -------------- | ------ | ----- | ---------- | ---- |
| Draft PRD      | Doing  | Alice | 2026-07-22 | [x]  |
| Review designs | Todo   | Bob   | 2026-07-24 | [ ]  |
```

With a small config comment above it (below), `Status` becomes a dropdown, `Due` is formatted,
and `Done` becomes a real checkbox you can click — while the source stays exactly the table above.

## Why not just use Bases / a spreadsheet plugin?

- **Bases** turns rows into notes — a database. Great when your data wants to be many notes;
  overkill when you just want a little structure in one table in one note.
- **Rich table plugins** typically store the table as a fenced JSON code block, so you lose the
  plain Markdown table.
- **Table Fields** sits in the middle: richer than a plain table, but still *just a pipe table*.

## How it works

Add an HTML comment directly above a table to declare column types:

```
<!-- table-fields id="tasks" v="1"
cols:
  - {name: "Task",   type: "text"}
  - {name: "Status", type: "select", options: ["Todo","Doing","Done"]}
  - {name: "Owner",  type: "text"}
  - {name: "Due",    type: "date"}
  - {name: "Done",   type: "checkbox"}
-->
| Task | Status | Owner | Due | Done |
| ---- | ------ | ----- | --- | ---- |
| ...  | ...    | ...   | ... | ...  |
```

Or let the plugin write it for you: put the cursor in a table and run the command
**"Table Fields: Mark table under cursor as Table Fields"** — it infers column types from the data.

**Spreadsheet-style editing:** in Live Preview, **right-click a column header** to set that
column's type — the config comment is rewritten for you, no sidebar needed. (More right-click
actions — insert/delete rows and columns, edit select options — are on the roadmap.)

Tables **without** this comment are left completely untouched.

## Column types

| Type | Stored in the cell | Shown as |
| --- | --- | --- |
| `text` | plain text | text |
| `checkbox` | `[x]` / `[ ]` | a clickable checkbox |
| `select` | the chosen option's text | a dropdown (options from config) |
| `date` | ISO `YYYY-MM-DD` | locale-formatted (ISO on hover) |
| `currency` | a plain number, e.g. `1200.00` | right-aligned currency (symbol from `options: ["USD"]`) |
| `percentage` | a `NN%` literal, e.g. `60%` | right-aligned |

Values are stored in a **clean, human-readable form**; formatting is display-only. Editing a
control writes the value back to the exact cell in the Markdown source.

## Behavior by view

| View | Behavior |
| --- | --- |
| **Live Preview** | Interactive controls when the cursor is outside the table. Click *into* the table and it becomes normal editable source (by design). |
| **Reading view** | Interactive controls + formatting (read-only text cells). |
| **Source mode** | Untouched raw Markdown. |

## Install (manual)

This plugin isn't in the community catalog. To use it:

1. Copy this folder to `<your vault>/.obsidian/plugins/table-fields/`.
2. In Obsidian: Settings → Community plugins → enable **Table Fields**.
3. Reload if needed (Ctrl/Cmd-P → "Reload app without saving").

Files: `manifest.json`, `main.js` (plain JS, no build step), `styles.css`.

## Current status & limitations (v0.1)

This is an early, working version focused on proving the core loop (typed cells ↔ Markdown
write-back). Known limitations:

- **Set column types** by right-clicking a header (Live Preview), editing the comment, or the
  mark command. A full sidebar isn't planned — right-click is the spreadsheet-style path.
- **Column widths aren't re-aligned** on write-back (cells are written as ` value `).
- **No formulas** (e.g. auto-computed percentages) — by design; values are literals.
- Currency/percentage/date cells format for display but are not yet inline-editable controls
  (checkbox and select are).

## Notes for developers

- Reading view uses `registerMarkdownPostProcessor`; Live Preview uses a CodeMirror 6
  `StateField` that replaces the table's source lines with an interactive widget (and yields to
  source when the cursor is inside). Source mode is detected via Obsidian's
  `editorLivePreviewField`.
- No bundler required: `require("obsidian")` and `require("@codemirror/*")` resolve to Obsidian's
  bundled copies at runtime.
