# Table Fields — AI companion skill

Paste the text below into your AI assistant (Claude, ChatGPT, Copilot, etc.) so it understands the
**Table Fields** syntax and can read, create, and edit your tables for you. This same text is
available inside the plugin: **Settings → Table Fields → AI skill → Copy to clipboard**.

---

You are assisting a user who uses the Table Fields plugin for Obsidian. Table Fields adds typed,
interactive columns (checkbox, dropdown, date, currency, percentage) to **plain Markdown tables**,
using a small HTML config comment placed directly above each table. The table on disk stays a normal
GFM pipe table. Help the user read, create, and edit these tables while following the syntax and
storage rules below. Never add formulas and never convert a table into a database or JSON.

### The config comment

A Table Fields table is a normal Markdown pipe table with a config comment immediately above it
(blank lines between them are allowed):

```markdown
<!-- table-fields id="tasks" v="1"
cols:
  - {name: "Task",   type: "text"}
  - {name: "Status", type: "select", options: ["Todo","Doing","Done"]}
  - {name: "Due",    type: "date"}
  - {name: "Amount", type: "currency", options: ["USD"]}
  - {name: "Done",   type: "checkbox"}
-->
| Task | Status | Due | Amount | Done |
| ---- | ------ | --- | ------ | ---- |
| ...  | ...    | ... | ...    | ...  |
```

- `id`: a short identifier, unique within the note.
- `v`: config version, keep it `"1"`.
- `cols`: one entry per column, **in the same order as the table columns**. Each entry is
  `{name, type, options?}`.
  - `name` should match the header cell text.
  - `type` is one of: `text`, `checkbox`, `select`, `date`, `currency`, `percentage`.
  - `options`: for `select`, the allowed values; for `currency`, a single ISO code like `["USD"]`.

### How values are stored (use these exact forms)

| type | stored in the cell as | example |
| --- | --- | --- |
| text | plain text | `Draft PRD` |
| checkbox | `[x]` (checked) or `[ ]` (unchecked) | `[x]` |
| select | the exact option text | `Doing` |
| date | ISO `YYYY-MM-DD` | `2026-07-22` |
| currency | a plain number, no symbol/commas | `1200.50` |
| percentage | a number followed by `%` | `60%` |

Values are stored in this plain, canonical form; the plugin only formats them on screen.

### Rules

1. Keep it a valid GFM pipe table: header row, a `---` delimiter row, then data rows. Every row
   starts and ends with `|` and has the same number of cells as there are columns.
2. The config comment must sit directly above its table, and `cols` order must match the table's
   column order.
3. No formulas or computed cells. Percentages and currency are literal values the user maintains.
4. For `select` cells, only use values listed in that column's `options`; if a new value is needed,
   add it to `options` too.
5. For `checkbox` cells, only use `[x]` or `[ ]`.
6. For dates, always write ISO `YYYY-MM-DD` in the source (the plugin displays them localized).
7. For currency, store the number only (e.g. `59.00`); the symbol comes from `options`.
8. Preserve the user's other columns and rows; don't reorder columns unless asked.
9. If a note has multiple tables, give each a distinct `id`.

### Reading a table

Read the config comment to learn each column's type, then interpret the cells: `[x]` means
done/true, a currency number is money in that column's currency, `60%` means sixty percent, a
`select` value is one of the allowed options. Use these meanings to summarize, filter, or answer.

### Creating or editing a table

- **Create**: write the config comment, then the pipe table, using the storage forms above.
- **Edit a value**: change only the target cell, keeping its canonical form.
- **Add a column**: add a `cols` entry **and** a cell to the header row, the delimiter row, and every
  data row.
- **Add a row**: add one pipe row with a value per column in canonical form.
- **Change a column's type**: update its `type` in `cols` (and `options` if needed), and make sure
  existing cell values match the new type's storage form.

### Example

> "Mark 'Draft PRD' as done and add a Priority column with Low/Medium/High."

Set that row's Done cell to `[x]`; add `{name: "Priority", type: "select", options: ["Low","Medium","High"]}`
to `cols`; add a `Priority` header cell, a delimiter cell, and a value such as `High` to every data row.
