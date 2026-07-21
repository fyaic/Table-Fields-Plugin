"use strict";

/*
 * Table Fields — v0.1
 * Goal of this spike (PRD §14): prove the #1 risk (Q2) — interactive typed cells that
 * write back to the EXACT Markdown source range, while the table stays a plain pipe table.
 *
 * Approach (grounded in research, matches decisions C5/C6):
 *   - registerMarkdownPostProcessor runs for BOTH Reading view and Live Preview's
 *     *inactive* (rendered) tables. This is the stable path (Q3).
 *   - ctx.getSectionInfo(el) hands back the full doc text + the table's source line range,
 *     so we can locate and replace the exact cell on write-back.
 *   - When the user clicks into the table in Live Preview, Obsidian natively reverts it to
 *     source (known limitation) — controls simply aren't shown then. That is the honest,
 *     non-surprising fallback the PRD §9 describes, not a bug.
 *
 * Config lives in an HTML comment directly above the table (PRD §10, Strategy A), e.g.:
 *   <!-- table-fields id="tasks" v="1"
 *   cols:
 *     - {name: "Task",   type: "text"}
 *     - {name: "Status", type: "select", options: ["Todo","Doing","Done"]}
 *     - {name: "Due",    type: "date"}
 *     - {name: "Amount", type: "currency", options: ["USD"]}
 *     - {name: "Done",   type: "checkbox"}
 *   -->
 */

const { Plugin, Notice, MarkdownView, Menu, PluginSettingTab, MarkdownRenderer, editorLivePreviewField } = require("obsidian");
const { StateField, RangeSetBuilder } = require("@codemirror/state");
const { EditorView, Decoration, WidgetType } = require("@codemirror/view");

/* ------------------------------ config parsing ------------------------------ */

// Parse the body of a `<!-- table-fields ... -->` comment into { id, version, cols }.
function parseConfigBlock(raw) {
	const idMatch = raw.match(/id\s*=\s*"([^"]*)"/);
	const vMatch = raw.match(/\bv\s*=\s*"([^"]*)"/);
	const cols = [];
	const colRe = /-\s*\{([^}]*)\}/g;
	let m;
	while ((m = colRe.exec(raw)) !== null) {
		const body = m[1];
		const name = (body.match(/name\s*:\s*"([^"]*)"/) || [])[1] || "";
		const type = (body.match(/type\s*:\s*"([^"]*)"/) || [])[1] || "text";
		let options = [];
		const optM = body.match(/options\s*:\s*\[([^\]]*)\]/);
		if (optM) {
			options = optM[1]
				.split(",")
				.map((s) => s.trim().replace(/^"|"$/g, ""))
				.filter((s) => s.length > 0);
		}
		cols.push({ name, type, options });
	}
	return { id: idMatch ? idMatch[1] : null, version: vMatch ? vMatch[1] : "1", cols };
}

// Given the full document text and the table's first (header) line index,
// find the table-fields config comment immediately above it (blank lines allowed).
function findConfigForTable(text, headerLine) {
	const lines = text.split("\n");
	let i = headerLine - 1;
	// skip blank lines between the comment and the table
	while (i >= 0 && lines[i].trim() === "") i--;
	if (i < 0) return null;
	// the line at i must be the closing `-->` of a comment
	if (!/-->\s*$/.test(lines[i])) return null;
	// walk up to the opening `<!-- table-fields`
	let start = i;
	while (start >= 0 && !/<!--\s*table-fields\b/.test(lines[start])) start--;
	if (start < 0) return null;
	const block = lines.slice(start, i + 1).join("\n");
	const inner = block.replace(/^[\s\S]*?table-fields\b/, "").replace(/-->\s*$/, "");
	return parseConfigBlock(inner);
}

/* ------------------------------ cell utilities ------------------------------ */

const CHECKBOX_RE = /^\[[ xX]\]$/;

