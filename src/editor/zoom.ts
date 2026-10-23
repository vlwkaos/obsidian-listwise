// Obsidian Zoom plugin bridge (window.ObsidianZoomPlugin), same surface obsidian-outliner uses.

import { EditorView } from '@codemirror/view';
import { Editor, editorInfoField } from 'obsidian';

interface ZoomApi {
	getZoomRange(e: Editor): { from: { line: number; ch: number }; to: { line: number; ch: number } } | null;
	zoomIn(e: Editor, line: number): void;
	refreshZoom?(e: Editor): void;
}

declare global {
	interface Window {
		ObsidianZoomPlugin?: ZoomApi;
	}
}

const editorOf = (view: EditorView) => view.state.field(editorInfoField, false)?.editor ?? null;

/** First line (0-based) of the zoomed item, or null. */
export function zoomLine(view: EditorView): number | null {
	const editor = editorOf(view);
	if (!editor || !window.ObsidianZoomPlugin) return null;
	return window.ObsidianZoomPlugin.getZoomRange(editor)?.from.line ?? null;
}

export function refreshZoom(view: EditorView) {
	const editor = editorOf(view);
	const zoom = window.ObsidianZoomPlugin;
	if (!editor || !zoom) return;
	if (zoom.refreshZoom) zoom.refreshZoom(editor);
	else {
		const line = zoomLine(view);
		if (line !== null) zoom.zoomIn(editor, line);
	}
}

export function zoomIn(view: EditorView, line: number): boolean {
	const editor = editorOf(view);
	if (!editor || !window.ObsidianZoomPlugin) return false;
	window.ObsidianZoomPlugin.zoomIn(editor, line);
	return true;
}
