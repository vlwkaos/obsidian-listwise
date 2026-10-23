// Obsidian commands (hotkeys bound by the user, mobile toolbar icons). Command ids match
// obsidian-outliner's, so hotkeys a user bound there keep their meaning after switching.

import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Editor, Notice } from 'obsidian';
import { begin, moveDown, moveUp, removeItems, roots } from './core/ops';
import { foldAt, perBlock, selectionBlocks, unfoldAt } from './editor/context';
import { checkboxPrefix, indentItems, outdentItems } from './editor/keys';
import type ListwisePlugin from './main';

const viewOf = (editor: Editor) => (editor as unknown as { cm?: EditorView }).cm ?? null;

const inList = (view: EditorView) => selectionBlocks(view.state).length > 0;

function setFold(view: EditorView, prefix: boolean, fold: boolean) {
	const { state } = view;
	const effects: StateEffect<unknown>[] = [];
	let blocked = false;
	for (const { block, ranges } of selectionBlocks(state)) {
		for (const item of roots(begin(block, [], prefix), ranges)) {
			if (!item.children.length && !item.notes.length) continue;
			if (!fold) {
				effects.push(...unfoldAt(state, item.line));
				continue;
			}
			const effect = foldAt(state, item.line);
			if (effect) effects.push(effect);
			else if (!item.folded) blocked = true;
		}
	}
	if (blocked && !effects.length) new Notice('Unable to fold because folding is disabled. Please enable "Fold indent" in Obsidian settings.');
	if (effects.length) view.dispatch({ effects });
}

export function registerCommands(plugin: ListwisePlugin) {
	const prefix = () => checkboxPrefix(plugin.settings);
	// ^ No default hotkeys (Obsidian plugin guidelines): users bind them in Settings → Hotkeys; the README lists suggested keys.
	const add = (id: string, name: string, icon: string, run: (v: EditorView) => void) =>
		plugin.addCommand({
			id,
			name,
			icon,
			editorCheckCallback: (checking, editor) => {
				const view = viewOf(editor);
				if (!view || !inList(view)) return false;
				if (!checking) run(view);
				return true;
			},
		});

	add('move-list-item-up', 'Move list and sublists up', 'arrow-up', (v) => perBlock(v, prefix(), (s, r) => moveUp(s, roots(s, r)), 'listwise.move'));
	add('move-list-item-down', 'Move list and sublists down', 'arrow-down', (v) => perBlock(v, prefix(), (s, r) => moveDown(s, roots(s, r)), 'listwise.move'));
	add('indent-list', 'Indent the list and sublists', 'indent', (v) => indentItems(v, () => plugin.settings));
	add('outdent-list', 'Outdent the list and sublists', 'outdent', (v) => outdentItems(v, () => plugin.settings));
	add('fold', 'Fold the list', 'chevrons-down-up', (v) => setFold(v, prefix(), true));
	add('unfold', 'Unfold the list', 'chevrons-up-down', (v) => setFold(v, prefix(), false));
	add('delete-items', 'Delete the selected items with their sublists', 'trash-2', (v) =>
		perBlock(v, prefix(), (s, r) => removeItems(s, roots(s, r)), 'delete.listwise'),
	);
}