function isChecked(raw) {
	return /^\[[xX]\]$/.test(raw.trim());
}

// Split a Markdown table row into { parts, cellOffset } so cell index -> parts index.
function splitRow(line) {
	const parts = line.split("|");
	// leading pipe => parts[0] is empty/whitespace; cells begin at index 1
	const leading = parts.length > 0 && parts[0].trim() === "";
	return { parts, cellOffset: leading ? 1 : 0 };
}

function formatCurrency(raw, code) {
	const n = Number(String(raw).replace(/[, ]/g, ""));
	if (!isFinite(n)) return null;
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: code || "USD",
		}).format(n);
	} catch (e) {
		return (code || "$") + " " + n.toFixed(2);
	}
}

function formatDate(raw) {
	const v = raw.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
	const d = new Date(v + "T00:00:00");
	if (isNaN(d.getTime())) return null;
	return d.toLocaleDateString();
}

/* ------------------------------ the plugin ------------------------------ */

module.exports = class MarkdownSmartTablesPlugin extends Plugin {
	async onload() {
		// Reading view + inactive Live Preview content: markdown post-processor.
		this.registerMarkdownPostProcessor((el, ctx) => this.enhanceTables(el, ctx));

		// Live Preview (the native CM6-rendered table): a CodeMirror 6 editor extension
		// that replaces the table's source lines with our own interactive table widget.
		this.registerEditorExtension(smartTableField);

		this.addCommand({
			id: "mark-as-table-fields",
			name: "Mark table under cursor as Table Fields",
			editorCallback: (editor) => this.markTableAsSmart(editor),
		});

		// Settings tab: Usage guide + copy-pasteable AI skill (two sub-tabs).
		this.addSettingTab(new TableFieldsSettingTab(this.app, this));

		console.log("[table-fields] loaded (v0.1 spike)");
	}

	onunload() {
		console.log("[table-fields] unloaded");
	}

	/* --- rendering path (Reading view + inactive Live Preview tables) --- */

	enhanceTables(el, ctx) {
		try {
			const tables = el.findAll ? el.findAll("table") : Array.from(el.querySelectorAll("table"));
			if (tables.length === 0) return;
			console.log("[tf] enhanceTables: found", tables.length, "table(s) in section");
			for (const table of tables) {
				const info = ctx.getSectionInfo(el);
				if (!info) {
					console.log("[tf]  -> getSectionInfo returned NULL (cannot locate source lines)");
					continue;
				}
				const config = findConfigForTable(info.text, info.lineStart);
				console.log(
					"[tf]  -> lineStart=", info.lineStart,
					"| headerLine=", JSON.stringify((info.text.split("\n")[info.lineStart] || "").slice(0, 40)),
					"| config cols=", config ? config.cols.length : "none"
				);
				if (!config || config.cols.length === 0) continue; // plain table -> untouched

				table.classList.add("tf-table");
				const rows = Array.from(table.querySelectorAll("tbody tr"));
				console.log("[tf]  -> enhancing", rows.length, "row(s),", config.cols.length, "col(s)");
				rows.forEach((tr, rowIndex) => {
					const cells = Array.from(tr.children).filter((c) => c.tagName === "TD");
					cells.forEach((td, colIndex) => {
						const col = config.cols[colIndex];
						if (!col) return;
						this.enhanceCell(td, col, rowIndex, colIndex, el, ctx);
					});
				});
			}
		} catch (e) {
			console.error("[tf] enhanceTables error:", e);
		}
	}

	enhanceCell(td, col, rowIndex, colIndex, el, ctx) {
		const raw = (td.textContent || "").trim();
		switch (col.type) {
			case "checkbox": {
				if (!CHECKBOX_RE.test(raw)) return;
				const input = td.createEl("input", { type: "checkbox" });
				input.checked = isChecked(raw);
				input.classList.add("tf-checkbox");
				td.textContent = "";
				td.appendChild(input);
				td.classList.add("tf-cell-center");
				this.registerDomEvent(input, "change", () => {
					this.writeBackCell(el, ctx, rowIndex, colIndex, input.checked ? "[x]" : "[ ]");
				});
				break;
			}
			case "select": {
				const select = document.createElement("select");
				select.classList.add("tf-select");
				const opts = col.options && col.options.length ? col.options : [raw];
				if (!opts.includes(raw)) opts.unshift(raw); // keep current value selectable
				for (const o of opts) {
					const opt = select.createEl("option", { text: o });
					if (o === raw) opt.selected = true;
				}
				td.textContent = "";
				td.appendChild(select);
				this.registerDomEvent(select, "change", () => {
					this.writeBackCell(el, ctx, rowIndex, colIndex, select.value);
				});
				break;
			}
			case "currency": {
				const formatted = formatCurrency(raw, col.options && col.options[0]);
				if (formatted != null) td.textContent = formatted;
				td.classList.add("tf-cell-right");
				break;
			}
			case "percentage": {
				td.classList.add("tf-cell-right");
				break;
			}
			case "date": {
				const formatted = formatDate(raw);
				if (formatted != null) {
					td.textContent = formatted;
					td.setAttr("title", raw); // keep ISO discoverable on hover
				}
				td.classList.add("tf-cell-date");
				break;
			}
			default:
				break; // text: leave as-is
		}
	}

	/* --- write-back: replace the exact cell in the Markdown source (Q2) --- */

	writeBackCell(el, ctx, rowIndex, colIndex, newValue) {
		const info = ctx.getSectionInfo(el); // fresh lookup — line numbers may have drifted
		if (!info) {
			new Notice("Table Fields: could not locate table source.");
			return;
		}
		// header = lineStart, delimiter = lineStart+1, data rows start at lineStart+2
		const dataLine = info.lineStart + 2 + rowIndex;

		const apply = (lineText) => {
			const { parts, cellOffset } = splitRow(lineText);
			const idx = cellOffset + colIndex;
			if (idx < 0 || idx >= parts.length) return null;
			parts[idx] = " " + newValue + " ";
			return parts.join("|");
		};

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && view.file && view.file.path === ctx.sourcePath && view.editor) {
			const editor = view.editor;
			if (dataLine >= editor.lineCount()) return;
			const cur = editor.getLine(dataLine);
			const next = apply(cur);
			if (next != null && next !== cur) editor.setLine(dataLine, next);
			return;
		}

		// fallback: no matching active editor — patch the file on disk safely
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!file) return;
		this.app.vault.process(file, (data) => {
			const lines = data.split("\n");
			if (dataLine >= lines.length) return data;
			const next = apply(lines[dataLine]);
			if (next != null) lines[dataLine] = next;
			return lines.join("\n");
		});
	}

	/* --- command: mark the table under the cursor as a smart table --- */

	markTableAsSmart(editor) {
		const cursor = editor.getCursor();
		let top = cursor.line;
		let bottom = cursor.line;
		const isTableRow = (n) =>
			n >= 0 && n < editor.lineCount() && editor.getLine(n).includes("|");

		if (!isTableRow(cursor.line)) {
			new Notice("Table Fields: place the cursor inside a Markdown table.");
			return;
		}
		while (isTableRow(top - 1)) top--;
		while (isTableRow(bottom + 1)) bottom++;

		// bail if a config comment already sits directly above
		let above = top - 1;
		while (above >= 0 && editor.getLine(above).trim() === "") above--;
		if (above >= 0 && /-->\s*$/.test(editor.getLine(above))) {
			new Notice("Table Fields: this table already has a config comment.");
			return;
		}

		const headerCells = splitRowCells(editor.getLine(top));
		const sampleLine = top + 2 <= bottom ? editor.getLine(top + 2) : null;
		const sampleCells = sampleLine ? splitRowCells(sampleLine) : [];

		const cols = headerCells.map((name, i) => {
			const sample = (sampleCells[i] || "").trim();
			return `  - {name: "${name}", type: "${inferType(sample)}"}`;
		});

		const id = (headerCells[0] || "table").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "table";
		const comment =
			`<!-- table-fields id="${id}" v="1"\n` +
			`cols:\n` +
			cols.join("\n") +
			`\n-->\n`;

		editor.replaceRange(comment, { line: top, ch: 0 });
		new Notice(`Table Fields: marked "${id}" (${headerCells.length} columns). Edit the comment to set column types.`);
	}
};

