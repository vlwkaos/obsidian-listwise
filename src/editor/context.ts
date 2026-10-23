// Bridge between CodeMirror state and the pure list core: reads blocks (with fold state),
// and applies core results as one transaction, so each command is one undo step.
// https://codemirror.net/docs/ref/#state.TransactionSpec

import { isolateHistory } from '@codemirror/commands';
import { foldable, foldEffect, foldedRanges, getIndentUnit, indentUnit, syntaxTree, unfoldEffect } from '@codemirror/language';
import { ChangeSpec, EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Block, Doc, findBlock, itemAt, parseBlock } from '../core/model';
import { Pos, Range, Result, Session, begin, finish } from '../core/ops';
import { log } from '../log';

const CODE_NODE = /codeblock|frontmatter|math/i;

function docOf(state: EditorState): Doc {
	const tree = syntaxTree(state);
	return {
		lineCount: state.doc.lines,
		line: (n) => state.doc.line(n + 1).text,
		isCode: (n) => {
			const line = state.doc.line(n + 1);
			for (let node: { name: string; parent: unknown } | null = tree.resolveInner(line.from, 1); node; node = node.parent as typeof node) {
				if (CODE_NODE.test(node.name)) return true;
			}
			return false;
		},
	};
}

export function blockAt(state: EditorState, line: number): Block | null {
	const doc = docOf(state);
	const range = findBlock(doc, line);
	if (!range) return null;
	const unit = state.facet(indentUnit) || ' '.repeat(getIndentUnit(state));
	const block = parseBlock(doc, range, { tabSize: state.tabSize, indentUnit: unit });
	// ^ Fold state is Obsidian's own: an item is folded when a fold starts at its first line end.
	const from = state.doc.line(range.from + 1).from;
	const to = state.doc.line(range.to + 1).to;
	foldedRanges(state).between(from, to, (f) => {
		const line = state.doc.lineAt(f);
		if (line.to !== f) return;
		const hit = itemAt(block, line.number - 1);
		if (hit && hit.idx === 0) hit.item.folded = true;
	});
	return block;
}

export const toPos = (state: EditorState, offset: number): Pos => {
	const line = state.doc.lineAt(offset);
	return { line: line.number - 1, ch: offset - line.from };
};
export const toOffset = (state: EditorState, p: Pos) => state.doc.line(p.line + 1).from + p.ch;

export const rangesOf = (state: EditorState): Range[] =>
	state.selection.ranges.map((r) => ({ anchor: toPos(state, r.anchor), head: toPos(state, r.head) }));

/** Smallest change that turns the block's lines into `next`. */
function blockChanges(state: EditorState, block: Block, next: string[]): ChangeSpec[] {
	const old = block.lines;
	let a = 0;
	while (a < old.length && a < next.length && old[a] === next[a]) a++;
	let b = 0;
	while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
	if (a === old.length && a === next.length) return [];
	// ^ Pure insertions or deletions widen to one shared line, so both sides are whole lines.
	if (a + b >= old.length || a + b >= next.length) {
		if (a > 0) a--;
		else b--;
	}
	const oldMid = old.slice(a, old.length - b);
	const newMid = next.slice(a, next.length - b);
	const line = (k: number) => state.doc.line(block.from + k + 1);
	if (oldMid.length === newMid.length) {
		const out: ChangeSpec[] = [];
		oldMid.forEach((text, k) => {
			if (text !== newMid[k]) out.push({ from: line(a + k).from, to: line(a + k).to, insert: newMid[k] });
		});
		return out;
	}
	return [{ from: line(a).from, to: line(old.length - 1 - b).to, insert: newMid.join('\n') }];
}

export interface Edit {
	block: Block;
	result: Result;
}

/**
 * Apply block results in one transaction. Selections are mapped through the change;
 * selections inside a changed block take the positions the core computed.
 */
