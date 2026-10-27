// Scenario data for scripts/scenario.mjs. `doc`/`expect` use | « » markers; `fold` and
// `folded` are 0-based line numbers; `undo` checks that one Mod+Z restores `doc`.
// Indentation is a tab per level (Obsidian default).

const PLUGIN = "app.plugins.plugins['listwise']";

export const scenarios = [
	// Indent and outdent (outliner parity, plus multi-item)
	{ name: 'tab indents item with children', doc: '- a\n- b|\n\t- b1\n- c', keys: ['Tab'], expect: '- a\n\t- b|\n\t\t- b1\n- c', undo: true },
	{ name: 'tab on first item is consumed', doc: '- a|\n- b', keys: ['Tab'], expect: '- a|\n- b' },
	{ name: 'shift-tab outdents in place, later siblings become children', doc: '- a\n\t- b|\n\t\t- b1\n\t- c', keys: ['Shift+Tab'], expect: '- a\n- b|\n\t- b1\n\t- c', undo: true },
	{ name: 'shift-tab on a middle checkbox child keeps its line', doc: '- [ ] a\n\t- [ ] b\n\t- [ ] c|\n\t- [ ] d\n- [ ] e', keys: ['Shift+Tab'], expect: '- [ ] a\n\t- [ ] b\n- [ ] c|\n\t- [ ] d\n- [ ] e' },
	{ name: 'shift-tab on a folded middle item unfolds it', doc: '- a\n\t- b|\n\t\t- b1\n\t- c', fold: [1], keys: ['Shift+Tab'], expect: '- a\n- b|\n\t- b1\n\t- c', folded: [] },
	{ name: 'tab indents every selected item', doc: '- a\n- «b\n- c»\n- d', keys: ['Tab'], expect: '- a\n\t- «b\n\t- c»\n- d', undo: true },
	{ name: 'tab indents at every cursor', doc: '- a\n- b|\n- c\n- d|', keys: ['Tab'], expect: '- a\n\t- b|\n- c\n\t- d|' },
	{ name: 'shift-tab outdents every selected item', doc: '- a\n\t- «b\n\t- c»', keys: ['Shift+Tab'], expect: '- a\n- «b\n- c»' },
	{ name: 'mixed tabs and spaces still outdent', doc: '- a\n  - b\n\t- c|', keys: ['Shift+Tab'], expect: '- a\n  - b\n  - c|' },
	{ name: 'shift-tab on a top item leaves the list, children move up', doc: '- a|\n\t- a1\n\t\t- a11\n\t- a2\n- b', keys: ['Shift+Tab'], expect: 'a|\n- a1\n\t- a11\n- a2\n- b', undo: true },
	{ name: 'shift-tab on selected top items leaves the list', doc: '- «a\n- b»\n\t- b1', keys: ['Shift+Tab'], expect: '«a\nb»\n- b1' },
	{ name: 'shift-tab on a top numbered item renumbers what follows', doc: '1. a\n2. b|\n\t1. x\n3. c', keys: ['Shift+Tab'], expect: '1. a\n\nb|\n1. x\n2. c' },
	{ name: 'shift-tab on a later top item adds a blank line above', doc: '- a\n\t- a1\n- b|\n\t- b1', keys: ['Shift+Tab'], expect: '- a\n\t- a1\n\nb|\n- b1', undo: true },
	{ name: 'shift-tab on a top checkbox item drops the marker', doc: '- [ ] a|\n\t- [ ] a1', keys: ['Shift+Tab'], expect: 'a|\n- [ ] a1' },
	{ name: 'tab in a paragraph keeps the default', doc: 'ab|c', keys: ['Tab'], expect: '\tab|c' },

	// Move (outliner parity, plus multi-item and renumbering)
	{ name: 'move down with children', doc: '- a|\n\t- a1\n- b', keys: ['Mod+Shift+ArrowDown'], expect: '- b\n- a|\n\t- a1', undo: true },
	{ name: 'move up hops into previous parent', doc: '- a\n\t- a1\n- b\n\t- b1|', keys: ['Mod+Shift+ArrowUp'], expect: '- a\n\t- a1\n\t- b1|\n- b' },
	{ name: 'move up a multi-item selection', doc: '- a\n- «b\n- c»', keys: ['Mod+Shift+ArrowUp'], expect: '- «b\n- c»\n- a', undo: true },
	{ name: 'move keeps the list start number', doc: '3. a\n4. b|\n5. c', keys: ['Mod+Shift+ArrowUp'], expect: '3. b|\n4. a\n5. c' },
	{ name: 'move renumbers 1) lists', doc: '1) a\n2) b|', keys: ['Mod+Shift+ArrowUp'], expect: '1) b|\n2) a' },
	{ name: 'move keeps a folded item folded', doc: '- a\n\t- a1\n- b|', fold: [0], keys: ['Mod+Shift+ArrowUp'], expect: '- b|\n- a\n\t- a1', folded: [1], undo: true },
	{ name: 'move with checkboxes and notes', doc: '- [ ] a\n  note a\n- [x] b|', keys: ['Mod+Shift+ArrowUp'], expect: '- [x] b|\n- [ ] a\n  note a' },

	// Enter
	{ name: 'enter splits mid-text, children follow', doc: '- ab|cd\n\t- x', keys: ['Enter'], expect: '- ab\n- |cd\n\t- x', undo: true },
	{ name: 'enter at end of open parent adds first child', doc: '- a|\n\t- x', keys: ['Enter'], expect: '- a\n\t- |\n\t- x' },
	{ name: 'enter on folded parent adds sibling', doc: '- a|\n\t- x', fold: [0], keys: ['Enter'], expect: '- a\n\t- x\n- |', folded: [0] },
	{ name: 'enter on empty nested item outdents', doc: '- a\n\t- |', keys: ['Enter'], expect: '- a\n- |' },
	{ name: 'enter on empty middle item still moves below siblings', doc: '- a\n\t- |\n\t- c', keys: ['Enter'], expect: '- a\n\t- c\n- |' },
	{ name: 'enter on empty top item leaves the list', doc: '- a\n- |', keys: ['Enter'], expect: '- a\n|' },
	{ name: 'enter carries an unchecked checkbox', doc: '- [x] done|', keys: ['Enter'], expect: '- [x] done\n- [ ] |' },
	{ name: 'enter renumbers ordered items', doc: '1. a|\n2. b', keys: ['Enter'], expect: '1. a\n2. |\n3. b' },
	{ name: 'shift-enter keeps the default note line', doc: '- a|', keys: ['Shift+Enter'], expect: '- a\n  |' },

	// Backspace, Delete
	{ name: 'backspace merges into previous item', doc: '- a\n- |b', keys: ['Backspace'], expect: '- a|b', undo: true },
	{ name: 'backspace merges where outliner swallows the key', doc: '- a\n\t- a1\n- |b\n\t- b1', keys: ['Backspace'], expect: '- a\n\t- a1|b\n\t- b1' },
	{ name: 'backspace joins a note line', doc: '- a\n  |note', keys: ['Backspace'], expect: '- a|note' },
	{ name: 'backspace after checkbox removes it, a second one merges', doc: '- [ ] a\n- [ ] |b', keys: ['Backspace', 'Backspace'], expect: '- [ ] a|b' },
	{ name: 'backspace mid-text keeps the default', doc: '- ab|c', keys: ['Backspace'], expect: '- a|c' },
	{ name: 'delete joins the next item', doc: '- a|\n- b', keys: ['Delete'], expect: '- a|b' },
	{ name: 'delete joins the first child, grandchild moves up', doc: '- a|\n\t- b\n\t\t- c', keys: ['Delete'], expect: '- a|b\n\t- c' },
	{ name: 'deleting across items repairs depth', doc: '- x\n- a«b\n- c\n\t- »d\n\t\t- e', keys: ['Backspace'], expect: '- x\n- a|d\n\t- e', undo: true },
	{ name: 'deleting across items renumbers', doc: '1. a\n2. «b\n3. c\n4. »d', keys: ['Backspace'], expect: '1. a\n2. |d' },
	{ name: 'cmd-backspace stops at the checkbox', doc: '- [ ] abc|', keys: ['Mod+Backspace'], expect: '- [ ] |' },
	{ name: 'alt-backspace at content start merges', doc: '- a\n- |b', keys: ['Alt+Backspace'], expect: '- a|b' },

	// Cursor
	{ name: 'arrow-left at content start goes to previous line', doc: '- a\n- |b', keys: ['ArrowLeft'], expect: '- a|\n- b' },
	{ name: 'line start clamps after the checkbox', doc: '- [ ] ab|c', keys: ['Mod+ArrowLeft'], expect: '- [ ] |abc' },
	{ name: 'shift-arrow-left extends to previous line', doc: '- a\n- |b', keys: ['Shift+ArrowLeft'], expect: '- a»\n- «b' },
	{ name: 'arrow-up skips folded lines', doc: '- a\n\t- a1\n- b|', fold: [0], keys: ['ArrowUp'], expect: '- a|\n\t- a1\n- b', folded: [0] },

	// Select all
	{ name: 'mod-a selects the item content', doc: '- a\n\t- b|c\n\t\t- d\n- e', keys: ['Mod+a'], expect: '- a\n\t- «bc»\n\t\t- d\n- e' },
	{ name: 'mod-a twice adds children', doc: '- a\n\t- b|c\n\t\t- d\n- e', keys: ['Mod+a', 'Mod+a'], expect: '- a\n\t- «bc\n\t\t- d»\n- e' },
	{ name: 'mod-a three times selects the parent', doc: '- a\n\t- b|c\n\t\t- d\n- e', keys: ['Mod+a', 'Mod+a', 'Mod+a'], expect: '- «a\n\t- bc\n\t\t- d»\n- e' },
	{ name: 'mod-a four times selects the list', doc: '- a\n\t- b|c\n\t\t- d\n- e', keys: ['Mod+a', 'Mod+a', 'Mod+a', 'Mod+a'], expect: '«- a\n\t- bc\n\t\t- d\n- e»' },

	// Fold commands
	{ name: 'mod-up folds the item', doc: '- a|\n\t- b', keys: ['Mod+ArrowUp'], expect: '- a|\n\t- b', folded: [0] },
	{ name: 'mod-down unfolds the item', doc: '- a|\n\t- b', fold: [0], keys: ['Mod+ArrowDown'], expect: '- a|\n\t- b', folded: [] },

	// Drag and drop
	{ name: 'drag an item after another', doc: '- a|\n\t- a1\n- b\n- c', keys: [{ drag: [0, 2, 'after'] }], expect: '- b\n- |a\n\t- a1\n- c', undo: true },
	{ name: 'drag an item inside another', doc: '- a|\n- b', keys: [{ drag: [0, 1, 'inside'] }], expect: '- b\n\t- |a' },
	{ name: 'drag the selected items together', doc: '- «a\n- b»\n- c', keys: [{ drag: [0, 2, 'after'] }], expect: '- c\n- |a\n- b' },
	{ name: 'escape cancels a drag', doc: '- a|\n- b', keys: [{ drag: [0, 1, 'after', 'escape'] }], expect: '- a|\n- b' },

	// Gaps: nested numbering, hops, commands, settings, code inside items
	{ name: 'indented numbered item starts a new run at 1', doc: '1. a\n2. b|\n3. c', keys: ['Tab'], expect: '1. a\n\t1. b|\n2. c' },
	{ name: 'move down hops into next parent', doc: '- a\n\t- a1|\n- b\n\t- b1', keys: ['Mod+Shift+ArrowDown'], expect: '- a\n- b\n\t- a1|\n\t- b1' },
	{ name: 'delete-items command removes subtrees', doc: '- a\n- «b\n\t- b1\n- c»\n- d', keys: [{ eval: "app.commands.executeCommandById('listwise:delete-items')" }], expect: '- a\n- |d', undo: true },
	{
		name: 'tab setting off keeps the default',
		doc: '- a\n- b|',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ betterTab: false })` }, 'Tab'],
		expect: '- a\n\t- b|',
		after: `await ${PLUGIN}.updateSettings({ betterTab: true })`,
	},
	{
		name: 'stick-cursor never keeps the default backspace',
		doc: '- a\n- |b',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ stickCursor: 'never' })` }, 'Backspace'],
		expect: '- a\n-|b',
		after: `await ${PLUGIN}.updateSettings({ stickCursor: 'bullet-and-checkbox' })`,
	},
	{ name: 'tab inside fenced code in an item keeps the default', doc: '- a\n\t```\n\tx|\n\t```', keys: ['Tab'], expect: '- a\n\t```\n\t\tx|\n\t```' },
	{ name: 'move carries fenced code that looks like a list', doc: '- a\n- b|\n\t```\n\t- not an item\n\t```', keys: ['Mod+Shift+ArrowUp'], expect: '- b|\n\t```\n\t- not an item\n\t```\n- a' },
	{
		name: 'vertical line click folds the children',
		doc: '- a|\n\t- b\n\t\t- c\n\t- d\n\t\t- e',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ listLines: true })` }, { sleep: 200 }, { eval: 'cm.measure()' }, { click: '.listwise-list-line' }],
		folded: [1, 3],
		after: `await ${PLUGIN}.updateSettings({ listLines: false })`,
	},

	// Edge cases from the good-to-go review
	{ name: 'backspace into a folded item joins its first line', doc: '- a\n\t- a1\n- |b', fold: [0], keys: ['Backspace'], expect: '- a|b\n\t- a1', folded: [0] },
	{ name: 'delete at end of a folded item joins the next visible item', doc: '- a|\n\t- a1\n- b', fold: [0], keys: ['Delete'], expect: '- a|b\n\t- a1', folded: [0] },
	{ name: 'enter on a note line splits into a new item', doc: '- a\n  no|te', keys: ['Enter'], expect: '- a\n  no\n- |te' },
	{ name: 'backspace on first item with children makes a paragraph', doc: '- |a\n\t- b', keys: ['Backspace'], expect: '|a\n- b', undo: true },
	{ name: 'cursors in two lists indent in one step', doc: '- a\n- b|\n\ntext\n\n- c\n- d|', keys: ['Tab'], expect: '- a\n\t- b|\n\ntext\n\n- c\n\t- d|', undo: true },
	{ name: 'deleting from the first line start keeps the rest', doc: '«- a\n- b»\n- c', keys: ['Backspace'], expect: '|\n- c' },
	{ name: 'a click on the bullet lands after the checkbox', doc: '- [ ] ab|c', keys: [{ eval: "cm.dispatch({ selection: { anchor: 0 }, userEvent: 'select.pointer' })" }], expect: '- [ ] |abc' },
	{
		name: 'bullet-only mode puts the checkbox in the content',
		doc: '- [ ] ab|c',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ stickCursor: 'bullet-only' })` }, { eval: "cm.dispatch({ selection: { anchor: 0 }, userEvent: 'select.pointer' })" }],
		expect: '- |[ ] abc',
		after: `await ${PLUGIN}.updateSettings({ stickCursor: 'bullet-and-checkbox' })`,
	},

	// Live Preview regressions (user report): indent shown and saved; Backspace after a checkbox removes it
	{ name: 'LP tab indents bullets', doc: '- a\n- b|\n- c', keys: ['Tab'], expect: '- a\n\t- b|\n- c', levels: [1, 2, 1], undo: true },
	{ name: 'LP shift-tab outdents bullets', doc: '- a\n\t- b|', keys: ['Shift+Tab'], expect: '- a\n- b|', levels: [1, 1] },
	{ name: 'LP tab indents numbered items', doc: '1. a\n2. b|\n3. c', keys: ['Tab'], expect: '1. a\n\t1. b|\n2. c', levels: [1, 2, 1] },
	{ name: 'LP tab indents a nested item', doc: '- a\n\t- b\n\t- c|', keys: ['Tab'], expect: '- a\n\t- b\n\t\t- c|', levels: [1, 2, 3] },
	{ name: 'LP shift-tab outdents a nested numbered item', doc: '1. a\n\t1. b\n\t2. c|', keys: ['Shift+Tab'], expect: '1. a\n\t1. b\n2. c|', levels: [1, 2, 1] },
	{
		name: "LP Obsidian's own backspace after a checkbox deletes only the space (Listwise keys off)",
		doc: '- a\n- [ ] |text',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ stickCursor: 'never' })` }, 'Backspace'],
		expect: '- a\n- [ ]|text',
		after: `await ${PLUGIN}.updateSettings({ stickCursor: 'bullet-and-checkbox' })`,
	},
	{
		name: "LP Obsidian's own backspace after an empty checkbox deletes only the space (Listwise keys off)",
		doc: '- a\n- [ ] |',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ stickCursor: 'never' })` }, 'Backspace'],
		expect: '- a\n- [ ]|',
		after: `await ${PLUGIN}.updateSettings({ stickCursor: 'bullet-and-checkbox' })`,
	},
	{ name: 'LP probe tab in a 2-space list', doc: '- a\n  - b\n  - c|', keys: ['Tab'], expect: '- a\n  - b\n    - c|', levels: [1, 2, 3] },
	{ name: 'LP probe shift-tab in a 2-space list', doc: '- a\n  - b|', keys: ['Shift+Tab'], expect: '- a\n- b|', levels: [1, 1] },
	{ name: 'LP probe tab after a blank line', doc: '- a\n\n- b|', keys: ['Tab'], expect: '- a\n\n\t- b|', levels: [1, 0, 2] },
	{ name: 'LP loose list move keeps the list together', doc: '- a\n\n- b|\n- c', keys: ['Mod+Shift+ArrowUp'], expect: '- b|\n- a\n\n- c' },
	{ name: 'LP backspace after a blank line merges the item', doc: '- a\n\n- |b', keys: ['Backspace'], expect: '- a|b' },
	{ name: 'LP probe tab on the first item', doc: '- a|\n- b', keys: ['Tab'], expect: '- a|\n- b' },
	{ name: 'LP probe tab on an empty item', doc: '- a\n- |', keys: ['Tab'], expect: '- a\n\t- |', levels: [1, 2] },
	{ name: 'LP probe tab in a callout list', doc: '> [!note]\n> - a\n> - b|', keys: ['Tab'], expect: '> [!note]\n> - a\n> \t- b|' },
	{ name: 'LP probe tab under a numbered item with 3-space children', doc: '1. a\n   - b\n   - c|', keys: ['Tab'], expect: '1. a\n   - b\n      - c|', levels: [1, 2, 3] },
	{ name: 'LP backspace after a checkbox removes it', doc: '- a\n- [ ] |text', keys: ['Backspace'], expect: '- a\n- |text', levels: [1, 1], undo: true },
	{ name: 'LP backspace after a numbered checkbox removes it', doc: '1. [ ] |text', keys: ['Backspace'], expect: '1. |text', levels: [1] },
	{ name: 'LP backspace after a nested checked box removes it', doc: '- a\n\t- [x] |done', keys: ['Backspace'], expect: '- a\n\t- |done', levels: [1, 2] },
	{ name: 'LP backspace after an empty checkbox removes it', doc: '- a\n- [ ] |', keys: ['Backspace'], expect: '- a\n- |', levels: [1, 1] },

	// Indent unit (user report): one odd '\t ' or 3-space line must not set the indent of the whole list
	{ name: 'odd lines: tab on a leaf indents one tab', doc: '- a\n\t- b\n\t - c\n\t  - d\n- x\n- y|', keys: ['Tab'], expect: '- a\n\t- b\n\t - c\n\t  - d\n- x\n\t- y|', undo: true },
	{ name: 'odd lines: tab next to an odd first child uses the normal column', doc: '- a\n\t - b\n\t- c\n- d|', keys: ['Tab'], expect: '- a\n\t - b\n\t- c\n\t- d|' },
	{ name: 'odd lines: tab before them shifts the subtree one tab', doc: '- a\n- b|\n\t - c\n\t- d', keys: ['Tab'], expect: '- a\n\t- b|\n\t\t - c\n\t\t- d' },
	{ name: 'odd lines: shift-tab after them outdents one tab', doc: '- a\n\t- b\n\t - c\n\t- e|', keys: ['Shift+Tab'], expect: '- a\n\t- b\n\t - c\n- e|', levels: [1, 2, 2, 1] },
	{ name: 'odd lines: nested tab after them indents one more tab', doc: '- a\n\t- b\n\t  - c\n\t- e\n\t- f|', keys: ['Tab'], expect: '- a\n\t- b\n\t  - c\n\t- e\n\t\t- f|', levels: [1, 2, 3, 2, 3] },
	{ name: 'space list with one 3-space line indents by 2', doc: '- a\n  - b\n   - c\n- d\n  - d1\n- e\n- f|', keys: ['Tab'], expect: '- a\n  - b\n   - c\n- d\n  - d1\n- e\n  - f|' },
	{ name: 'space list: tab under a parent with children uses their column', doc: '- a\n  - b\n   - c\n- d\n  - d1\n- e|', keys: ['Tab'], expect: '- a\n  - b\n   - c\n- d\n  - d1\n  - e|' },
	{ name: 'space list: numbered parent child keeps its number (one column past the marker)', doc: '1. a\n2. b|', keys: [{ eval: "cm.dispatch({ changes: { from: 0, insert: '- s\\n  - t\\n\\n' } })" }, 'Tab'], expect: '- s\n  - t\n\n1. a\n    1. b|', levels: [1, 2, 0, 1, 2] },

	// Vertical lines
	{
		name: 'vertical lines draw for open parents',
		doc: '- a|\n\t- b\n\t\t- c\n- d',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ listLines: true })` }, { sleep: 200 }],
		lines: 2,
		after: `await ${PLUGIN}.updateSettings({ listLines: false })`,
	},

	// Visual captures (with LISTWISE_CAPTURE_DIR): drop indicator mid-drag over indentation lines
	{
		name: 'capture drag indicator and lines',
		doc: '- Project plan with a long first item that wraps onto a second visual line in a narrow pane|\n\t- [ ] Research\n\t\t- read outliner source\n\t\t- compare edge cases\n\t- [x] Prototype\n\t- Ship\n1. one\n2. two\n\t1. nested',
		keys: [{ eval: `await ${PLUGIN}.updateSettings({ listLines: true })` }, { sleep: 200 }, { capture: 'listwise-lines.png' }, { drag: [5, 2, 'after', 'capture:listwise-drag.png'] }],
		lines: 3,
		after: `await ${PLUGIN}.updateSettings({ listLines: false })`,
	},
];