/* ------------------------------ helpers for the command ------------------------------ */

function splitRowCells(line) {
	const { parts, cellOffset } = splitRow(line);
	const cells = parts.slice(cellOffset);
	// drop trailing empty from a trailing pipe
	if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
	return cells.map((c) => c.trim());
}

function inferType(sample) {
	if (CHECKBOX_RE.test(sample)) return "checkbox";
	if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return "date";
	if (/^\d+(\.\d+)?%$/.test(sample)) return "percentage";
	if (/^\d+(\.\d+)?$/.test(sample)) return "currency";
	return "text";
}

/* ============================================================================
 * Live Preview path — CodeMirror 6 editor extension.
 * Replaces each smart table's source lines with an interactive table widget,
 * unless the cursor is inside the table (then show source for editing).
 * Only active in Live Preview (editorLivePreviewField); Source mode stays raw.
 * ==========================================================================*/

// Scan the whole document for smart tables. Returns, per table, the config plus
// the 0-based line indices of the comment start, header, and last data row.
function findSmartTables(text) {
	const lines = text.split("\n");
	const out = [];
	for (let i = 0; i < lines.length; i++) {
		if (!/<!--\s*table-fields\b/.test(lines[i])) continue;
		let j = i;
		while (j < lines.length && !/-->/.test(lines[j])) j++;
		if (j >= lines.length) continue; // unterminated comment
		let k = j + 1;
		while (k < lines.length && lines[k].trim() === "") k++;
		if (k >= lines.length || !lines[k].includes("|")) continue; // no table below
		const headerLine = k;
		let m = k;
		while (m + 1 < lines.length && lines[m + 1].trim() !== "" && lines[m + 1].includes("|")) m++;
		const block = lines.slice(i, j + 1).join("\n");
		const inner = block.replace(/^[\s\S]*?table-fields\b/, "").replace(/-->[\s\S]*$/, "");
		const config = parseConfigBlock(inner);
		if (config.cols.length > 0) {
			out.push({ configStartLine: i, commentEndLine: j, headerLine, lastRowLine: m, config });
		}
		i = m; // continue scanning after this table
	}
	return out;
}

