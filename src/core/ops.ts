// List operations on a parsed block. Each operation mutates the tree, then `finish`
// renders it, renumbers changed ordered runs and maps selections onto the new lines.
// Pure: positions are {line, ch} with 0-based document lines.

import {
	Block,
	Item,
	childCols,
	cols,
	detach,
	firstLine,
	isAncestor,
	itemAt,
	lastDescendant,
	leadingWs,
	levelCols,
	makeIndent,
	newItem,
	ownLines,
	parseBlock,
	place,
	prefixLen,
	render,
	renumber,
	shiftLines,
	shiftSubtree,
	walk,
} from './model';

export interface Pos {
	line: number;
	ch: number;
}
export interface Range {
	anchor: Pos;
	head: Pos;
}

/** A position stored relative to an item line, so it survives re-rendering. */
interface Ref {
	item: Item;
	idx: number;
	/** Offset from the line's content start (negative inside the prefix). */
	off: number;
}

type End = Ref | Pos;

export interface Session {
	block: Block;
	/** Selection endpoints; a Pos means "outside the block, map it through the change". */
	ends: Array<{ anchor: End; head: End }>;
	parents: Map<Item, Item | null>;
	children: Map<Item, Item[]>;
	/** Whether `[ ] ` counts as prefix for content start. */
	checkboxPrefix: boolean;
}

export interface Result {
	lines: string[];
	/** Selections; positions outside the block are in old-document coordinates. */
	selections: Array<{ anchor: Pos; head: Pos; outside: [boolean, boolean] }>;
	/** First lines (new document) of items that must be folded after the change. */
	folded: number[];
}

const isRef = (e: End): e is Ref => (e as Ref).item !== undefined;

const linePrefix = (s: Session, item: Item, idx: number) =>
	idx === 0 ? prefixLen(item, s.checkboxPrefix) : leadingWs(item.notes[idx - 1] ?? '').length;

const lineText = (item: Item, idx: number) => (idx === 0 ? firstLine(item) : item.notes[idx - 1]);

/** Collapse the selection to one caret at `off` from the content start of an item line. */
function caret(s: Session, item: Item, idx = 0, off = 0) {
	const end = { item, idx, off };
	s.ends = [{ anchor: end, head: end }];
}

const childrenChanged = (s: Session, item: Item) => {
	const before = s.children.get(item);
	return !before || before.length !== item.children.length || before.some((c, i) => c !== item.children[i]);
};

/** An empty item with the same bullet and checkbox kind as `item`. */
const siblingLike = (item: Item) =>
	newItem({ indent: item.indent, bullet: item.bullet, space: item.space, checkbox: item.checkbox ? '[ ] ' : '' });

function toEnd(s: Session, p: Pos): End {
	const { block } = s;
	if (p.line < block.from || p.line > block.to) return p;
	const hit = itemAt(block, p.line);
	if (!hit) return p;
	return { item: hit.item, idx: hit.idx, off: p.ch - linePrefix(s, hit.item, hit.idx) };
}

export function begin(block: Block, ranges: Range[], checkboxPrefix: boolean): Session {
	const parents = new Map<Item, Item | null>();
	const children = new Map<Item, Item[]>([[block.root, [...block.root.children]]]);
	for (const item of walk(block.root)) {
		parents.set(item, item.parent);
		children.set(item, [...item.children]);
	}
	const s: Session = { block, ends: [], parents, children, checkboxPrefix };
	s.ends = ranges.map((r) => ({ anchor: toEnd(s, r.anchor), head: toEnd(s, r.head) }));
	return s;
}

export function finish(s: Session): Result {
	const { block } = s;
	const dirty = new Set<Item>();
	const kept = new Set<Item>();
	const all = [block.root, ...walk(block.root)];
	for (const item of all) {
		if (childrenChanged(s, item)) dirty.add(item);
		if (item !== block.root && s.parents.get(item) === item.parent) kept.add(item);
	}
	renumber(dirty, kept);
	const lines = render(block);
	const pos = (e: End): Pos => {
		if (!isRef(e)) return e;
		const idx = Math.min(e.idx, ownLines(e.item) - 1);
		const text = e.item.plain ? (idx === 0 ? e.item.text : e.item.notes[idx - 1]) : lineText(e.item, idx);
		const prefix = e.item.plain && idx === 0 ? 0 : linePrefix(s, e.item, idx);
		const line = Math.min(e.item.newLine + idx, block.from + lines.length - 1);
		return { line, ch: Math.max(0, Math.min(text.length, prefix + e.off)) };
	};
	return {
		lines,
		selections: s.ends.map((r) => ({
			anchor: pos(r.anchor),
			head: pos(r.head),
			outside: [!isRef(r.anchor), !isRef(r.head)],
		})),
		folded: walk(block.root)
			.filter((i) => i.folded && !i.plain && (i.children.length || i.notes.length))
			.map((i) => i.newLine),
	};
}

