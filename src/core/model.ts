// List model: parses a contiguous Markdown list block into an item tree and renders it back.
// Pure: no Obsidian or CodeMirror imports. Line numbers are 0-based document lines.
//
// A block is a run of item lines and indented note lines. An unindented non-item line or a
// code line ends it. Blank lines between list lines stay inside it, as in CommonMark loose
// lists (obsidian-outliner ends a list at a blank line, so Tab after one did nothing).
// Nesting is by content column (CommonMark), so mixed tabs and spaces parse instead of failing.
// Each item keeps its raw indent, bullet and spacing; only re-levelled or edited lines change.

export interface Doc {
	lineCount: number;
	line(n: number): string;
	/** True when line `n` is inside fenced code, math or front matter. */
	isCode(n: number): boolean;
}

export interface Options {
	tabSize: number;
	/** Indent written for one level when the list itself gives no hint. */
	indentUnit: string;
}

export interface Item {
	parent: Item | null;
	children: Item[];
	indent: string;
	bullet: string;
	space: string;
	/** `[ ] ` style checkbox with its trailing space, or ''. */
	checkbox: string;
	text: string;
	/** Raw note lines (continuation lines) with their own indent. */
	notes: string[];
	/** First line in the source block, or -1 for an item an operation created. */
	line: number;
	/** First line after rendering. */
	newLine: number;
	folded: boolean;
	/** A plain line that replaces this item (list exit). Children are promoted before render. */
	plain: boolean;
}

export interface Block {
	from: number;
	to: number;
	root: Item;
	lines: string[];
	/** Item that owns each parsed line (index = line - from). */
	owners: Item[];
	opts: Options;
	/** Column of top-level items. */
	topCols: number;
	unitCols: number;
	useTabs: boolean;
}

const ITEM_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)(\[[^[\]]\](?:[ \t]|$))?(.*)$/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

function columns(ws: string, tabSize: number): number {
	let col = 0;
	for (const ch of ws) col = ch === '\t' ? col + tabSize - (col % tabSize) : col + 1;
	return col;
}

export const leadingWs = (s: string) => /^[ \t]*/.exec(s)![0];

/** Item prefix parts of a line, or null when the line is not a list item. */
export function matchItem(line: string) {
	if (RULE_RE.test(line)) return null;
	const m = ITEM_RE.exec(line);
	if (!m) return null;
	// ^ "-" alone is an item only when followed by a space; "1." alone is not a bullet either.
	if (m[3] === '' && m[5] !== '') return null;
	return { indent: m[1], bullet: m[2], space: m[3], checkbox: m[4] ?? '', text: m[5] };
}

const isNoteLine = (line: string) => line.trim() !== '' && /^[ \t]/.test(line);

function inBlock(doc: Doc, n: number) {
	if (n < 0 || n >= doc.lineCount) return false;
	const line = doc.line(n);
	// ^ Indented code inside an item is a note of that item; unindented code ends the list.
	if (isNoteLine(line)) return true;
	return !doc.isCode(n) && matchItem(line) !== null;
}

const isBlank = (doc: Doc, n: number) => n >= 0 && n < doc.lineCount && doc.line(n).trim() === '';

/** Last list line reached from `n` in direction `step`, crossing blank runs between list lines. */
function extend(doc: Doc, n: number, step: 1 | -1): number {
	for (;;) {
		if (inBlock(doc, n + step)) {
			n += step;
			continue;
		}
		let past = n + step;
		while (isBlank(doc, past)) past += step;
		if (past === n + step || !inBlock(doc, past)) return n;
		n = past;
	}
}

/** Line range of the list block containing line `n`, or null. */
export function findBlock(doc: Doc, n: number): { from: number; to: number } | null {
	if (n < 0 || n >= doc.lineCount || doc.isCode(n) || !inBlock(doc, n)) return null;
	let from = extend(doc, n, -1);
	const to = extend(doc, n, 1);
	// ^ Indented lines before the first item are not part of the list.
	while (from <= to && !matchItem(doc.line(from))) from++;
	return from <= n ? { from, to } : null;
}

export function newItem(fields: Partial<Item>): Item {
	return {
		parent: null,
		children: [],
		indent: '',
		bullet: '-',
		space: ' ',
		checkbox: '',
		text: '',
		notes: [],
		line: -1,
		newLine: -1,
		folded: false,
		plain: false,
		...fields,
	};
}

