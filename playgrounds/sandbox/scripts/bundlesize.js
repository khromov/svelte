import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = fileURLToPath(new URL('..', import.meta.url));
// the ceiling costs ~0.4s on top of the app builds, so it is on by default
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

// the app is built once per compiler mode. the sandbox config enables `experimental.async`,
// which imports `svelte/internal/flags/async` and keeps every `async_mode_flag` branch alive —
// so the async-off build is the one that shows what a typical (non-async) app ships today.
// inline plugin options are merged on top of svelte.config.js, so the override wins.
const modes = [
	{
		label: 'experimental.async: true (sandbox default)',
		out_dir: 'dist/bundlesize',
		options: {}
	},
	{
		label: 'experimental.async: false',
		out_dir: 'dist/bundlesize-sync',
		options: { compilerOptions: { experimental: { async: false } } }
	}
];

/** @param {number} bytes */
function kb(bytes) {
	return `${(bytes / 1024).toFixed(2)} kB`;
}

/**
 * @param {string} out_dir
 * @param {Record<string, any>} svelte_options
 */
async function measure(out_dir, svelte_options) {
	// deliberately ignores vite.config.js — that config sets `minify: false` for readable dev
	// builds, which would make these numbers meaningless
	await build({
		root,
		configFile: false,
		logLevel: 'warn',
		plugins: [svelte(svelte_options)],
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

	const assets = path.join(root, out_dir, 'assets');

	return fs
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
}

/** @param {Awaited<ReturnType<typeof measure>>} files */
function print_table(files) {
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
		row
			.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i] + 2)))
			.join('');

	const rule = '  ' + '─'.repeat(widths.reduce((n, w) => n + w + 2, -2));

	console.log(render(rows[0]));
	console.log(rule);
	for (const row of rows.slice(1, -1)) console.log(render(row));
	console.log(rule);
	console.log(render(rows.at(-1)));
}

const results = [];

for (const mode of modes) {
	results.push({ ...mode, files: await measure(mode.out_dir, mode.options) });
}

for (const result of results) {
	console.log(`\nclient bundle (minified) — ${result.label}\n`);
	print_table(result.files);

	const runtime = result.files.find((file) => file.runtime);
	if (runtime) {
		console.log(`\n  svelte runtime: ${kb(runtime.gzip)} gzip / ${kb(runtime.brotli)} brotli`);
	}
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

	for (const result of results) {
		const runtime = result.files.find((file) => file.runtime);
		if (runtime) {
			const pct = ((runtime.gzip / ceiling.gzip) * 100).toFixed(1);
			console.log(
				`\n  ${result.label}:\n    ships ${pct}% of the maximum (${kb(runtime.gzip)} of ${kb(ceiling.gzip)} gzip)`
			);
		}
	}
}

console.log();