const changed = (s: Session) => [s.block.root, ...walk(s.block.root)].some((item) => childrenChanged(s, item));

/** Selected items whose ancestors are not selected, in document order. */
export function roots(s: Session, ranges: Range[]): Item[] {
	const { block } = s;
	const picked = new Set<Item>();
	for (const r of ranges) {
		const a = r.anchor.line < r.head.line || (r.anchor.line === r.head.line && r.anchor.ch <= r.head.ch) ? r.anchor : r.head;
		const b = a === r.anchor ? r.head : r.anchor;
		let last = b.line;
		// ^ A selection that ends at the start of a line does not include that line.
		if (last > a.line && b.ch === 0) last--;
		for (let n = Math.max(a.line, block.from); n <= Math.min(last, block.to); n++) {
			const hit = itemAt(block, n);
			if (hit) picked.add(hit.item);
		}
	}
	const ancestorPicked = (i: Item) => {
		for (let p = i.parent; p; p = p.parent) if (picked.has(p)) return true;
		return false;
	};
	return walk(block.root).filter((i) => picked.has(i) && !ancestorPicked(i));
}

/** Consecutive siblings among `items`, as runs in document order. */
function runs(items: Item[]): Item[][] {
	const out: Item[][] = [];
	for (const item of items) {
		const run = out[out.length - 1];
		const prev = run?.[run.length - 1];
		if (prev && prev.parent === item.parent && item.parent!.children.indexOf(prev) + 1 === item.parent!.children.indexOf(item)) run.push(item);
		else out.push([item]);
	}
	return out;
}

const prevSibling = (item: Item) => {
	const list = item.parent?.children ?? [];
	const i = list.indexOf(item);
	return i > 0 ? list[i - 1] : null;
};
const nextSibling = (item: Item) => {
	const list = item.parent?.children ?? [];
	const i = list.indexOf(item);
	return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
};

export function moveUp(s: Session, items: Item[]): boolean {
	for (const run of runs(items)) {
		const parent = run[0].parent!;
		const i = parent.children.indexOf(run[0]);
		if (i > 0) {
			const [prev] = parent.children.splice(i - 1, 1);
			parent.children.splice(i - 1 + run.length, 0, prev);
			continue;
		}
		// ^ First child: hop to the end of the parent's previous sibling (outliner MoveListUp).
		const target = parent.parent ? prevSibling(parent) : null;
		if (!target) continue;
		target.folded = false;
		for (const item of run) place(s.block, item, target, target.children.length);
	}
	return changed(s);
}

export function moveDown(s: Session, items: Item[]): boolean {
	for (const run of runs(items).reverse()) {
		const parent = run[0].parent!;
		const j = parent.children.indexOf(run[run.length - 1]);
		if (j < parent.children.length - 1) {
			const [next] = parent.children.splice(j + 1, 1);
			parent.children.splice(j + 1 - run.length, 0, next);
			continue;
		}
		const target = parent.parent ? nextSibling(parent) : null;
		if (!target) continue;
		target.folded = false;
		run.forEach((item, k) => place(s.block, item, target, k));
	}
	return changed(s);
}

export function indent(s: Session, items: Item[]): boolean {
	for (const run of runs(items)) {
		const prev = prevSibling(run[0]);
		if (!prev) continue;
		prev.folded = false;
		for (const item of run) place(s.block, item, prev, prev.children.length);
	}
	return changed(s);
}

/**
 * Outdent in place, as Obsidian's own Shift+Tab: the run keeps its lines and the siblings after
 * it become children of its last item (outliner moved the run below them instead).
 * `keepSiblings` keeps outliner's move, for Enter on an empty item.
 * A top-level item leaves the list as a plain line and its children move up to the top level
 * (user request 2026-10-27); the siblings after it stay a list below that line.
 */
