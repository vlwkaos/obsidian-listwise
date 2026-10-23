import { Compartment, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Platform, Plugin } from 'obsidian';
import { registerCommands } from './commands';
import { stickCursor } from './editor/cursor';
import { dragAndDrop } from './editor/dnd';
import { listKeys } from './editor/keys';
import { listLines } from './editor/lines';
import { registerVim } from './editor/vim';
import { setDebug } from './log';
import { ListwiseSettingTab, ListwiseSettings, readSettings } from './settings';

export default class ListwisePlugin extends Plugin {
	settings!: ListwiseSettings;
	private lines = new Compartment();
	private vimReady = false;
	/** Documents of the main window and every open popout window; body classes go on each. */
	private docs = new Set<Document>([activeWindow.document]);

	async onload() {
		this.settings = readSettings(await this.loadData());
		setDebug(this.settings.debug);
		const get = () => this.settings;
		const extensions: Extension[] = [listKeys(get), stickCursor(get), this.lines.of(this.linesExtension())];
		if (Platform.isDesktop) extensions.push(dragAndDrop(get));
		this.registerEditorExtension(extensions);
		registerCommands(this);
		this.addSettingTab(new ListwiseSettingTab(this.app, this));
		this.app.workspace.iterateAllLeaves((leaf) => this.docs.add(leaf.view.containerEl.ownerDocument));
		this.registerEvent(
			this.app.workspace.on('window-open', (win) => {
				this.docs.add(win.doc);
				this.applyBodyClass();
			}),
		);
		this.registerEvent(this.app.workspace.on('window-close', (win) => this.docs.delete(win.doc)));
		this.applyBodyClass();
		// ^ The Vim adapter exists only after vim mode loaded once; retry when layout is ready.
		this.app.workspace.onLayoutReady(() => this.initVim());
	}

	onunload() {
		for (const doc of this.docs) doc.body.removeClasses(['listwise-better-lists', 'listwise-list-lines-on']);
	}

	private linesExtension(): Extension {
		return this.settings.listLines ? listLines(() => this.settings) : [];
	}

	private initVim() {
		if (!this.vimReady && this.settings.betterVimO) this.vimReady = registerVim(this);
	}

	private applyBodyClass() {
		for (const doc of this.docs) {
			doc.body.toggleClass('listwise-better-lists', this.settings.styleLists);
			doc.body.toggleClass('listwise-list-lines-on', this.settings.listLines);
		}
	}

	async updateSettings(patch: Partial<ListwiseSettings>) {
		const linesBefore = this.settings.listLines;
		this.settings = { ...this.settings, ...patch };
		await this.saveData(this.settings);
		setDebug(this.settings.debug);
		this.applyBodyClass();
		this.initVim();
		if (linesBefore !== this.settings.listLines) {
			const effect = this.lines.reconfigure(this.linesExtension());
			this.app.workspace.iterateAllLeaves((leaf) => {
				const cm = (leaf.view as unknown as { editor?: { cm?: EditorView } }).editor?.cm;
				cm?.dispatch({ effects: effect });
			});
		}
	}
}
