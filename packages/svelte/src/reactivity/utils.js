/** @import { Source } from '#client' */
import { source, state } from '../internal/client/reactivity/sources.js';
import { update_version } from '../internal/client/runtime.js';

/**
 * If the source is being created inside the same reaction as the reactive collection
 * (e.g. `SvelteMap` or `SvelteSet`) instance, we use `state` so that it will not be a
 * dependency of the reaction. Otherwise we use `source` so it will be.
 *
 * @template T
 * @param {number} instance_update_version - the `update_version` captured when the owning instance was constructed
 * @param {T} value
 * @returns {Source<T>}
 */
export function create_source(instance_update_version, value) {
	return update_version === instance_update_version ? state(value) : source(value);
}