export function outdent(s: Session, items: Item[], keepSiblings = false): boolean {
	for (const run of runs(items).reverse()) {
		const parent = run[0].parent!;
		const grand = parent.parent;
		if (!grand) {
			// ^ Under a list item a line is a lazy continuation of that item (CommonMark), so the new
			// paragraph needs a blank line above it; the blank is a note line of the item above.
			const prev = parent.children[parent.children.indexOf(run[0]) - 1];
			const above = prev && !prev.plain ? lastDescendant(prev) : null;
			if (above && above.notes.at(-1)?.trim() !== '') above.notes.push('');
			for (const item of run) if (!item.plain) toPlain(s, item, item.indent + (s.checkboxPrefix ? '' : item.checkbox) + item.text);
			continue;
		}
		const last = run[run.length - 1];
		const after = keepSiblings ? [] : parent.children.slice(parent.children.indexOf(last) + 1);
		const at = grand.children.indexOf(parent) + 1;
		run.forEach((item, k) => place(s.block, item, grand, at + k));
		if (after.length) last.folded = false;
		for (const item of after) place(s.block, item, last, last.children.length);
	}
	return changed(s);
}

/** Move `items` before, after or inside `target` (drag and drop). */
export function moveTo(s: Session, items: Item[], target: Item, where: 'before' | 'after' | 'inside'): boolean {
	if (items.some((i) => i === target || isAncestor(i, target))) return false;
	for (const i of items) detach(i);
	const parent = where === 'inside' ? target : target.parent!;
	let at = where === 'inside' ? 0 : parent.children.indexOf(target) + (where === 'after' ? 1 : 0);
	if (where === 'inside') target.folded = false;
	for (const item of items) place(s.block, item, parent, at++);
	return true;
}

/** Turn `item` into a plain line; its children move up one level. */
function toPlain(s: Session, item: Item, text: string) {
	const parent = item.parent!;
	const at = parent.children.indexOf(item) + 1;
	const kids = [...item.children];
	kids.forEach((c, k) => place(s.block, c, parent, at + k));
	item.plain = true;
	item.text = text;
	item.folded = false;
}

export interface EnterOptions {
	/** First line of the Zoom plugin's zoomed item, if any. */
	zoomLine: number | null;
	/** Vim `O`: insert before the item instead of splitting. */
	before?: boolean;
}

/**
 * Enter on one selection inside a single line (outliner CreateNewItem + OutdentListIfItsEmpty).
 * @returns false when Obsidian's default Enter should run.
 */
export function enter(s: Session, range: Range, opts: EnterOptions): boolean {
	const { block } = s;
	if (range.anchor.line !== range.head.line) return false;
	const line = range.head.line;
	const hit = itemAt(block, line);
	if (!hit) return false;
	const { item, idx } = hit;
	const from = Math.min(range.anchor.ch, range.head.ch);
	const to = Math.max(range.anchor.ch, range.head.ch);
	const contentStart = linePrefix(s, item, idx);
	if (from < contentStart) return false;

	const empty = item.text.trim() === '' && item.notes.length === 0 && from === to;
	if (empty && !opts.before) {
		if (item.parent !== block.root) {
			outdent(s, [item], true);
			caret(s, item);
			return true;
		}
		// ^ Empty top-level item: leave the list, as a blank line.
		toPlain(s, item, '');
		caret(s, item);
		return true;
	}

	const parent = item.parent!;
	const at = parent.children.indexOf(item);
	if (opts.before) {
		const fresh = siblingLike(item);
		parent.children.splice(at, 0, fresh);
		fresh.parent = parent;
		caret(s, fresh);
		return true;
	}

	// ^ Cut positions in the cut line; a split never lands inside `[ ] `.
	const text = lineText(item, idx);
	const min = idx === 0 ? prefixLen(item) : contentStart;
	const cutFrom = Math.max(from, min);
	const cutTo = Math.max(to, min);
	const right = text.slice(cutTo);
	const atEnd = idx === ownLines(item) - 1 && cutTo === text.length;
	const laterNotes = item.notes.slice(idx);
	if (idx === 0) item.text = text.slice(prefixLen(item), cutFrom);
	else item.notes[idx - 1] = text.slice(0, cutFrom);
	item.notes = item.notes.slice(0, idx);

	const zoomed = opts.zoomLine === item.line;
	const first = item.children[0];
	let fresh: Item;
	if (atEnd && ((first && !item.folded) || zoomed)) {
		// ^ Enter at the end of an open parent: the new item is its first child, shaped like that child.
		fresh = newItem({
			indent: first ? first.indent : makeIndent(block, childCols(block, item)),
			bullet: first ? first.bullet : item.bullet,
			space: first ? first.space : item.space,
			checkbox: (first ?? item).checkbox ? '[ ] ' : '',
		});
		item.children.unshift(fresh);
		fresh.parent = item;
	} else {
		fresh = siblingLike(item);
		parent.children.splice(at + 1, 0, fresh);
		fresh.parent = parent;
		if (!atEnd) {
			// ^ Mid-text split: the children follow the text after the cursor, with their fold.
			fresh.children = item.children;
			for (const c of fresh.children) c.parent = fresh;
			item.children = [];
			fresh.folded = item.folded;
			item.folded = false;
		}
	}
	fresh.text = idx === 0 ? right : right.replace(/^[ \t]*/, '');
	fresh.notes = shiftLines(block, laterNotes, cols(block, fresh) - cols(block, item));
	caret(s, fresh);
	return true;
}