export function parseBlock(doc: Doc, range: { from: number; to: number }, opts: Options): Block {
	const root = newItem({ indent: '' });
	const lines: string[] = [];
	const owners: Item[] = [];
	// ^ Each open item with the column its content starts at; nesting follows CommonMark, so an
	// item is a child only when it starts at or after its parent's content column.
	const stack: Array<{ item: Item; content: number }> = [];
	let last: Item | null = null;
	let fence: string | null = null;
	for (let n = range.from; n <= range.to; n++) {
		const raw = doc.line(n);
		lines.push(raw);
		const m = fence === null ? matchItem(raw) : null;
		if (!m) {
			// ^ Fenced code inside an item stays a note, even when its lines look like items.
			const f = FENCE_RE.exec(raw);
			if (f) {
				if (fence === null) fence = f[1];
				else if (f[1][0] === fence[0] && f[1].length >= fence.length && raw.trim() === f[1]) fence = null;
			}
			if (!last) {
				// ^ Text before the first item (only after a cross-line delete) stays a plain line.
				last = newItem({ parent: root, plain: true, text: raw, line: n });
				root.children.push(last);
			} else last.notes.push(raw);
			owners.push(last);
			continue;
		}
		const cols = columns(m.indent, opts.tabSize);
		while (stack.length && stack[stack.length - 1].content > cols) stack.pop();
		const parent = stack.length ? stack[stack.length - 1].item : root;
		const item = newItem({ ...m, parent, line: n });
		parent.children.push(item);
		stack.push({ item, content: cols + markerWidth(item) });
		owners.push(item);
		last = item;
	}
	const shape = indentShape(root, opts);
	return {
		from: range.from,
		to: range.to,
		root,
		lines,
		owners,
		opts,
		topCols: root.children.length ? columns(root.children[0].indent, opts.tabSize) : 0,
		...shape,
	};
}

/** Columns from an item's bullet to its content: `- ` is 2, `1. ` is 3 (CommonMark caps the spaces). */
const markerWidth = (item: Item) => item.bullet.length + (/^ {1,4}$/.test(item.space) ? item.space.length : 1);

/** Most frequent value; ties go to the value closest to `prefer`. */
function mostCommon(values: number[], prefer: number): number {
	const counts = new Map<number, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	let best = values[0];
	for (const [v, n] of counts) {
		const bestN = counts.get(best)!;
		if (n > bestN || (n === bestN && Math.abs(v - prefer) < Math.abs(best - prefer))) best = v;
	}
	return best;
}

/**
 * Indent character and width of one level, from the list's own lines.
 * Tab lists: one level is one tab. Space lists: the most common parent-to-child step, so one odd
 * line cannot set the width. Obsidian's indent setting when the list has no nesting.
 */
function indentShape(root: Item, opts: Options) {
	const deltas: number[] = [];
	let tabs = 0;
	let spaces = 0;
	const visit = (item: Item) => {
		for (const c of item.children) {
			if (c.indent.includes('\t')) tabs++;
			else if (c.indent) spaces++;
			if (item !== root) {
				const d = columns(c.indent, opts.tabSize) - columns(item.indent, opts.tabSize);
				if (d > 0) deltas.push(d);
			}
			visit(c);
		}
	};
	visit(root);
	const useTabs = tabs || spaces ? tabs >= spaces : opts.indentUnit.includes('\t');
	const fallbackCols = columns(opts.indentUnit, opts.tabSize) || opts.tabSize;
	const unitCols = useTabs ? opts.tabSize : deltas.length ? mostCommon(deltas, Math.min(...deltas)) : fallbackCols;
	return { unitCols, useTabs };
}

export const cols = (block: Block, item: Item) => columns(item.indent, block.opts.tabSize);

export function makeIndent(block: Block, n: number): string {
	if (n <= 0) return '';
	if (!block.useTabs) return ' '.repeat(n);
	const ts = block.opts.tabSize;
	return '\t'.repeat(Math.floor(n / ts)) + ' '.repeat(n % ts);
}

const shiftWs = (block: Block, ws: string, delta: number) =>
	makeIndent(block, columns(ws, block.opts.tabSize) + delta);

export function shiftLines(block: Block, lines: string[], delta: number): string[] {
	if (delta === 0) return lines;
	return lines.map((n) => {
		const ws = leadingWs(n);
		return shiftWs(block, ws, delta) + n.slice(ws.length);
	});
}

/** Shift an item, its notes and all descendants by `delta` columns. */
export function shiftSubtree(block: Block, item: Item, delta: number) {
	if (delta === 0) return;
	item.indent = shiftWs(block, item.indent, delta);
	item.notes = shiftLines(block, item.notes, delta);
	for (const c of item.children) shiftSubtree(block, c, delta);
}

/** Column one level below `parent`: one tab in tab lists, otherwise the unit but at least the marker. */
export function levelCols(block: Block, parent: Item): number {
	if (!parent.parent) return block.topCols;
	if (block.useTabs) return cols(block, parent) + block.unitCols;
	// ^ Obsidian renumbers a child at exactly a numbered parent's content column as a sibling
	// ("1. a" / "   1. b" becomes "2. b"), so ordered parents get one more column.
	const min = markerWidth(parent) + (/\d/.test(parent.bullet) ? 1 : 0);
	return cols(block, parent) + Math.max(block.unitCols, min);
}

