import { DEV } from 'esm-env';
import { state, increment } from '../internal/client/reactivity/sources.js';
import { tag } from '../internal/client/dev/tracing.js';
import { get } from '../internal/client/runtime.js';
import { get_current_url } from './url.js';

export const REPLACE = Symbol('replace');

var read_methods = ['get', 'getAll', 'has', 'keys', 'forEach', 'toString', 'values', 'entries'];

var inited = false;

/**
 * A reactive version of the built-in [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) object.
 * Reading its contents (by iterating, or by calling `params.get(...)` or `params.getAll(...)` as in the [example](https://svelte.dev/playground/b3926c86c5384bab9f2cf993bc08c1c8) below) in an [effect](https://svelte.dev/docs/svelte/$effect) or [derived](https://svelte.dev/docs/svelte/$derived)
 * will cause it to be re-evaluated as necessary when the params are updated.
 *
 * ```svelte
 * <script>
 * 	import { SvelteURLSearchParams } from 'svelte/reactivity';
 *
 * 	const params = new SvelteURLSearchParams('message=hello');
 *
 * 	let key = $state('key');
 * 	let value = $state('value');
 * </script>
 *
 * <input bind:value={key} />
 * <input bind:value={value} />
 * <button onclick={() => params.append(key, value)}>append</button>
 *
 * <p>?{params.toString()}</p>
 *
 * {#each params as [key, value]}
 * 	<p>{key}: {value}</p>
 * {/each}
 * ```
 */
export class SvelteURLSearchParams extends URLSearchParams {
	#version = DEV ? tag(state(0), 'SvelteURLSearchParams version') : state(0);
	#url = get_current_url();

	#updating = false;

	/**
	 * @param {string[][] | Record<string, string> | string | URLSearchParams} [init]
	 */
	constructor(init) {
		super(init);

		if (!inited) this.#init();
	}

	// We init as part of the first instance so that we can treeshake this class
	#init() {
		inited = true;

		var proto = SvelteURLSearchParams.prototype;
		var search_params_proto = URLSearchParams.prototype;

		for (const method of read_methods) {
			// defined via `Object.defineProperty` so the methods stay non-enumerable,
			// like the class methods they replace
			Object.defineProperty(proto, method, {
				value: function (/** @type {any[]} */ ...args) {
					get(this.#version);
					// @ts-ignore
					return search_params_proto[method].apply(this, args);
				},
				writable: true,
				configurable: true
			});
		}
	}

	#update_url() {
		if (!this.#url || this.#updating) return;
		this.#updating = true;

		const search = this.toString();
		this.#url.search = search && `?${search}`;

		this.#updating = false;
	}

	/**
	 * @param {URLSearchParams} params
	 * @internal
	 */
	[REPLACE](params) {
		if (this.#updating) return;

		// the URL may have changed in a way that leaves the search string untouched —
		// don't rebuild the params or notify readers if nothing changed
		if (params.toString() === super.toString()) return;

		this.#updating = true;

		for (const key of [...super.keys()]) {
			super.delete(key);
		}

		for (const [key, value] of params) {
			super.append(key, value);
		}

		increment(this.#version);
		this.#updating = false;
	}

	/**
	 * @param {string} name
	 * @param {string} value
	 * @returns {void}
	 */
	append(name, value) {
		super.append(name, value);
		this.#update_url();
		increment(this.#version);
	}

	/**
	 * @param {string} name
	 * @param {string=} value
	 * @returns {void}
	 */
	delete(name, value) {
		var has_value = super.has(name, value);
		super.delete(name, value);
		if (has_value) {
			this.#update_url();
			increment(this.#version);
		}
	}

	/**
	 * @param {string} name
	 * @param {string} value
	 * @returns {void}
	 */
	set(name, value) {
		var previous = super.getAll(name);
		super.set(name, value);
		// can't use has(name, value), because for something like https://svelte.dev?foo=1&bar=2&foo=3
		// if you set `foo` to 1, then foo=3 gets deleted whilst `has("foo", "1")` returns true
		var current = super.getAll(name);
		if (previous.length !== current.length || previous.some((value, i) => value !== current[i])) {
			this.#update_url();
			increment(this.#version);
		}
	}

	sort() {
		super.sort();
		this.#update_url();
		increment(this.#version);
	}

	[Symbol.iterator]() {
		return this.entries();
	}

	get size() {
		get(this.#version);
		return super.size;
	}
}
