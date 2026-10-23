// Key bindings that replace Obsidian's defaults inside lists. Every handler returns false
// outside a list (or during IME composition) so Obsidian and other plugins keep the key.
// Precedence follows obsidian-outliner: Tab, Shift+Tab and Enter at Prec.highest.

import { foldedRanges } from '@codemirror/language';
import { Extension, Prec } from '@codemirror/state';
import { EditorView, KeyBinding, keymap } from '@codemirror/view';
import { Platform } from 'obsidian';
import { itemAt, prefixLen } from '../core/model';
import { backspace, begin, deleteAcross, deleteForward, enter, expandSelection, indent, outdent, roots } from '../core/ops';
import { ListwiseSettings } from '../settings';
import { applyEdits, blockAt, perBlock, rangesOf, toOffset, toPos } from './context';
import { zoomLine, refreshZoom } from './zoom';

export type GetSettings = () => ListwiseSettings;

const composing = (view: EditorView) => view.composing || view.compositionStarted;

export const checkboxPrefix = (s: ListwiseSettings) => s.stickCursor !== 'bullet-only';

/** Run a single-selection core operation on the block under the main selection. */
function single(view: EditorView, get: GetSettings, userEvent: string, op: Parameters<typeof perBlock>[2]): boolean {
	if (composing(view) || view.state.selection.ranges.length !== 1) return false;
	return perBlock(view, checkboxPrefix(get()), op, userEvent) === true;
}

export const indentItems = (view: EditorView, get: GetSettings) =>
	perBlock(view, checkboxPrefix(get()), (s, r) => indent(s, roots(s, r)), 'listwise.indent');
export const outdentItems = (view: EditorView, get: GetSettings) =>
	perBlock(view, checkboxPrefix(get()), (s, r) => outdent(s, roots(s, r)), 'listwise.outdent');

function deleteSelection(view: EditorView): boolean {
	const { state } = view;
	const sel = state.selection;
	if (sel.ranges.length !== 1 || sel.main.empty) return false;
	const from = toPos(state, sel.main.from);
	const to = toPos(state, sel.main.to);
	if (from.line === to.line) return false;
	const block = blockAt(state, from.line);
	if (!block || to.line > block.to) return false;
	const { lines, cursor } = deleteAcross(block, from, to);
	applyEdits(view, [{ block, result: { lines, selections: [], folded: [] } }], 'delete.selection', cursor);
	return true;
}

/** Content start of the item line under `offset`, or null outside list items. */
function contentStart(view: EditorView, get: GetSettings, offset: number): number | null {
	const { state } = view;
	const p = toPos(state, offset);
	const block = blockAt(state, p.line);
	if (!block) return null;
	const hit = itemAt(block, p.line);
	if (!hit) return null;
	const line = state.doc.line(p.line + 1);
	if (hit.idx > 0) return line.from + (/^[ \t]*/.exec(line.text)![0].length);
	return line.from + prefixLen(hit.item, checkboxPrefix(get()));
}

/** End of the previous line that is not hidden by a fold. */
function prevVisibleEnd(view: EditorView, lineFrom: number): number | null {
	if (lineFrom === 0) return null;
	let pos = lineFrom - 1;
	foldedRanges(view.state).between(pos, pos, (from, to) => {
		if (from < pos && pos <= to) pos = from;
	});
	return pos;
}

function arrowLeft(view: EditorView, get: GetSettings, extend: boolean): boolean {
	const { state } = view;
	if (composing(view) || state.selection.ranges.length !== 1) return false;
	const r = state.selection.main;
	if (!extend && !r.empty) return false;
	const start = contentStart(view, get, r.head);
	if (start === null || r.head !== start) return false;
	const to = prevVisibleEnd(view, state.doc.lineAt(r.head).from);
	if (to === null) return false;
	view.dispatch({ selection: { anchor: extend ? r.anchor : to, head: to }, scrollIntoView: true, userEvent: 'select' });
	return true;
}