// Serialize a config object back into a `<!-- table-fields ... -->` comment block.
function serializeConfig(config) {
	const lines = config.cols.map((c) => {
		let s = `  - {name: "${c.name}", type: "${c.type}"`;
		if (c.options && c.options.length) s += `, options: [${c.options.map((o) => `"${o}"`).join(",")}]`;
		return s + "}";
	});
	return (
		`<!-- table-fields id="${config.id || "table"}" v="${config.version || "1"}"\n` +
		`cols:\n` +
		lines.join("\n") +
		`\n-->`
	);
}

// Split a table row into cell segments with absolute doc offsets (between pipes).
function getCellRanges(lineText, lineFrom) {
	const pipes = [];
	for (let i = 0; i < lineText.length; i++) if (lineText[i] === "|") pipes.push(i);
	const cells = [];
	for (let k = 0; k < pipes.length - 1; k++) {
		const innerFrom = pipes[k] + 1;
		const innerTo = pipes[k + 1];
		cells.push({ text: lineText.slice(innerFrom, innerTo), from: lineFrom + innerFrom, to: lineFrom + innerTo });
	}
	return cells;
}

// Replace one cell's source range via a CM6 transaction (the write-back, Q2).
function dispatchCell(view, cell, newValue) {
	view.dispatch({ changes: { from: cell.from, to: cell.to, insert: " " + newValue + " " } });
}