/** @param caret - when given, the selection becomes this one caret (new lines of `edits[0]`). */
export function applyEdits(view: EditorView, edits: Edit[], userEvent: string, caret?: Pos) {
	// ^ Folds inside a rewritten block would stretch over moved lines; drop them and refold by item.
	const stale: StateEffect<unknown>[] = [];
	for (const e of edits) {
		const from = view.state.doc.line(e.block.from + 1).from;
		const to = view.state.doc.line(e.block.to + 1).to;
		foldedRanges(view.state).between(from, to, (f, t) => {
			if (f >= from && t <= to) stale.push(unfoldEffect.of({ from: f, to: t }));
		});
	}
	if (stale.length) view.dispatch({ effects: stale });
	const { state } = view;
	const changes = state.changes(edits.flatMap((e) => blockChanges(state, e.block, e.result.lines)));
	const newStart = (e: Edit) => changes.mapPos(state.doc.line(e.block.from + 1).from, -1);
	const offsetIn = (e: Edit, p: Pos) => {
		let off = newStart(e);
		for (let k = 0; k < p.line - e.block.from; k++) off += e.result.lines[k].length + 1;
		return off + p.ch;
	};
	let ranges: Array<{ anchor: number; head: number }>;
	if (caret) {
		const at = offsetIn(edits[0], caret);
		ranges = [{ anchor: at, head: at }];
	} else {
		ranges = state.selection.ranges.map((r) => {
			const edit = edits.find((e) => {
				const head = state.doc.lineAt(r.head).number - 1;
				return head >= e.block.from && head <= e.block.to;
			});
			const sel = edit?.result.selections[state.selection.ranges.indexOf(r)];
			if (!edit || !sel) return { anchor: changes.mapPos(r.anchor), head: changes.mapPos(r.head) };
			return {
				anchor: sel.outside[0] ? changes.mapPos(r.anchor) : offsetIn(edit, sel.anchor),
				head: sel.outside[1] ? changes.mapPos(r.head) : offsetIn(edit, sel.head),
			};
		});
	}
	const selection = EditorSelection.create(
		ranges.map((r) => EditorSelection.range(r.anchor, r.head)),
		Math.min(state.selection.mainIndex, ranges.length - 1),
	);
	view.dispatch({ changes, selection, userEvent, annotations: isolateHistory.of('full'), scrollIntoView: true });
	refold(view, edits.flatMap((e) => e.result.folded));
	log(() => JSON.stringify({ userEvent, lines: edits.map((e) => e.result.lines), changes: changes.toJSON() }));
}

/** Fold effect for the item on line `n` (Obsidian's own fold range), or null when not foldable or already folded. */
export function foldAt(state: EditorState, n: number): StateEffect<unknown> | null {
	const line = state.doc.line(n + 1);
	const range = foldable(state, line.from, line.to);
	if (!range) return null;
	let has = false;
	foldedRanges(state).between(range.from, range.from, (f) => {
		if (f === range.from) has = true;
	});
	return has ? null : foldEffect.of(range);
}

/** Unfold effects for a fold that starts at the end of line `n`. */
export function unfoldAt(state: EditorState, n: number): StateEffect<unknown>[] {
	const end = state.doc.line(n + 1).to;
	const out: StateEffect<unknown>[] = [];
	foldedRanges(state).between(end, end, (from, to) => {
		if (from === end) out.push(unfoldEffect.of({ from, to }));
	});
	return out;
}

/** Re-create folds for items that were folded before the change replaced their lines. */
function refold(view: EditorView, lines: number[]) {
	const effects = lines.filter((n) => n < view.state.doc.lines).map((n) => foldAt(view.state, n));
	const valid = effects.filter((e): e is StateEffect<unknown> => e !== null);
	if (valid.length) view.dispatch({ effects: valid });
}

export type BlockRun = (s: Session, ranges: Range[]) => boolean;

/** List blocks under the selection heads, each with the selections whose head is in it. */
export function selectionBlocks(state: EditorState): Array<{ block: Block; ranges: Range[] }> {
	const blocks: Array<{ block: Block; ranges: Range[] }> = [];
	for (const r of rangesOf(state)) {
		const found = blocks.find((b) => r.head.line >= b.block.from && r.head.line <= b.block.to);
		if (found) found.ranges.push(r);
		else {
			const block = blockAt(state, r.head.line);
			if (block) blocks.push({ block, ranges: [r] });
		}
	}
	return blocks;
}

/**
 * Run `fn` once per list block touched by the selection.
 * @returns null when no selection is in a list; otherwise whether anything changed.
 */
export function perBlock(view: EditorView, checkboxPrefix: boolean, fn: BlockRun, userEvent: string): boolean | null {
	const all = rangesOf(view.state);
	const blocks = selectionBlocks(view.state);
	if (!blocks.length) return null;
	const edits: Edit[] = [];
	for (const b of blocks) {
		// ^ Every selection is passed, so result.selections lines up with state.selection.ranges.
		const s = begin(b.block, all, checkboxPrefix);
		const did = fn(s, b.ranges);
		log(() => JSON.stringify({ from: b.block.from, to: b.block.to, ranges: b.ranges, did }));
		if (did) edits.push({ block: b.block, result: finish(s) });
	}
	if (!edits.length) return false;
	applyEdits(view, edits, userEvent);
	return true;
}