/** Delete back to the content start; at the content start, merge like Backspace. */
function deleteBack(view: EditorView, get: GetSettings, toLineStart: boolean): boolean {
	const { state } = view;
	if (composing(view) || state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
	const head = state.selection.main.head;
	const start = contentStart(view, get, head);
	if (start === null) return false;
	if (head === start) return single(view, get, 'delete.backward', (s) => backspace(s, toPos(state, head)));
	if (head < start) return false;
	// ^ Word delete keeps its default unless it would cross into the bullet or checkbox.
	if (!toLineStart && view.moveByGroup(state.selection.main, false).head >= start) return false;
	view.dispatch({ changes: { from: start, to: head }, selection: { anchor: start }, userEvent: 'delete.backward', scrollIntoView: true });
	return true;
}

export function listKeys(get: GetSettings): Extension {
	const sticky = () => get().stickCursor !== 'never';
	const high: KeyBinding[] = [
		{
			key: 'Tab',
			run: (v) => get().betterTab && !composing(v) && indentItems(v, get) !== null,
		},
		{
			key: 'Shift-Tab',
			run: (v) => get().betterTab && !composing(v) && outdentItems(v, get) !== null,
		},
		{
			key: 'Enter',
			run: (v) => {
				if (!get().betterEnter || composing(v) || v.state.selection.ranges.length !== 1) return false;
				const zoom = zoomLine(v);
				const range = rangesOf(v.state)[0];
				const ok = perBlock(v, checkboxPrefix(get()), (s) => enter(s, range, { zoomLine: zoom }), 'input.listwise.enter') === true;
				if (ok && zoom !== null) refreshZoom(v);
				return ok;
			},
		},
	];
	const normal: KeyBinding[] = [
		{
			key: 'Backspace',
			run: (v) => {
				if (!sticky() || composing(v)) return false;
				if (deleteSelection(v)) return true;
				if (!v.state.selection.main.empty) return false;
				return single(v, get, 'delete.backward', (s) => backspace(s, toPos(v.state, v.state.selection.main.head)));
			},
		},
		{
			key: 'Delete',
			run: (v) => {
				if (!sticky() || composing(v)) return false;
				if (deleteSelection(v)) return true;
				if (!v.state.selection.main.empty) return false;
				return single(v, get, 'delete.forward', (s) => deleteForward(s, toPos(v.state, v.state.selection.main.head)));
			},
		},
		{
			key: Platform.isMacOS ? 'Alt-Backspace' : 'Ctrl-Backspace',
			run: (v) => sticky() && deleteBack(v, get, false),
		},
		{ key: 'ArrowLeft', run: (v) => sticky() && arrowLeft(v, get, false), shift: (v) => sticky() && arrowLeft(v, get, true) },
		{
			key: Platform.isMacOS ? 'Alt-ArrowLeft' : 'Ctrl-ArrowLeft',
			run: (v) => sticky() && arrowLeft(v, get, false),
			shift: (v) => sticky() && arrowLeft(v, get, true),
		},
		{
			key: 'Mod-a',
			run: (v) => {
				if (!get().selectAll || composing(v) || v.state.selection.ranges.length !== 1) return false;
				const { state } = v;
				const range = rangesOf(state)[0];
				const block = blockAt(state, range.head.line);
				if (!block) return false;
				const next = expandSelection(begin(block, [range], checkboxPrefix(get())), range, (n) => state.doc.line(n + 1).text);
				if (!next) return false;
				v.dispatch({ selection: { anchor: toOffset(state, next.anchor), head: toOffset(state, next.head) }, userEvent: 'select' });
				return true;
			},
		},
	];
	// ^ Cmd+Backspace deletes to the line start only on macOS; elsewhere Ctrl+Backspace is word delete.
	if (Platform.isMacOS) normal.push({ key: 'Mod-Backspace', run: (v) => sticky() && deleteBack(v, get, true) });
	return [Prec.highest(keymap.of(high)), Prec.high(keymap.of(normal))];
}