// Render a single interactive/formatted cell into `td` for the Live Preview widget.
function renderWidgetCell(td, col, cell, view) {
	const raw = (cell.text || "").trim();
	switch (col.type) {
		case "checkbox": {
			if (!CHECKBOX_RE.test(raw)) { td.textContent = raw; return; }
			const input = td.createEl("input", { type: "checkbox" });
			input.checked = isChecked(raw);
			input.classList.add("tf-checkbox");
			td.classList.add("tf-cell-center");
			input.addEventListener("change", () => dispatchCell(view, cell, input.checked ? "[x]" : "[ ]"));
			break;
		}
		case "select": {
			const select = document.createElement("select");
			select.classList.add("tf-select");
			const opts = col.options && col.options.length ? col.options.slice() : [raw];
			if (!opts.includes(raw)) opts.unshift(raw);
			for (const o of opts) {
				const opt = select.createEl("option", { text: o });
				if (o === raw) opt.selected = true;
			}
			td.appendChild(select);
			select.addEventListener("change", () => dispatchCell(view, cell, select.value));
			break;
		}
		case "currency": {
			const f = formatCurrency(raw, col.options && col.options[0]);
			td.textContent = f != null ? f : raw;
			td.classList.add("tf-cell-right");
			break;
		}
		case "percentage": {
			td.textContent = raw;
			td.classList.add("tf-cell-right");
			break;
		}
		case "date": {
			const f = formatDate(raw);
			td.textContent = f != null ? f : raw;
			if (f != null) td.setAttr("title", raw);
			td.classList.add("tf-cell-date");
			break;
		}
		default:
			td.textContent = raw;
	}
}

// The block widget that renders a whole smart table interactively in Live Preview.
class SmartTableWidget extends WidgetType {
	constructor(data) {
		super();
		this.data = data;
	}
	eq(other) {
		return other && other.data && other.data.signature === this.data.signature;
	}
	toDOM(view) {
		const wrap = document.createElement("div");
		wrap.className = "tf-lp-wrap";
		const table = document.createElement("table");
		table.className = "tf-table tf-lp-table";

		const thead = document.createElement("thead");
		const htr = document.createElement("tr");
		this.data.config.cols.forEach((col, colIndex) => {
			const th = document.createElement("th");
			th.textContent = col.name;
			th.classList.add("tf-th");
			th.setAttr("title", "Right-click to set column type");
			th.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				this.showColumnMenu(view, colIndex, col, evt);
			});
			htr.appendChild(th);
		});
		thead.appendChild(htr);
		table.appendChild(thead);

		const tbody = document.createElement("tbody");
		for (const row of this.data.rows) {
			const tr = document.createElement("tr");
			row.cells.forEach((cell, colIndex) => {
				const col = this.data.config.cols[colIndex];
				const td = document.createElement("td");
				if (col) renderWidgetCell(td, col, cell, view);
				else td.textContent = (cell.text || "").trim();
				tr.appendChild(td);
			});
			tbody.appendChild(tr);
		}
		table.appendChild(tbody);
		wrap.appendChild(table);
		return wrap;
	}
	// Right-click a header -> pick the column's type (rewrites the config comment).
	showColumnMenu(view, colIndex, col, evt) {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Column: " + col.name).setDisabled(true));
		menu.addSeparator();
		const types = ["text", "checkbox", "select", "date", "currency", "percentage"];
		for (const ty of types) {
			menu.addItem((item) => {
				item
					.setTitle(ty)
					.setChecked(col.type === ty)
					.onClick(() => {
						const cols = this.data.config.cols.map((c, i) =>
							i === colIndex ? Object.assign({}, c, { type: ty }) : c
						);
						const cfg = { id: this.data.config.id, version: this.data.config.version, cols };
						view.dispatch({
							changes: { from: this.data.configRange.from, to: this.data.configRange.to, insert: serializeConfig(cfg) },
						});
					});
			});
		}
		menu.showAtMouseEvent(evt);
	}

	// Let our controls handle their own events instead of the editor.
	ignoreEvent() {
		return true;
	}
}

