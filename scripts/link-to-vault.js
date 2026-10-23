#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_NAME = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')).id;
const FILES_TO_LINK = ['main.js', 'manifest.json', 'styles.css'];
const SEARCH_ROOTS = [
	os.homedir(),
	path.join(os.homedir(), 'Documents'),
	path.join(os.homedir(), 'Desktop'),
];

function searchDir(dir, name, depth, maxDepth) {
	if (depth > maxDepth) return null;
	try {
		const candidate = path.join(dir, name);
		const obsidianDir = path.join(candidate, '.obsidian');
		if (fs.existsSync(obsidianDir) && fs.statSync(obsidianDir).isDirectory()) return candidate;
		if (depth < maxDepth) {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
				const result = searchDir(path.join(dir, entry.name), name, depth + 1, maxDepth);
				if (result) return result;
			}
		}
	} catch { /* permission errors */ }
	return null;
}

function resolveVault(arg) {
	if (path.isAbsolute(arg)) return arg;
	for (const root of SEARCH_ROOTS) {
		const found = searchDir(root, arg, 0, 3);
		if (found) return found;
	}
	console.error(`Vault "${arg}" not found under ${SEARCH_ROOTS.join(', ')}`);
	process.exit(1);
}

function createSymlink(src, dest) {
	try { fs.lstatSync(dest); fs.unlinkSync(dest); } catch { /* doesn't exist */ }
	fs.symlinkSync(src, dest);
	console.log(`  Linked: ${path.basename(src)}`);
}

function main() {
	const arg = process.argv[2];
	if (!arg) {
		console.error('Usage: node scripts/link-to-vault.js <vault-name-or-absolute-path>');
		process.exit(1);
	}

	const pluginDir = path.resolve(__dirname, '..');
	const vaultPath = resolveVault(arg);
	const destDir = path.join(vaultPath, '.obsidian', 'plugins', PLUGIN_NAME);
	fs.mkdirSync(destDir, { recursive: true });

	console.log(`Linking to: ${destDir}`);
	let linked = 0;
	for (const file of FILES_TO_LINK) {
		const src = path.join(pluginDir, file);
		if (!fs.existsSync(src)) { console.log(`  Skip: ${file} (not built yet)`); continue; }
		createSymlink(src, path.join(destDir, file));
		linked++;
	}
	console.log(`Done. ${linked} files linked.`);
}

main();
