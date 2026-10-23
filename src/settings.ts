// Settings mirror obsidian-outliner's (src/services/Settings.ts) so users can switch over.

import { App, PluginSettingTab, Setting } from 'obsidian';
import type ListwisePlugin from './main';

export type StickCursor = 'never' | 'bullet-only' | 'bullet-and-checkbox';
export type LineAction = 'none' | 'zoom-in' | 'toggle-folding';

export interface ListwiseSettings {
	styleLists: boolean;
	stickCursor: StickCursor;
	betterEnter: boolean;
	betterTab: boolean;
	betterVimO: boolean;
	selectAll: boolean;
	listLines: boolean;
	listLineAction: LineAction;
	dnd: boolean;
	debug: boolean;
}

const DEFAULT_SETTINGS: ListwiseSettings = {
	styleLists: true,
	stickCursor: 'bullet-and-checkbox',
	betterEnter: true,
	betterTab: true,
	betterVimO: true,
	selectAll: true,
	listLines: false,
	listLineAction: 'toggle-folding',
	dnd: true,
	debug: false,
};

/** Accept saved data from older versions or hand edits; unknown values fall back to defaults. */
export function readSettings(raw: unknown): ListwiseSettings {
	const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const out = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof ListwiseSettings>) {
		if (typeof data[key] === typeof DEFAULT_SETTINGS[key]) (out as Record<string, unknown>)[key] = data[key];
	}
	if (!['never', 'bullet-only', 'bullet-and-checkbox'].includes(out.stickCursor)) out.stickCursor = DEFAULT_SETTINGS.stickCursor;
	if (!['none', 'zoom-in', 'toggle-folding'].includes(out.listLineAction)) out.listLineAction = DEFAULT_SETTINGS.listLineAction;
	return out;
}

export class ListwiseSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ListwisePlugin) {
		super(app, plugin);
	}

	display() {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = (patch: Partial<ListwiseSettings>) => this.plugin.updateSettings(patch);
		containerEl.empty();

		new Setting(containerEl)
			.setName('Stick the cursor to the content')
			.setDesc('Keep the cursor and selections from landing on bullets and checkboxes. Also enables the Backspace and Delete list behavior.')
			.addDropdown((d) =>
				d
					.addOptions({ never: 'Never', 'bullet-only': 'Stick cursor out of bullets', 'bullet-and-checkbox': 'Stick cursor out of bullets and checkboxes' })
					.setValue(s.stickCursor)
					.onChange((v) => save({ stickCursor: v as StickCursor })),
			);
		new Setting(containerEl)
			.setName('Enhance the Tab key')
			.setDesc('Tab and Shift+Tab indent and outdent the selected items with their children.')
			.addToggle((t) => t.setValue(s.betterTab).onChange((v) => save({ betterTab: v })));
		new Setting(containerEl)
			.setName('Enhance the Enter key')
			.setDesc('Enter outdents an empty item, adds a first child under an open parent and carries checkboxes.')
			.addToggle((t) => t.setValue(s.betterEnter).onChange((v) => save({ betterEnter: v })));
		new Setting(containerEl)
			.setName('Vim-mode o/O inserts list items')
			.setDesc('Takes effect after an app restart when turned off.')
			.addToggle((t) => t.setValue(s.betterVimO).onChange((v) => save({ betterVimO: v })));
		new Setting(containerEl)
			.setName('Enhance Ctrl+A or Cmd+A')
			.setDesc('Each press selects a larger part of the list: the item, its children, each parent, the whole list.')
			.addToggle((t) => t.setValue(s.selectAll).onChange((v) => save({ selectAll: v })));
		new Setting(containerEl)
			.setName('Improve the style of your lists')
			.addToggle((t) => t.setValue(s.styleLists).onChange((v) => save({ styleLists: v })));
		new Setting(containerEl)
			.setName('Draw vertical indentation lines')
			.addToggle((t) => t.setValue(s.listLines).onChange((v) => save({ listLines: v })));
		new Setting(containerEl)
			.setName('Vertical indentation line click action')
			.addDropdown((d) =>
				d
					.addOptions({ none: 'None', 'zoom-in': 'Zoom in', 'toggle-folding': 'Toggle folding' })
					.setValue(s.listLineAction)
					.onChange((v) => save({ listLineAction: v as LineAction })),
			);
		new Setting(containerEl)
			.setName('Drag and drop')
			.setDesc('Drag a bullet to move the item with its children. Desktop only.')
			.addToggle((t) => t.setValue(s.dnd).onChange((v) => save({ dnd: v })));
		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Log list operations to the developer console.')
			.addToggle((t) => t.setValue(s.debug).onChange((v) => save({ debug: v })));
	}
}