/**
 * Column for a new child of `parent`. Tab lists always use one tab; space lists follow the column
 * most existing children use, so one odd child does not decide it.
 */
export function childCols(block: Block, parent: Item): number {
	const expected = levelCols(block, parent);
	const kids = parent.children.filter((c) => !c.plain).map((c) => cols(block, c));
	if (!kids.length || (block.useTabs && parent.parent)) return expected;
	return mostCommon(kids, expected);
}

/** Move `item` (with its subtree) under `parent` at `index`, re-levelling it. */
export function place(block: Block, item: Item, parent: Item, index: number) {
	detach(item);
	let target = childCols(block, parent);
	// ^ Stay a sibling of the neighbours: before the previous sibling's content column, and not so
	// far left that the next sibling would nest under this item.
	const prev = parent.children[index - 1];
	const next = parent.children[index];
	if (prev && !prev.plain && target >= cols(block, prev) + markerWidth(prev)) target = cols(block, prev);
	else if (next && !next.plain && cols(block, next) >= target + markerWidth(item)) target = cols(block, next);
	shiftSubtree(block, item, target - cols(block, item));
	parent.children.splice(index, 0, item);
	item.parent = parent;
}

export function detach(item: Item) {
	if (!item.parent) return;
	const i = item.parent.children.indexOf(item);
	if (i >= 0) item.parent.children.splice(i, 1);
	item.parent = null;
}

export const firstLine = (item: Item) => item.indent + item.bullet + item.space + item.checkbox + item.text;

/** Length of the prefix before content; `withCheckbox` decides whether `[ ] ` is prefix. */
export const prefixLen = (item: Item, withCheckbox = true) =>
	item.indent.length + item.bullet.length + item.space.length + (withCheckbox ? item.checkbox.length : 0);

/** Items in document order. */
export function walk(item: Item, out: Item[] = []): Item[] {
	for (const c of item.children) {
		out.push(c);
		walk(c, out);
	}
	return out;
}

export function lastDescendant(item: Item): Item {
	let last = item;
	while (last.children.length) last = last.children[last.children.length - 1];
	return last;
}

/** Number of lines of the item itself (first line + notes). */
export const ownLines = (item: Item) => 1 + item.notes.length;

/** Item that owns block line `n`, with the line's index inside the item. */
/** Valid for the parsed lines; operations look items up before they change the tree. */
export function itemAt(block: Block, n: number): { item: Item; idx: number } | null {
	const item = block.owners[n - block.from];
	return item ? { item, idx: n - item.line } : null;
}

export function isAncestor(a: Item, b: Item) {
	for (let p = b.parent; p; p = p.parent) if (p === a) return true;
	return false;
}

/** Render the tree. Sets `newLine` on every item. */
export function render(block: Block): string[] {
	const out: string[] = [];
	let trailingBlankNotes = 0;
	const visit = (item: Item) => {
		for (const c of [...item.children]) {
			c.newLine = block.from + out.length;
			// ^ A plain line ends the list here; its children continue as a list after it.
			out.push(c.plain ? c.text : firstLine(c));
			trailingBlankNotes = 0;
			for (const n of c.notes) {
				out.push(n);
				trailingBlankNotes = n.trim() === '' ? trailingBlankNotes + 1 : 0;
			}
			visit(c);
		}
	};
	visit(block.root);
	// ^ A blank line belongs to the item above it; when that item moves last, the blank would
	// land after the list, so trailing blank notes are dropped (the block never ends with one).
	out.length -= Math.min(trailingBlankNotes, out.length - 1);
	return out;
}

const ORDERED_RE = /^(\d{1,9})([.)])$/;

/**
 * Renumber ordered sibling runs under each parent in `dirty`.
 * A run starts at the smallest number among items that kept their parent, so `3.` lists stay at 3.
 */
export function renumber(dirty: Set<Item>, kept: Set<Item>) {
	for (const parent of dirty) {
		let run: Item[] = [];
		let delim = '';
		const flush = () => {
			if (!run.length) return;
			const claimed = run.filter((i) => kept.has(i)).map((i) => parseInt(i.bullet, 10));
			let n = claimed.length ? Math.min(...claimed) : 1;
			for (const i of run) i.bullet = `${n++}${delim}`;
			run = [];
		};
		for (const c of parent.children) {
			const m = ORDERED_RE.exec(c.bullet);
			if (!m || c.plain || (run.length && m[2] !== delim)) flush();
			if (m && !c.plain) {
				delim = m[2];
				run.push(c);
			}
		}
		flush();
	}
}
