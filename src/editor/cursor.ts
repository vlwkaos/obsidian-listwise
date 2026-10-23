// Keeps cursors off bullets and checkboxes, and out of folded lines.
// A synchronous transaction filter, unlike outliner's setTimeout, so the cursor never
// flickers into the marker and the correction is part of the same transaction.
// https://codemirror.net/docs/ref/#state.EditorState^transactionFilter

import { foldedRanges } from '@codemirror/language';
import { EditorSelection, EditorState, Extension } from '@codemirror/state';
import { matchItem } from '../core/model';
import type { GetSettings } from './keys';

export function stickCursor(get: GetSettings): Extension {
	return EditorState.transactionFilter.of((tr) => {
		const mode = get().stickCursor;
		if (mode === 'never' || !tr.selection || tr.isUserEvent('input.type.compose')) return tr;
		const doc = tr.newDoc;
		const folds = foldedRanges(tr.startState).map(tr.changes);
		const clamp = (pos: number, sameLine: boolean) => {
			let hidden = -1;
			folds.between(pos, pos, (from, to) => {
				if (from < pos && pos <= to) hidden = from;
			});
			if (hidden >= 0) return hidden;
			if (!sameLine) return pos;
			const line = doc.lineAt(pos);
			const m = matchItem(line.text);
			if (!m) return pos;
			const start = line.from + m.indent.length + m.bullet.length + m.space.length + (mode === 'bullet-and-checkbox' ? m.checkbox.length : 0);
			return pos < start ? start : pos;
		};
		let moved = false;
		const ranges = tr.selection.ranges.map((r) => {
			// ^ Multi-line selections keep their ends, so whole lines can still be selected from column 0.
			const sameLine = doc.lineAt(r.anchor).number === doc.lineAt(r.head).number;
			const anchor = r.empty ? clamp(r.head, true) : clamp(r.anchor, sameLine);
			const head = r.empty ? anchor : clamp(r.head, sameLine);
			if (anchor === r.anchor && head === r.head) return r;
			moved = true;
			return EditorSelection.range(anchor, head);
		});
		if (!moved) return tr;
		return [tr, { selection: EditorSelection.create(ranges, tr.selection.mainIndex), sequential: true }];
	});
}
