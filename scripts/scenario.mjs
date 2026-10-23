#!/usr/bin/env node
// Real-app scenarios: drives the running Obsidian through the `obsidian` CLI.
// Keys and mouse go through CDP Input.dispatch*Event, so they take the same path as a user's.
// Every step first checks that the active file is the scenario note; it never touches other notes.
//
// Usage: npm run scenario -- <vault> [name-filter]
// Set LISTWISE_CAPTURE_DIR to save screenshots from `capture` steps (skipped otherwise).
// Needs: Obsidian running with the vault open, Listwise enabled, outliner disabled.
// Note markers: `|` cursor, `«` anchor, `»` head (several allowed).

import { spawnSync } from 'node:child_process';
import { scenarios } from './scenarios.mjs';

const vault = process.argv[2];
if (!vault) {
	console.error('Usage: npm run scenario -- <vault> [name-filter]');
	process.exit(1);
}
const filter = process.argv[3] ?? '';
// ^ A scratch note the runner owns; set LISTWISE_SCENARIO_NOTE to place it, for example in a folder your sync ignores.
const NOTE = process.env.LISTWISE_SCENARIO_NOTE || 'Listwise Scenarios.md';

function cli(...args) {
	const r = spawnSync('obsidian', [`vault=${vault}`, ...args], { encoding: 'utf8', timeout: 20000 });
	const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
	if (r.error) throw r.error;
	if (/^Error/m.test(out)) throw new Error(out.trim());
	return out;
}

/** Block this process for `ms`; the runner is synchronous by design. */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let emptyRetries = 0;

/** An empty CLI reply is retried once; a step that is not idempotent then fails visibly. */
function evaluate(code) {
	// ^ The CLI takes one line of code.
	const line = `code=${code.replace(/\n\s*/g, ' ')}`;
	let out = cli('eval', line);
	if (!out.trim()) {
		emptyRetries++;
		sleep(300);
		out = cli('eval', line);
	}
	const m = /=> ([\s\S]*)$/.exec(out.trim());
	if (!m) throw new Error(`eval returned no value: ${out} for ${code.slice(0, 160)}`);
	return JSON.parse(m[1]);
}

const cdp = (method, params) => cli('dev:cdp', `method=${method}`, `params=${JSON.stringify(params)}`);

// ^ Guard shared by every eval: refuse to act unless the scenario note is active.
const GUARD = `const f = app.workspace.getActiveFile(); if (!f || f.path !== ${JSON.stringify(NOTE)}) throw new Error('active file is ' + (f && f.path));
const cm = app.workspace.activeEditor.editor.cm;`;

/** Opens the scenario note in Live Preview, the mode users edit in; Source text is checked through the saved file. */
function openNote() {
	evaluate(`(async () => {
		let f = app.vault.getAbstractFileByPath(${JSON.stringify(NOTE)});
		if (!f) f = await app.vault.create(${JSON.stringify(NOTE)}, '');
		const leaf = app.workspace.getLeavesOfType('markdown').find((l) => l.view.file && l.view.file.path === f.path) || app.workspace.getLeaf('tab');
		await leaf.openFile(f, { active: true, state: { mode: 'source', source: false } });
		await leaf.setViewState({ ...leaf.getViewState(), state: { ...leaf.getViewState().state, mode: 'source', source: false } });
		app.workspace.setActiveLeaf(leaf, { focus: true });
		return JSON.stringify(true);
	})()`);
}

/** Split marked text into plain text and selection ranges. */
function parseMarked(marked) {
	let text = '';
	const cursors = [];
	let anchor = null;
	for (const ch of marked) {
		if (ch === '|') cursors.push({ anchor: text.length, head: text.length });
		else if (ch === '«') anchor = text.length;
		else if (ch === '»') {
			cursors.push({ anchor, head: text.length });
			anchor = null;
		} else text += ch;
	}
	return { text, cursors };
}

function render(text, ranges) {
	const marks = [];
	for (const r of ranges) {
		if (r.anchor === r.head) marks.push([r.head, '|']);
		else marks.push([r.anchor, '«'], [r.head, '»']);
	}
	marks.sort((a, b) => b[0] - a[0] || (a[1] === '»' ? -1 : 1));
	let out = text;
	for (const [pos, m] of marks) out = out.slice(0, pos) + m + out.slice(pos);
	return out;
}

