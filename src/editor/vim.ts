// Vim o/O insert list items (obsidian-outliner src/features/VimOBehaviourOverride.ts).
// Unlike outliner, `o` on an item with note lines inserts after the last note line,
// instead of splitting the notes away from their item.

import { EditorView } from '@codemirror/view';
import { MarkdownView } from 'obsidian';
import { itemAt, ownLines } from '../core/model';
import { enter } from '../core/ops';
import { blockAt, perBlock, toPos } from './context';
import { GetSettings, checkboxPrefix } from './keys';
import type ListwisePlugin from '../main';
import { refreshZoom, zoomLine } from './zoom';

interface Vim {
	defineAction(name: string, fn: (cm: unknown, args: { after: boolean }) => void): void;
	enterInsertMode(cm: unknown): void;
	mapCommand(keys: string, type: string, name: string, args: object, extra: object): void;
}

declare global {
	interface Window {
		CodeMirrorAdapter?: { Vim?: Vim };
	}
}

function openPlain(view: EditorView, after: boolean) {
	const { state } = view;
	const line = state.doc.lineAt(state.selection.main.head);
	const ws = /^[ \t]*/.exec(line.text)![0];
	const at = after ? line.to : line.from;
	const insert = after ? `\n${ws}` : `${ws}\n`;
	view.dispatch({ changes: { from: at, insert }, selection: { anchor: after ? at + insert.length : at + ws.length }, userEvent: 'input' });
}

function insertItem(view: EditorView, get: GetSettings, after: boolean): boolean {
	const { state } = view;
	const head = toPos(state, state.selection.main.head);
	const block = blockAt(state, head.line);
	const hit = block && itemAt(block, head.line);
	if (!hit) return false;
	// ^ `o` acts at the end of the item's last line, so notes stay with their item.
	const last = hit.item.line + ownLines(hit.item) - 1;
	const end = { line: last, ch: state.doc.line(last + 1).length };
	const zoom = zoomLine(view);
	const ok =
		perBlock(view, checkboxPrefix(get()), (s) => enter(s, { anchor: end, head: end }, { zoomLine: zoom, before: !after }), 'input.listwise.vim') ===
		true;
	if (ok && zoom !== null) refreshZoom(view);
	return ok;
}

/** @returns false when the Vim adapter is missing (vim mode never enabled this session). */
export function registerVim(plugin: ListwisePlugin): boolean {
	const vim = window.CodeMirrorAdapter?.Vim;
	if (!vim) return false;
	vim.defineAction('listwiseInsertItem', (cm, args) => {
		const editor = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor as unknown as { cm?: EditorView } | undefined;
		const view = editor?.cm;
		if (view && !(plugin.settings.betterVimO && insertItem(view, () => plugin.settings, args.after))) openPlain(view, args.after);
		vim.enterInsertMode(cm);
	});
	for (const [key, after] of [
		['o', true],
		['O', false],
	] as const) {
		vim.mapCommand(key, 'action', 'listwiseInsertItem', {}, { isEdit: true, context: 'normal', interlaceInsertRepeat: true, actionArgs: { after } });
	}
	return true;
}
