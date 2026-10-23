// Drag a bullet to move the item (or every selected item) with its children.
// Mouse events on the editor's own document. Only bullets start a drag, so
// checkboxes and fold arrows keep their click; a bullet click without a 5px move places the
// cursor at the content start.

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin } from '@codemirror/view';
import { Notice } from 'obsidian';
import { Block, Item, isAncestor, itemAt, lastDescendant, ownLines, prefixLen } from '../core/model';
import { begin, finish, moveTo, roots } from '../core/ops';
import { applyEdits, blockAt, rangesOf, toPos } from './context';
import { GetSettings, checkboxPrefix } from './keys';

const HANDLE = '.cm-formatting-list, .list-bullet';
const THRESHOLD = 5;

const setDragged = StateEffect.define<number[]>();
const draggedField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const e of tr.effects) {
			if (!e.is(setDragged)) continue;
			const marks = e.value.map((n) => Decoration.line({ class: 'listwise-dragging-line' }).range(tr.state.doc.line(n + 1).from));
			deco = Decoration.set(marks, true);
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

type Where = 'before' | 'after' | 'inside';

interface Drag {
	block: Block;
	doc: unknown;
	items: Item[];
	target: { item: Item; where: Where } | null;
}

class DragPlugin {
	private start: { x: number; y: number; line: number } | null = null;
	private drag: Drag | null = null;
	private indicator: HTMLElement | null = null;
	/** The editor's own document: a popout window has its own, and the drag listens there. */
	private get doc(): Document {
		return this.view.dom.ownerDocument;
	}

	constructor(private view: EditorView, private get: GetSettings) {
		view.contentDOM.addEventListener('mousedown', this.onDown, true);
	}

	destroy() {
		this.view.contentDOM.removeEventListener('mousedown', this.onDown, true);
		this.stop();
	}

	private onDown = (e: MouseEvent) => {
		const target = e.targetNode;
		if (e.button !== 0 || !this.get().dnd || !target?.instanceOf(Element) || !target.closest(HANDLE)) return;
		const pos = this.view.posAtDOM(target);
		// ^ Keep CodeMirror's mouse selection from starting under the drag.
		e.preventDefault();
		e.stopPropagation();
		this.start = { x: e.clientX, y: e.clientY, line: toPos(this.view.state, pos).line };
		this.doc.addEventListener('mousemove', this.onMove);
		this.doc.addEventListener('mouseup', this.onUp);
		this.doc.addEventListener('keydown', this.onKey, true);
	};

	private begin(): boolean {
		const { state } = this.view;
		const line = this.start!.line;
		const block = blockAt(state, line);
		const hit = block && itemAt(block, line);
		if (!block || !hit) return false;
		// ^ Dragging a selected item drags the whole selection; otherwise just this item.
		const s = begin(block, [], checkboxPrefix(this.get()));
		const selected = roots(s, rangesOf(state).filter((r) => r.anchor.line !== r.head.line || r.anchor.ch !== r.head.ch));
		const items = selected.some((i) => i === hit.item || isAncestor(i, hit.item)) ? selected : [hit.item];
		this.drag = { block, doc: state.doc, items, target: null };
		const lines: number[] = [];
		for (const i of items) for (let n = i.line; n <= lastDescendant(i).line + ownLines(lastDescendant(i)) - 1; n++) lines.push(n);
		this.view.dispatch({ effects: setDragged.of(lines) });
		this.doc.body.addClass('listwise-dragging');
		return true;
	}

	private onMove = (e: MouseEvent) => {
		if (!this.start) return;
		if (!this.drag) {
			if (Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) < THRESHOLD) return;
			if (!this.begin()) return this.stop();
		}
		e.preventDefault();
		this.drag!.target = this.targetAt(e.clientX, e.clientY);
		this.showIndicator();
	};

	private onUp = (e: MouseEvent) => {
		const drag = this.drag;
		const start = this.start;
		this.stop();
		if (!drag && start) return this.placeCursor(start.line);
		if (!drag || !drag.target) return;
		e.preventDefault();
		if (this.view.state.doc !== drag.doc) {
			new Notice('The item cannot be moved. The page content changed during the move.');
			return;
		}
		const s = begin(drag.block, [], checkboxPrefix(this.get()));
		if (!moveTo(s, drag.items, drag.target.item, drag.target.where)) return;
		const first = drag.items[0];
		const result = finish(s);
		const caret = { line: first.newLine, ch: prefixLen(first, checkboxPrefix(this.get())) };
		applyEdits(this.view, [{ block: drag.block, result }], 'listwise.drop', caret);
	};

	private placeCursor(line: number) {
		const { state } = this.view;
		const block = blockAt(state, line);
		const hit = block && itemAt(block, line);
		if (!hit) return;
		const pos = state.doc.line(line + 1).from + prefixLen(hit.item, checkboxPrefix(this.get()));
		this.view.focus();
		this.view.dispatch({ selection: { anchor: pos }, userEvent: 'select.pointer' });
	}

	private onKey = (e: KeyboardEvent) => {
		if (e.key !== 'Escape' || !this.start) return;
		e.preventDefault();
		e.stopPropagation();
		this.stop();
	};

	/** Drop position for the pointer: before/after an item, or inside it as first child. */
	private targetAt(x: number, y: number): Drag['target'] {
		const { view } = this;
		const drag = this.drag!;
		const pos = view.posAtCoords({ x, y }, false);
		const line = toPos(view.state, pos).line;
		const { block } = drag;
		const clampLine = Math.max(block.from, Math.min(block.to, line));
		const hit = itemAt(block, clampLine);
		if (!hit) return null;
		let item = hit.item;
		const lineBlock = view.lineBlockAt(view.state.doc.line(item.line + 1).from);
		const mid = view.documentTop + (lineBlock.top + lineBlock.bottom) / 2;
		const bulletX = (it: Item) => view.coordsAtPos(view.state.doc.line(it.line + 1).from + it.indent.length, 1)?.left ?? 0;
		const step = view.defaultCharacterWidth * 2;
		let where: Where;
		if (line < block.from || (line === item.line && y < mid)) where = 'before';
		else if ((item.children.length && !item.folded && line === item.line) || x > bulletX(item) + step) where = 'inside';
		else {
			where = 'after';
			// ^ Left of a last child's bullet: drop after the ancestor at that level.
			while (item.parent?.parent && item.parent.children[item.parent.children.length - 1] === item && x < bulletX(item) - step / 2) item = item.parent;
		}
		if (drag.items.some((i) => i === item || isAncestor(i, item))) return null;
		return { item, where };
	}

	private showIndicator() {
		const { view } = this;
		const target = this.drag?.target;
		if (!target) {
			this.indicator?.remove();
			this.indicator = null;
			return;
		}
		const { item, where } = target;
		const doc = view.state.doc;
		const at = where === 'before' ? item : where === 'inside' ? item : lastDescendant(item);
		const lineNo = where === 'after' ? at.line + ownLines(at) - 1 : at.line;
		const lb = view.lineBlockAt(doc.line(lineNo + 1).from);
		const y = view.documentTop + (where === 'before' ? lb.top : lb.bottom);
		const x = (view.coordsAtPos(doc.line(item.line + 1).from + item.indent.length, 1)?.left ?? 0) + (where === 'inside' ? view.defaultCharacterWidth * 2 : 0);
		const right = view.contentDOM.getBoundingClientRect().right;
		if (!this.indicator) {
			this.indicator = this.doc.body.createDiv({ cls: 'listwise-drop-indicator' });
		}
		this.indicator.setCssProps({ '--listwise-x': `${x}px`, '--listwise-y': `${y - 1}px`, '--listwise-width': `${Math.max(0, right - x)}px` });
	}

	private stop() {
		this.doc.removeEventListener('mousemove', this.onMove);
		this.doc.removeEventListener('mouseup', this.onUp);
		this.doc.removeEventListener('keydown', this.onKey, true);
		this.indicator?.remove();
		this.indicator = null;
		if (this.drag) this.view.dispatch({ effects: setDragged.of([]) });
		this.doc.body.removeClass('listwise-dragging');
		this.start = null;
		this.drag = null;
	}
}

export function dragAndDrop(get: GetSettings) {
	return [draggedField, ViewPlugin.define((view) => new DragPlugin(view, get))];
}
