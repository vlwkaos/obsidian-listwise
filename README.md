# Listwise

Outliner-style list editing for Obsidian. Move, indent, fold and edit list items together with
their children, also when several items are selected or several cursors are active. Every action
is one undo step.

If you outline in Markdown lists and miss the item handling of an outliner such as Workflowy,
Dynalist or Logseq, Listwise makes Obsidian's lists behave that way, without leaving plain
Markdown. Your notes stay ordinary lists that any editor can read.

## Features

| Key or action | Behavior |
|---|---|
| Tab / Shift+Tab | Indent or outdent every selected item (or the item at every cursor) with its children. Shift+Tab keeps the item on its line; the siblings below it become its children. Shift+Tab on a top-level item turns it into a plain line (with a blank line above it when needed) and moves its children up to the top level |
| Move commands | Move the selected items with their children; at the edge of a parent they move into the neighbouring parent |
| Fold commands | Fold or unfold the selected items (Obsidian's own folds; needs "Fold indent") |
| Enter | Split the item; an empty nested item outdents; an empty top item leaves the list; at the end of an open parent, adds a first child; carries `[ ] ` |
| Backspace right after `[ ] ` | Remove the checkbox, keep a plain item |
| Backspace at content start | Merge into the previous visible line (blank lines between are removed). Children move to the item above. Never a dead key |
| Delete at line end | Join the next visible line, same rules |
| Backspace/Delete on a multi-line selection | Delete, then move orphaned children up to a valid depth and renumber |
| Cmd+Backspace (macOS), word delete | Stop at the content start, never eat the bullet or checkbox |
| ArrowLeft / word-left at content start | Go to the end of the previous visible line (Shift extends) |
| Mod+A | Item, then item with children, then each parent, then the list, then the note |
| Drag a bullet | Move the item (or every selected item) before, after or inside another item. Escape cancels. Desktop only |
| Vim `o` / `O` | Insert an item below (after the item's own note lines) or above |

Also:

- Ordered lists keep their start number (`3.` stays `3.`) and renumber after every change; `1)` lists work too.
- Mixed tabs and spaces are read by column. Blank lines between items stay inside the list
  (CommonMark loose lists), so Tab after a blank line still indents.
- Only the changed lines are rewritten; untouched lines keep their exact text. Folds are kept.
- Optional: vertical indentation lines (click to fold or zoom), a cleaner list style.

## Hotkeys

Following Obsidian's plugin guidelines, Listwise sets no default hotkeys for its commands. Tab,
Shift+Tab, Enter, Backspace, Delete and Mod+A work at once; bind the commands in
**Settings → Hotkeys** (search "Listwise"). Suggested keys:

| Command | Suggested key |
|---|---|
| Move list and sublists up / down | Mod+Shift+Up / Mod+Shift+Down |
| Fold / Unfold the list | Mod+Up / Mod+Down |
| Indent / Outdent the list and sublists | (Tab / Shift+Tab already do this) |
| Delete the selected items with their sublists | your choice |

## Coming from Outliner

Listwise follows the behavior and conventions of
[Outliner](https://github.com/vslinko/obsidian-outliner) by Viacheslav Slinko, which many
Obsidian users already know. Command ids and setting names match, so hotkeys you bound to
Outliner's commands keep their meaning. **Disable Outliner before enabling Listwise**: both plugins
handle the same keys.

Where Listwise behaves differently:

1. Every structural action works on multi-item selections and multiple cursors.
2. Ordered lists keep their start number, and `1)` lists are supported.
3. Lists with mixed tabs and spaces, or blank lines between items, stay editable.
4. Each action is a single undo step, and folds survive moves.
5. Shift+Tab on a middle child outdents it in place, as Obsidian's own Shift+Tab does (Outliner
   moves it below its later siblings). Enter on an empty middle item still moves it below them.

Outliner is mature and widely used; Listwise is new. If Outliner already does what you need,
there is no reason to switch.

## Compatibility

- With the [Zoom](https://github.com/vslinko/obsidian-zoom) plugin, an indentation line click can zoom in.
- Popout windows are supported.
- Mobile: the commands have icons, so you can add them to the mobile toolbar; drag and drop is
  desktop only. Mobile has not been tested on devices yet. Please report problems.

## Privacy

Listwise makes no network requests, collects no telemetry, and reads or writes nothing outside the
note you are editing and its own settings.

## Install

- **Community plugins:** search for "Listwise" in Settings → Community plugins (once listed).
- **Manual:** download `main.js`, `manifest.json` and `styles.css` from the latest
  [release](https://github.com/vlwkaos/obsidian-listwise/releases) into
  `<vault>/.obsidian/plugins/listwise/`, then enable Listwise.

## Develop

```sh
npm install
npm run setup -- <vault>     # type-check, build, link into the vault
npm run scenario -- <vault>  # real key and mouse scenarios in the running app
```

`scripts/scenario.mjs` drives the running Obsidian with the `obsidian` CLI. Keys and mouse go
through CDP input events. It edits only its own scratch note (`Listwise Scenarios.md`, or the path
in `LISTWISE_SCENARIO_NOTE`) and checks that this note is active before every step. The move and
fold scenarios expect the suggested hotkeys above. Scenarios live in `scripts/scenarios.mjs`.
Set `LISTWISE_CAPTURE_DIR` to save screenshots from `capture` steps.

| Path | Role |
|---|---|
| `src/core/model.ts` | Parse a list block into an item tree, render it back, indent and renumber rules. Pure |
| `src/core/ops.ts` | List operations on the tree, selection mapping. Pure |
| `src/editor/context.ts` | Read blocks and folds from CodeMirror; apply results as one transaction |
| `src/editor/keys.ts`, `cursor.ts` | Key bindings and the cursor transaction filter |
| `src/editor/dnd.ts`, `lines.ts`, `vim.ts`, `zoom.ts` | Drag and drop, indentation lines, Vim, Zoom plugin bridge |
| `src/commands.ts`, `settings.ts`, `main.ts` | Obsidian commands, settings tab, plugin entry |

## Acknowledgements

Behavior, command ids and settings follow [Outliner](https://github.com/vslinko/obsidian-outliner)
(MIT, Viacheslav Slinko), so its users can switch without relearning. Listwise is a separate
implementation.

## License

[MIT](LICENSE)
