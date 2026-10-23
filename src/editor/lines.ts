// Vertical indentation lines: one line per open parent, from below its bullet to its last
// visible descendant. Drawn as a CodeMirror layer, so it follows any theme's geometry.
// https://codemirror.net/docs/ref/#view.layer

import { EditorView, LayerMarker, layer } from '@codemirror/view';
import { Item, ownLines, walk } from '../core/model';
import { blockAt, foldAt, unfoldAt } from './context';
import type { GetSettings } from './keys';
import { zoomIn } from './zoom';

class LineMarker implements LayerMarker {
	constructor(
		readonly left: number,
		readonly top: number,
		readonly height: number,
		readonly line: number,
		readonly onClick: (line: number) => void,
	) {}

	eq(other: LineMarker) {
		return other.left === this.left && other.top === this.top && other.height === this.height && other.line === this.line;
	}

	draw() {
		const el = createDiv({ cls: 'listwise-list-line' });
		this.adjust(el);
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.onClick(Number(el.dataset.line));
		});
		return el;
	}

	update(el: HTMLElement, prev: LineMarker) {
		if (prev.onClick !== this.onClick) return false;
		this.adjust(el);
		return true;
	}

	private adjust(el: HTMLElement) {
		// ^ Geometry as CSS variables (styles.css places the line): themes can still restyle it.
		el.setCssProps({ '--listwise-x': `${this.left}px`, '--listwise-y': `${this.top}px`, '--listwise-height': `${this.height}px` });
		el.dataset.line = String(this.line);
	}
}

const hiddenByFold = (item: Item) => {
	for (let p = item.parent; p && p.parent; p = p.parent) if (p.folded) return true;
	return false;
};

/** Deepest last descendant that is not hidden by a fold. */
function lastVisible(item: Item): Item {
	let end = item;
	while (end.children.length && !end.folded) end = end.children[end.children.length - 1];
	return end;
}

function toggleChildren(view: EditorView, line: number) {
	const block = blockAt(view.state, line);
	const item = block && walk(block.root).find((i) => i.line === line);
	if (!item) return;
	const kids = item.children.filter((c) => c.children.length || c.notes.length);
	const unfold = kids.length > 0 && kids.every((c) => c.folded);
	const effects = kids.flatMap((c) => (unfold ? unfoldAt(view.state, c.line) : (foldAt(view.state, c.line) ?? [])));
	if (effects.length) view.dispatch({ effects });
}

export function listLines(get: GetSettings) {
	return layer({
		above: true,
		class: 'listwise-list-lines',
		update: (u) => u.docChanged || u.viewportChanged || u.geometryChanged || u.transactions.some((t) => t.effects.length > 0),
		markers(view) {
			const out: LineMarker[] = [];
			const { state } = view;
			const scroller = view.scrollDOM.getBoundingClientRect();
			const baseLeft = scroller.left - view.scrollDOM.scrollLeft;
			const baseTop = scroller.top - view.scrollDOM.scrollTop;
			const onClick = (line: number) => {
				const action = get().listLineAction;
				if (action === 'toggle-folding') toggleChildren(view, line);
				else if (action === 'zoom-in') zoomIn(view, line);
			};
			const seen = new Set<number>();
			for (const { from, to } of view.visibleRanges) {
				for (let pos = from; pos <= to; ) {
					const line = state.doc.lineAt(pos);
					pos = line.to + 1;
					const n = line.number - 1;
					if (seen.has(n)) continue;
					const block = blockAt(state, n);
					if (!block) continue;
					for (let k = block.from; k <= block.to; k++) seen.add(k);
					const draw = (item: Item) => {
						if (!item.children.length || item.folded || hiddenByFold(item)) return;
						const first = state.doc.line(item.line + 1);
						const bullet = view.coordsAtPos(first.from + item.indent.length, 1);
						if (!bullet) return;
						const end = lastVisible(item);
						const lastLine = state.doc.line(end.line + (end.folded ? 1 : ownLines(end)));
						const top = view.lineBlockAt(first.from).bottom + view.documentTop - baseTop;
						const bottom = view.lineBlockAt(lastLine.from).bottom + view.documentTop - baseTop;
						const width = view.defaultCharacterWidth;
						out.push(new LineMarker(bullet.left - baseLeft + width / 2, top, Math.max(0, bottom - top), item.line, onClick));
					};
					walk(block.root).forEach(draw);
				}
			}
			return out;
		},
	});
}