function setup(sc) {
	const { text, cursors } = parseMarked(sc.doc);
	evaluate(`(() => { ${GUARD}
		app.commands.executeCommandById('editor:unfold-all');
		cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: ${JSON.stringify(text)} } });
		for (const n of ${JSON.stringify(sc.fold ?? [])}) {
			cm.dispatch({ selection: { anchor: cm.state.doc.line(n + 1).from } });
			app.commands.executeCommandById('editor:toggle-fold');
		}
		const sel = ${JSON.stringify(cursors)};
		const ranges = sel.map((r) => cm.state.selection.constructor.range(r.anchor, r.head));
		cm.dispatch({ selection: cm.state.selection.constructor.create(ranges, 0) });
		cm.focus();
		return JSON.stringify(true);
	})()`);
}

function read() {
	// ^ CodeMirror measures (and draws layers) in requestAnimationFrame, which a background window
	// throttles; flush the pending measure so the read sees the drawn state.
	// `levels` is the list level Live Preview draws per line (0 = not a list line);
	// `disk` is the saved Markdown, so a change that never reached the file shows up.
	return evaluate(`(async () => { ${GUARD}
		if (typeof cm.measure === 'function') cm.measure();
		const folded = [...cm.dom.querySelectorAll('.cm-foldPlaceholder')].map((el) => cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1);
		const levels = [];
		for (const el of cm.contentDOM.querySelectorAll('.cm-line')) {
			const m = /HyperMD-list-line-(\\d+)/.exec(el.className);
			levels[cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1] = m ? Number(m[1]) : 0;
		}
		const view = app.workspace.activeEditor;
		await view.save();
		const disk = await app.vault.adapter.read(f.path);
		const live = !view.getState().source;
		return JSON.stringify({ text: cm.state.doc.toString(), ranges: cm.state.selection.ranges.map((r) => ({ anchor: r.anchor, head: r.head })), folded, lines: cm.dom.querySelectorAll('.listwise-list-line').length, levels, disk, live });
	})()`);
}

const KEYS = {
	Tab: ['Tab', 9],
	Enter: ['Enter', 13],
	Backspace: ['Backspace', 8],
	Delete: ['Delete', 46],
	ArrowLeft: ['ArrowLeft', 37],
	ArrowUp: ['ArrowUp', 38],
	ArrowRight: ['ArrowRight', 39],
	ArrowDown: ['ArrowDown', 40],
	Home: ['Home', 36],
	Escape: ['Escape', 27],
};

function press(spec) {
	const parts = spec.split('+');
	const key = parts.pop();
	let modifiers = 0;
	for (const p of parts) modifiers |= { Alt: 1, Ctrl: 2, Mod: 4, Meta: 4, Shift: 8 }[p];
	const [k, vk] = KEYS[key] ?? [key, key.toUpperCase().charCodeAt(0)];
	const code = KEYS[key] ? k : `Key${key.toUpperCase()}`;
	const text = k === 'Enter' && !(modifiers & 7) ? '\r' : undefined;
	cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text, unmodifiedText: text } : {}) });
	cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
}

/** Drag the bullet of line `from` to line `to`, at `where` (before | after | inside). */
function drag([from, to, where, cancel]) {
	const geo = evaluate(`(() => { ${GUARD}
		const at = (n, ch) => cm.coordsAtPos(cm.state.doc.line(n + 1).from + ch, 1);
		const indent = (n) => /^[ \\t]*/.exec(cm.state.doc.line(n + 1).text)[0].length;
		const a = at(${from}, indent(${from}));
		const b = at(${to}, indent(${to}));
		return JSON.stringify({ ax: a.left + 3, ay: (a.top + a.bottom) / 2, bx: b.left + 3, top: b.top, bottom: b.bottom, cw: cm.defaultCharacterWidth });
	})()`);
	const y = where === 'before' ? geo.top + 2 : geo.bottom - 2;
	const x = where === 'inside' ? geo.bx + geo.cw * 4 : geo.bx;
	const mouse = (type, px, py, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: px, y: py, button: 'left', ...extra });
	mouse('mouseMoved', geo.ax, geo.ay, { button: 'none' });
	mouse('mousePressed', geo.ax, geo.ay, { clickCount: 1, buttons: 1 });
	const steps = 6;
	for (let i = 1; i <= steps; i++) mouse('mouseMoved', geo.ax + ((x - geo.ax) * i) / steps, geo.ay + ((y - geo.ay) * i) / steps, { buttons: 1 });
	if (typeof cancel === 'string' && cancel.startsWith('capture:')) {
		capture(cancel.slice('capture:'.length));
		press('Escape');
	} else if (cancel) press('Escape');
	mouse('mouseReleased', x, y, { clickCount: 1 });
}