// Build the decoration set for the current editor state.
function buildSmartTableDecorations(state) {
	try {
		if (!state.field(editorLivePreviewField, false)) return Decoration.none; // Source mode -> raw
		const text = state.doc.toString();
		const tables = findSmartTables(text);
		if (!tables.length) return Decoration.none;
		const sel = state.selection.main;
		const builder = new RangeSetBuilder();
		for (const t of tables) {
			const fromLine = state.doc.line(t.configStartLine + 1);
			const toLine = state.doc.line(t.lastRowLine + 1);
			const from = fromLine.from;
			const to = toLine.to;
			if (sel.to >= from && sel.from <= to) continue; // cursor inside -> show source

			const rows = [];
			const sigParts = [];
			for (let ln = t.headerLine + 2; ln <= t.lastRowLine; ln++) {
				const line = state.doc.line(ln + 1);
				const cells = getCellRanges(line.text, line.from);
				rows.push({ cells });
				sigParts.push(cells.map((c) => c.text).join("|"));
			}
			const signature =
				from + ":" + to + ":" + t.config.cols.map((c) => c.type + "/" + (c.options || []).join(".")).join(",") + ":" + sigParts.join("//");
			const configRange = {
				from: state.doc.line(t.configStartLine + 1).from,
				to: state.doc.line(t.commentEndLine + 1).to,
			};
			const widget = new SmartTableWidget({ config: t.config, rows, signature, configRange });
			builder.add(from, to, Decoration.replace({ widget, block: true }));
		}
		return builder.finish();
	} catch (e) {
		console.error("[tf] LP buildDecorations error:", e);
		return Decoration.none;
	}
}

const smartTableField = StateField.define({
	create(state) {
		return buildSmartTableDecorations(state);
	},
	update(deco, tr) {
		if (!tr.docChanged && !tr.selection) return deco;
		return buildSmartTableDecorations(tr.state);
	},
	provide(f) {
		return EditorView.decorations.from(f);
	},
});

/* ============================================================================
 * Settings tab — two sub-tabs: "Usage guide" and "AI skill" (copy-paste).
 * ==========================================================================*/

const USAGE_MD = [
	"# Table Fields",
	"",
	"Plain Markdown tables you can click: checkboxes, dropdowns, and tidy dates, money, and",
	"percentages — all inside your note. It stays a normal table underneath.",
	"",
	"## What it does",
	"",
	"- **Checkboxes you can tick** — click to mark something done, right in the table.",
	"- **Dropdowns** — pick a status or category from a fixed list, so values never drift.",
	"- **Money, %, and dates that look right** — amounts line up with a currency symbol, dates read",
	"  in your local format, percentages align neatly.",
	"- **Right-click a column header** to set what it is — no config screen to hunt through.",
	"- **Works while you read *and* while you edit.**",
	"- **Nothing locked in** — it is always a plain Markdown table on disk.",
	"",
	"## Set up a table",
	"",
	"Put a small config comment directly above a normal pipe table:",
	"",
	"    <!-- table-fields id=\"tasks\" v=\"1\"",
	"    cols:",
	"      - {name: \"Task\",   type: \"text\"}",
	"      - {name: \"Status\", type: \"select\", options: [\"Todo\",\"Doing\",\"Done\"]}",
	"      - {name: \"Due\",    type: \"date\"}",
	"      - {name: \"Done\",   type: \"checkbox\"}",
	"    -->",
	"    | Task      | Status | Due        | Done |",
	"    | --------- | ------ | ---------- | ---- |",
	"    | Draft PRD | Doing  | 2026-07-22 | [x]  |",
	"",
	"Or: put your cursor in any normal table and run the command **Table Fields: Mark table under",
	"cursor as Table Fields** — it sets up the columns from your data. Then right-click a header to",
	"change a type.",
	"",
	"## Field types",
	"",
	"- **text** — plain text.",
	"- **checkbox** — stored as [x] or [ ], shown as a clickable box.",
	"- **select** — a dropdown; the choices come from the column's options list.",
	"- **date** — stored as YYYY-MM-DD, shown in your local date style.",
	"- **currency** — a plain number (e.g. 1200.00); the symbol comes from options (e.g. USD).",
	"- **percentage** — kept as simple NN% text, right-aligned.",
	"",
	"## Good to know",
	"",
	"- Your values stay plain, readable text; the pretty formatting is only on screen.",
	"- There are no formulas — this is on purpose.",
	"- Turn the plugin off and every table is still clean Markdown.",
].join("\n");

