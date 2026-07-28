import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = fileURLToPath(new URL('..', import.meta.url));
const out_dir = 'dist/bundlesize';
// the ceiling costs ~0.4s on top of the app build, so it is on by default
const with_ceiling = !process.argv.includes('--no-ceiling');

// `src` is gitignored scratch space, so seed the entry point the same way `prepare` does
const entry = path.join(root, 'src/App.svelte');
// spell the path out from the repo root — there are a dozen App.svelte files in this
// monorepo and "src/App.svelte" does not say which one the numbers came from
const entry_label = path.relative(path.join(root, '../..'), entry);
if (!fs.existsSync(entry)) {
	fs.mkdirSync(path.dirname(entry), { recursive: true });
	fs.copyFileSync(path.join(root, 'scripts/main.template.svelte'), entry);
}

// deliberately ignores vite.config.js — that config sets `minify: false` for readable dev
// builds, which would make these numbers meaningless
await build({
	root,
	configFile: false,
	logLevel: 'warn',
	plugins: [svelte()],
	build: {
		outDir: out_dir,
		emptyOutDir: true,
		minify: 'esbuild',
		reportCompressedSize: false,
		rollupOptions: {
			output: {
				// split the runtime out of the app code so the two are reported separately
				manualChunks(id) {
					if (id.replace(/\\/g, '/').includes('/packages/svelte/src/')) return 'svelte-runtime';
				}
			}
		}
	}
});

/** @param {number} bytes */
function kb(bytes) {
	return `${(bytes / 1024).toFixed(2)} kB`;
}

const assets = path.join(root, out_dir, 'assets');

const files = fs
	.readdirSync(assets)
	.filter((name) => name.endsWith('.js') || name.endsWith('.css'))
	.map((name) => {
		const contents = fs.readFileSync(path.join(assets, name));
		return {
			name,
			runtime: name.startsWith('svelte-runtime'),
			raw: contents.length,
			gzip: zlib.gzipSync(contents, { level: 9 }).length,
			brotli: zlib.brotliCompressSync(contents).length
		};
	})
	.sort((a, b) => b.raw - a.raw);

const rows = [
	['', 'raw', 'gzip', 'brotli'],
	...files.map((file) => [file.name, kb(file.raw), kb(file.gzip), kb(file.brotli)]),
	[
		'total',
		kb(files.reduce((n, file) => n + file.raw, 0)),
		kb(files.reduce((n, file) => n + file.gzip, 0)),
		kb(files.reduce((n, file) => n + file.brotli, 0))
	]
];

const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));

/** @param {string[]} row */
const render = (row) =>
	'  ' +
	row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i] + 2))).join('');

const rule = '  ' + '─'.repeat(widths.reduce((n, w) => n + w + 2, -2));

console.log('\nclient bundle (minified)\n');
console.log(render(rows[0]));
console.log(rule);
for (const row of rows.slice(1, -1)) console.log(render(row));
console.log(rule);
console.log(render(rows.at(-1)));

const runtime = files.find((file) => file.runtime);
if (runtime) {
	console.log(`\n  svelte runtime: ${kb(runtime.gzip)} gzip / ${kb(runtime.brotli)} brotli`);
}

console.log(
	`\n  the runtime is treeshaken — this reflects the features used in\n  ${entry_label}, not a fixed baseline.\n  compare runs, don't read a single number.`
);

if (with_ceiling) {
	const { build_ceiling } = await import('./ceiling.js');
	const { file, count, skipped, include_dev } = await build_ceiling(root, {
		include_dev: process.argv.includes('--include-dev')
	});
	const contents = fs.readFileSync(file);
	const ceiling = {
		raw: contents.length,
		gzip: zlib.gzipSync(contents, { level: 9 }).length,
		brotli: zlib.brotliCompressSync(contents).length
	};

	const surface = include_dev
		? `all ${count} exports, dev surface included`
		: `${count} production exports (${skipped} dev-only excluded)`;

	console.log(`\n  ceiling — ${surface}, forced live\n`);
	console.log(`    raw    ${kb(ceiling.raw)}`);
	console.log(`    gzip   ${kb(ceiling.gzip)}`);
	console.log(`    brotli ${kb(ceiling.brotli)}`);

	if (runtime) {
		const pct = ((runtime.gzip / ceiling.gzip) * 100).toFixed(1);
		console.log(
			`\n  this app ships ${pct}% of the maximum (${kb(runtime.gzip)} of ${kb(ceiling.gzip)} gzip)`
		);
	}
}

console.log();