function capture(name) {
	const dir = process.env.LISTWISE_CAPTURE_DIR;
	if (!dir) return;
	// ^ A background window may not repaint, so the DOM state is printed next to the image.
	const dom = evaluate(`(() => { ${GUARD} cm.measure();
		const ind = document.querySelector('.listwise-drop-indicator');
		const r = ind && ind.getBoundingClientRect();
		return JSON.stringify({ indicator: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width)], dimmed: cm.dom.querySelectorAll('.listwise-dragging-line').length, lines: cm.dom.querySelectorAll('.listwise-list-line').length });
	})()`);
	cli('dev:screenshot', `path=${dir}/${name}`);
	console.log(`     capture ${name} ${JSON.stringify(dom)}`);
}

/** Click the first element matching `selector` inside the editor. */
function click(selector) {
	const box = evaluate(`(() => { ${GUARD}
		const el = cm.dom.querySelector(${JSON.stringify(selector)});
		if (!el) throw new Error('no element ' + ${JSON.stringify(selector)});
		const r = el.getBoundingClientRect();
		return JSON.stringify({ x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 8) });
	})()`);
	cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none' });
	cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
	cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

function act(step) {
	if (typeof step === 'string') return press(step);
	if (step.drag) return drag(step.drag);
	if (step.click) return click(step.click);
	if (step.capture) return capture(step.capture);
	if (step.sleep) return sleep(step.sleep);
	if (step.eval) return evaluate(`(async () => { ${GUARD} ${step.eval}; return JSON.stringify(true); })()`);
	throw new Error(`unknown step ${JSON.stringify(step)}`);
}

let pass = 0;
let fail = 0;
const t0 = Date.now();
openNote();
for (const sc of scenarios.filter((s) => s.name.includes(filter))) {
	const problems = [];
	try {
		setup(sc);
		for (const step of sc.keys) act(step);
		const got = read();
		const marked = render(got.text, got.ranges);
		if (sc.expect !== undefined && marked !== sc.expect) problems.push(`doc\n    want ${JSON.stringify(sc.expect)}\n    got  ${JSON.stringify(marked)}`);
		if (sc.folded && JSON.stringify(got.folded) !== JSON.stringify(sc.folded)) problems.push(`folded want ${JSON.stringify(sc.folded)} got ${JSON.stringify(got.folded)}`);
		if (!got.live) problems.push('the note is not in Live Preview');
		if (got.disk !== got.text) problems.push(`saved Markdown differs from the editor\n    file   ${JSON.stringify(got.disk)}\n    editor ${JSON.stringify(got.text)}`);
		if (sc.levels && JSON.stringify(got.levels) !== JSON.stringify(sc.levels)) problems.push(`Live Preview list levels want ${JSON.stringify(sc.levels)} got ${JSON.stringify(got.levels)}`);
		if (sc.lines !== undefined && got.lines !== sc.lines) problems.push(`list lines want ${sc.lines} got ${got.lines}`);
		if (sc.undo) {
			press('Mod+z');
			const back = read();
			if (back.text !== parseMarked(sc.doc).text) problems.push(`one undo\n    want ${JSON.stringify(parseMarked(sc.doc).text)}\n    got  ${JSON.stringify(back.text)}`);
		}
		if (sc.after) act({ eval: sc.after });
	} catch (e) {
		problems.push(String(e.message ?? e).split('\n')[0]);
		if (sc.after) {
			try {
				act({ eval: sc.after });
			} catch {}
		}
	}
	if (problems.length) {
		fail++;
		console.log(`FAIL ${sc.name}\n  ${problems.join('\n  ')}`);
	} else {
		pass++;
		console.log(`ok   ${sc.name}`);
	}
}
console.log(`\n${pass} passed, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s (${emptyRetries} empty CLI replies retried)`);
process.exit(fail ? 1 : 0);