/** Topmost folded item hiding block line `n` (n is not its first line), or null. */
function foldHiding(block: Block, n: number): Item | null {
	const hit = itemAt(block, n);
	if (!hit) return null;
	let top: Item | null = null;
	for (let p: Item | null = hit.idx > 0 ? hit.item : hit.item.parent; p && p.parent; p = p.parent) if (p.folded) top = p;
	return top;
}

/**
 * Join `source` (an item, at its first line) onto the end of `target` line.
 * Source notes follow the target item; source children move up into the item before it.
 */
function join(s: Session, target: { item: Item; idx: number }, source: Item, joinText: string) {
	const { block } = s;
	const tItem = target.item;
	const tText = lineText(tItem, target.idx);
	const joinCh = tText.length;
	if (target.idx === 0) tItem.text += joinText;
	else tItem.notes[target.idx - 1] += joinText;
	const parent = source.parent!;
	const at = parent.children.indexOf(source);
	const prev = at > 0 ? parent.children[at - 1] : null;
	detach(source);
	// ^ Notes keep their alignment relative to their item.
	tItem.notes.push(...shiftLines(block, source.notes, cols(block, tItem) - cols(block, source)));
	const kids = [...source.children];
	if (prev) {
		if (kids.length) prev.folded = false;
		kids.forEach((c) => place(block, c, prev, prev.children.length));
	} else kids.forEach((c, k) => place(block, c, parent, at + k));
	caret(s, tItem, target.idx, joinCh - linePrefix(s, tItem, target.idx));
}

/**
 * Backspace with a cursor at the content start of an item line.
 * Unlike outliner it never swallows the key: it always merges into the previous visible line.
 * @returns false when Obsidian's default Backspace should run.
 */
export function backspace(s: Session, cursor: Pos): boolean {
	const { block } = s;
	const hit = itemAt(block, cursor.line);
	if (!hit) return false;
	const { item, idx } = hit;
	if (cursor.ch !== linePrefix(s, item, idx)) return false;
	if (idx > 0) {
		const textOnly = item.notes[idx - 1].replace(/^[ \t]*/, '');
		const prevText = lineText(item, idx - 1);
		if (idx - 1 === 0) item.text += textOnly;
		else item.notes[idx - 2] += textOnly;
		item.notes.splice(idx - 1, 1);
		caret(s, item, idx - 1, prevText.length - linePrefix(s, item, idx - 1));
		return true;
	}
	if (s.checkboxPrefix && item.checkbox) {
		// ^ Right after `[ ] `: remove the checkbox and keep a plain item (user-requested; Obsidian's
		// default only deletes the space and leaves `[ ]` as text).
		item.checkbox = '';
		caret(s, item);
		return true;
	}
	const joinText = (s.checkboxPrefix ? '' : item.checkbox) + item.text;
	// ^ Blank lines of a loose list are skipped and removed by the merge.
	let prevLine = cursor.line - 1;
	while (prevLine >= block.from && block.lines[prevLine - block.from].trim() === '') prevLine--;
	const blanks = cursor.line - 1 - prevLine;
	if (blanks > 0 && prevLine >= block.from) itemAt(block, cursor.line - 1)!.item.notes.splice(-blanks);
	if (prevLine < block.from) {
		if (!item.children.length) return false;
		// ^ First item with children: it becomes a paragraph and its children a list below it.
		toPlain(s, item, item.indent + joinText);
		caret(s, item, 0, item.indent.length);
		return true;
	}
	const hidden = foldHiding(block, prevLine);
	const target = hidden ? { item: hidden, idx: 0 } : itemAt(block, prevLine)!;
	join(s, target, item, joinText);
	return true;
}

