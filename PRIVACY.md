# Privacy

**Payment status: Free.** Table Fields is free to install and use. It has no paid features, no
license gate, no accounts, and does not use any third-party or cloud API for its functionality.

**Table Fields is fully local.** It only reads and writes the Markdown tables inside your own notes,
on your own device. It makes **no network requests**, stores **no API keys**, and the developer
**collects nothing** — no vault data, note contents, telemetry, or logs are sent anywhere.

## Data-flow matrix

| Feature | Default | Local files written | Data sent off device | Your control |
| --- | --- | --- | --- | --- |
| Render typed cells (checkbox, select, date, currency, percentage) | On for tables with a `table-fields` comment | None | None | Remove the comment, or disable the plugin |
| Write-back (toggling a checkbox, picking a dropdown value) | On | Edits the current note only | None | Don't interact; edits only happen on your action |
| Right-click column type / "Mark table" command | Manual | Edits the current note only | None | Only runs when you invoke it |
| Copy AI skill (Settings → AI skill) | Manual | None | None | Writes text **to** your clipboard on click; the plugin never reads clipboard contents |

## Details

- **Where data is written:** only into the note you are editing (the plugin rewrites the exact cell
  or the `<!-- table-fields ... -->` config comment). No hidden files, caches, or databases.
- **Clipboard:** the "Copy to clipboard" button in settings writes the AI-skill text to your
  clipboard. It is write-only and only runs when you click it. The plugin never reads your clipboard.
- **Diagnostics/logs:** the plugin writes a couple of plain lifecycle lines to the developer console
  (e.g. "loaded"). These contain no note content, keys, or personal data.
- **Third parties:** none. The "AI skill" is text you may choose to paste into an AI assistant of
  your choice; if you do, that assistant's provider terms apply to whatever you paste — that is
  outside this plugin.

## Contact

Issues and questions: https://github.com/fyaic/Table-Fields-Plugin/issues