const SKILL_TEXT = [
	"You are assisting a user who uses the Table Fields plugin for Obsidian. Table Fields adds typed,",
	"interactive columns (checkbox, dropdown, date, currency, percentage) to PLAIN Markdown tables,",
	"using a small HTML config comment placed directly above each table. The table on disk stays a",
	"normal GFM pipe table. Help the user read, create, and edit these tables while following the",
	"syntax and storage rules below. Never add formulas and never convert a table into a database or JSON.",
	"",
	"THE CONFIG COMMENT",
	"A Table Fields table is a normal Markdown pipe table with a config comment immediately above it",
	"(blank lines between them are allowed):",
	"",
	"    <!-- table-fields id=\"tasks\" v=\"1\"",
	"    cols:",
	"      - {name: \"Task\",   type: \"text\"}",
	"      - {name: \"Status\", type: \"select\", options: [\"Todo\",\"Doing\",\"Done\"]}",
	"      - {name: \"Due\",    type: \"date\"}",
	"      - {name: \"Amount\", type: \"currency\", options: [\"USD\"]}",
	"      - {name: \"Done\",   type: \"checkbox\"}",
	"    -->",
	"    | Task | Status | Due | Amount | Done |",
	"    | ---- | ------ | --- | ------ | ---- |",
	"    | ...  | ...    | ... | ...    | ...  |",
	"",
	"- id: a short identifier, unique within the note.",
	"- v: config version, keep it \"1\".",
	"- cols: one entry per column, IN THE SAME ORDER as the table columns. Each entry is {name, type, options?}.",
	"  - name should match the header cell text.",
	"  - type is one of: text, checkbox, select, date, currency, percentage.",
	"  - options: for select, the list of allowed values; for currency, a single ISO currency code such as [\"USD\"].",
	"",
	"HOW VALUES ARE STORED (use these exact forms when writing cells)",
	"- text: plain text. Example: Draft PRD",
	"- checkbox: [x] for checked, [ ] for unchecked.",
	"- select: the exact option text. Example: Doing",
	"- date: ISO date YYYY-MM-DD. Example: 2026-07-22",
	"- currency: a plain number, no symbol or commas. Example: 1200.50",
	"- percentage: a number followed by a percent sign. Example: 60%",
	"Values are stored in this plain, canonical form; the plugin only formats them on screen.",
	"",
	"RULES",
	"1. Keep it a valid GFM pipe table: a header row, a --- delimiter row, then data rows. Every row",
	"   starts and ends with a pipe and has the same number of cells as there are columns.",
	"2. The config comment must sit directly above its table, and cols order must match the table's",
	"   column order.",
	"3. Do not invent formulas or computed cells. Percentages and currency are literal values.",
	"4. For select cells, only use values listed in that column's options. If a new value is needed,",
	"   add it to options as well.",
	"5. For checkbox cells, only use [x] or [ ].",
	"6. For dates, always write ISO YYYY-MM-DD in the source (the plugin displays them localized).",
	"7. For currency, store the number only (e.g. 59.00); the symbol comes from options.",
	"8. Preserve the user's other columns and rows; do not reorder columns unless asked.",
	"9. If a note has multiple tables, give each a distinct id.",
	"",
	"READING A TABLE",
	"Read the config comment to learn each column's type, then interpret the cells: [x] means",
	"done/true, a currency number is money in that column's currency, 60% means sixty percent, a",
	"select value is one of the allowed options. Use these meanings to summarize, filter, or answer.",
	"",
	"CREATING OR EDITING A TABLE",
	"- Create: write the config comment, then the pipe table, using the storage forms above.",
	"- Edit a value: change only the target cell, keeping its canonical form.",
	"- Add a column: add a cols entry AND add a cell to the header row, the delimiter row, and every data row.",
	"- Add a row: add one pipe row with a value per column in canonical form.",
	"- Change a column's type: update its type in cols (and options if needed), and make sure existing",
	"  cell values match the new type's storage form.",
	"",
	"EXAMPLE",
	"User: \"Mark 'Draft PRD' as done and add a Priority column with Low/Medium/High.\"",
	"You: set that row's Done cell to [x]; add {name: \"Priority\", type: \"select\", options:",
	"[\"Low\",\"Medium\",\"High\"]} to cols; add a Priority header cell, a delimiter cell, and a value such",
	"as High to every data row.",
].join("\n");