/** Delete with a cursor at the end of an item line: join the next visible line. */
export function deleteForward(s: Session, cursor: Pos): boolean {
	const { block } = s;
	const hit = itemAt(block, cursor.line);
	if (!hit) return false;
	const { item, idx } = hit;
	if (cursor.ch !== lineText(item, idx).length) return false;
	if (idx < item.notes.length) {
		const next = item.notes[idx].replace(/^[ \t]*/, '');
		if (idx === 0) item.text += next;
		else item.notes[idx - 1] += next;
		item.notes.splice(idx, 1);
		return true;
	}
	// ^ The next visible item: after a folded subtree, or the next item in document order.
	const order = walk(block.root);
	let next: Item | undefined;
	if (item.folded && idx === 0) next = order[order.indexOf(lastDescendant(item)) + 1];
	else next = order[order.indexOf(item) + 1];
	if (!next) return false;
	join(s, { item, idx }, next, (s.checkboxPrefix ? '' : next.checkbox) + next.text);
	return true;
}

/** Remove `items` with their subtrees. */
export function removeItems(s: Session, items: Item[]): boolean {
	if (!items.length) return false;
	const order = walk(s.block.root);
	const after = order.slice(order.indexOf(lastDescendant(items[items.length - 1])) + 1).find((i) => !items.some((r) => r === i || isAncestor(r, i)));
	const before = [...order.slice(0, order.indexOf(items[0]))].reverse().find((i) => !items.some((r) => isAncestor(r, i)));
	for (const i of items) detach(i);
	const land = after ?? before;
	if (land) caret(s, land);
	else s.ends = [];
	return true;
}

/**
 * Cmd/Ctrl+A: item content, then item with children, then each ancestor, then the whole list.
 * @returns the new range, or null when Obsidian's default (select all) should run.
 */
export function expandSelection(s: Session, range: Range, docLine: (n: number) => string): Range | null {
	const { block } = s;
	const hit = itemAt(block, range.head.line);
	if (!hit) return null;
	const from = cmp(range.anchor, range.head) <= 0 ? range.anchor : range.head;
	const to = from === range.anchor ? range.head : range.anchor;
	const contentOf = (item: Item, withChildren: boolean): Range => {
		const end = withChildren ? lastDescendant(item) : item;
		const endLine = end.line + ownLines(end) - 1;
		return {
			anchor: { line: item.line, ch: prefixLen(item, s.checkboxPrefix) },
			head: { line: endLine, ch: docLine(endLine).length },
		};
	};
	const whole: Range = { anchor: { line: block.from, ch: 0 }, head: { line: block.to, ch: docLine(block.to).length } };
	const steps: Range[] = [];
	for (let p: Item | null = hit.item; p && p.parent; p = p.parent) {
		steps.push(contentOf(p, false));
		if (p.children.length) steps.push(contentOf(p, true));
	}
	steps.push(whole);
	const contains = (r: Range) => cmp(r.anchor, from) <= 0 && cmp(to, r.head) <= 0;
	const same = (r: Range) => cmp(r.anchor, from) === 0 && cmp(r.head, to) === 0;
	if (!contains(whole)) return null;
	for (const r of steps) if (contains(r) && !same(r)) return r;
	return null;
}

const cmp = (a: Pos, b: Pos) => a.line - b.line || a.ch - b.ch;

/**
 * Delete a selection that spans lines of one list, then repair the depth of items whose
 * parent was deleted: they move up to one level below their new parent.
 */
export function deleteAcross(block: Block, from: Pos, to: Pos): { lines: string[]; cursor: Pos } {
	const rel = (p: Pos) => p.line - block.from;
	const head = block.lines[rel(from)].slice(0, from.ch);
	const tail = block.lines[rel(to)].slice(to.ch);
	const lines = [...block.lines.slice(0, rel(from)), head + tail, ...block.lines.slice(rel(to) + 1)];
	const next = parseBlock(
		{ lineCount: block.from + lines.length, line: (n) => lines[n - block.from] ?? '', isCode: () => false },
		{ from: block.from, to: block.from + lines.length - 1 },
		block.opts,
	);
	// ^ The indent width comes from the list before the delete; the orphans themselves would skew it.
	next.unitCols = block.unitCols;
	next.useTabs = block.useTabs;
	const dirty = new Set<Item>();
	const repair = (parent: Item) => {
		const expected = levelCols(next, parent);
		for (const c of parent.children) {
			if (c.line >= from.line && cols(next, c) > expected) {
				shiftSubtree(next, c, expected - cols(next, c));
				dirty.add(parent);
			}
			repair(c);
		}
	};
	repair(next.root);
	// ^ The joined item's run lost members, so it is renumbered too.
	const joined = itemAt(next, from.line);
	if (joined) dirty.add(joined.item.parent!);
	renumber(dirty, new Set(walk(next.root)));
	return { lines: render(next), cursor: from };
}
