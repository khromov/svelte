/** @import { Source } from '#client' */
import { DEV } from 'esm-env';
import { set, state } from '../internal/client/reactivity/sources.js';
import { tag } from '../internal/client/dev/tracing.js';
import { get } from '../internal/client/runtime.js';
import { REPLACE, SvelteURLSearchParams } from './url-search-params.js';

/** @type {SvelteURL | null} */
let current_url = null;

var accessors = ['protocol', 'username', 'password', 'hostname', 'port', 'pathname', 'hash'];
var properties = [...accessors, 'search'];

var inited = false;

export function get_current_url() {
	// ideally we'd just export `current_url` directly, but it seems Vitest doesn't respect live bindings
	return current_url;
}

/**
 * A reactive version of the built-in [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) object.
 * Reading properties of the URL (such as `url.href` or `url.pathname`) in an [effect](https://svelte.dev/docs/svelte/$effect) or [derived](https://svelte.dev/docs/svelte/$derived)
 * will cause it to be re-evaluated as necessary when the URL changes.
 *
 * The `searchParams` property is an instance of [SvelteURLSearchParams](https://svelte.dev/docs/svelte/svelte-reactivity#SvelteURLSearchParams).
 *
 * [Example](https://svelte.dev/playground/5a694758901b448c83dc40dc31c71f2a):
 *
 * ```svelte
 * <script>
 * 	import { SvelteURL } from 'svelte/reactivity';
 *
 * 	const url = new SvelteURL('https://example.com/path');
 * </script>
 *
 * <!-- changes to these... -->
 * <input bind:value={url.protocol} />
 * <input bind:value={url.hostname} />
 * <input bind:value={url.pathname} />
 *
 * <hr />
 *
 * <!-- will update `href` and vice versa -->
 * <input bind:value={url.href} size="65" />
 * ```
 */
export class SvelteURL extends URL {
	/** @type {Record<string, Source<string>>} */
	#sources = {};
	#searchParams;

	/**
	 * @param {string | URL} url
	 * @param {string | URL} [base]
	 */
	constructor(url, base) {
		url = new URL(url, base);
		super(url);

		for (const key of properties) {
			// @ts-ignore
			const s = (this.#sources[key] = state(super[key]));

			if (DEV) {
				tag(s, `SvelteURL.${key}`);
			}
		}

		current_url = this;
		this.#searchParams = new SvelteURLSearchParams(url.searchParams);
		current_url = null;

		if (!inited) this.#init();
	}

	// We init as part of the first instance so that we can treeshake this class
	#init() {
		inited = true;

		var proto = SvelteURL.prototype;
		var url_proto = URL.prototype;

		for (const key of accessors) {
			Object.defineProperty(proto, key, {
				/** @this {SvelteURL} */
				get() {
					return get(this.#sources[key]);
				},
				/** @this {SvelteURL} */
				set(value) {
					// equivalent to `super[key] = value; set(source, super[key])` —
					// `Reflect` follows the prototype chain, unlike `Object.getOwnPropertyDescriptor`
					Reflect.set(url_proto, key, value, this);
					set(this.#sources[key], Reflect.get(url_proto, key, this));
				},
				configurable: true
			});
		}
	}

	get host() {
		var sources = this.#sources;
		get(sources.hostname);
		get(sources.port);
		return super.host;
	}

	set host(value) {
		super.host = value;
		var sources = this.#sources;
		set(sources.hostname, super.hostname);
		set(sources.port, super.port);
	}

	get href() {
		var sources = this.#sources;
		for (const key of properties) {
			get(sources[key]);
		}
		return super.href;
	}

	set href(value) {
		super.href = value;
		var sources = this.#sources;
		for (const key of properties) {
			// @ts-ignore
			set(sources[key], super[key]);
		}
		this.#searchParams[REPLACE](super.searchParams);
	}

	get search() {
		return get(this.#sources.search);
	}

	set search(value) {
		super.search = value;
		set(this.#sources.search, super.search);
		this.#searchParams[REPLACE](super.searchParams);
	}

	get origin() {
		var sources = this.#sources;
		get(sources.protocol);
		get(sources.hostname);
		get(sources.port);
		return super.origin;
	}

	get searchParams() {
		return this.#searchParams;
	}

	toString() {
		return this.href;
	}

	toJSON() {
		return this.href;
	}
}