async function renderMarkdownInto(app, md, el, component) {
	try {
		if (MarkdownRenderer && typeof MarkdownRenderer.render === "function") {
			await MarkdownRenderer.render(app, md, el, "", component);
		} else if (MarkdownRenderer && typeof MarkdownRenderer.renderMarkdown === "function") {
			await MarkdownRenderer.renderMarkdown(md, el, "", component);
		} else {
			el.setText(md);
		}
	} catch (e) {
		el.setText(md);
	}
}

class TableFieldsSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.activeTab = "usage";
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("tf-settings");

		const tabbar = containerEl.createDiv({ cls: "tf-tabbar" });
		const body = containerEl.createDiv({ cls: "tf-tabbody" });

		const buttons = {};
		const show = (key) => {
			this.activeTab = key;
			for (const k in buttons) buttons[k].toggleClass("tf-tab-active", k === key);
			body.empty();
			if (key === "skill") this.renderSkill(body);
			else this.renderUsage(body);
		};
		const defs = [
			{ key: "usage", label: "Usage guide" },
			{ key: "skill", label: "AI skill" },
		];
		for (const d of defs) {
			const btn = tabbar.createEl("button", { text: d.label, cls: "tf-tab" });
			buttons[d.key] = btn;
			btn.onclick = () => show(d.key);
		}
		show(this.activeTab);
	}

	renderUsage(el) {
		const md = el.createDiv({ cls: "tf-usage markdown-rendered" });
		renderMarkdownInto(this.app, USAGE_MD, md, this.plugin);
	}

	renderSkill(el) {
		el.createEl("p", {
			cls: "tf-skill-desc",
			text:
				"Copy this and paste it into your AI assistant (Claude, ChatGPT, etc.) so it understands " +
				"Table Fields and can read or edit your tables for you.",
		});
		const bar = el.createDiv({ cls: "tf-skill-bar" });
		const copyBtn = bar.createEl("button", { text: "Copy to clipboard", cls: "mod-cta" });
		const ta = el.createEl("textarea", { cls: "tf-skill-text" });
		ta.value = SKILL_TEXT;
		ta.readOnly = true;
		ta.spellcheck = false;
		ta.setAttr("rows", "22");
		copyBtn.onclick = async () => {
			try {
				await navigator.clipboard.writeText(SKILL_TEXT);
				new Notice("Copied Table Fields AI skill to clipboard");
			} catch (e) {
				ta.select();
				new Notice("Press Ctrl/Cmd-C to copy the selected text");
			}
		};
	}
}
