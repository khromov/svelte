/** @import { BatchValue, Derived, DerivedRecord, Effect, Reaction, Source, Value } from '#client' */
/** @import { Boundary } from '../dom/blocks/boundary.js' */
import {
	BLOCK_EFFECT,
	BRANCH_EFFECT,
	CLEAN,
	DESTROYED,
	DIRTY,
	EFFECT,
	INERT,
	RENDER_EFFECT,
	ROOT_EFFECT,
	MAYBE_DIRTY,
	DERIVED,
	EAGER_EFFECT,
	ERROR_VALUE,
	MANAGED_EFFECT,
	REACTION_RAN,
	DESTROYING,
	EFFECT_OFFSCREEN,
	ASSIGNED,
	ASYNC,
	REACTION_IS_UPDATING,
	BOUNDARY_EFFECT
} from '#client/constants';
import { async_mode_flag, custom_renderers_flag } from '../../flags/index.js';
import { deferred, define_property } from '../../shared/utils.js';
import {
	active_effect,
	active_reaction,
	get,
	increment_write_version,
	is_destroying_effect,
	is_dirty,
	untrack,
	update_effect,
	write_version
} from '../runtime.js';
import * as e from '../errors.js';
import { flush_tasks, queue_micro_task } from '../dom/task.js';
import { DEV } from 'esm-env';
import { invoke_error_boundary } from '../error-handling.js';
import {
	eager_effects,
	eager_effects_deferred,
	flush_eager_effects,
	source,
	update
} from './sources.js';
import { eager_effect, teardown, unlink_effect } from './effects.js';
import { UNINITIALIZED } from '../../../constants.js';
import { set_signal_status, update_derived_status } from './status.js';
import { is_runes } from '../context.js';
import {
	after_commit_async,
	Batch,
	before_commit_async,
	clear,
	create_async_batch,
	flush_rebases,
	fork,
	is_batch_deferred,
	later_writer,
	pre_process_async,
	unlink_batch,
	upgrade_batch_if_needed
} from './batch-async.js';

export { Batch, clear, fork };

/** @type {Batch | null} */
export let first_batch = null;

/** @param {Batch | null} batch */
export function set_first_batch(batch) {
	first_batch = batch;
}

/** @type {Batch | null} */
export let current_batch = null;

/**
 * The batch currently being processed
 * @type {Batch | null}
 */
export let processing_batch = null;

/**
 * @typedef {Object} TeardownContext
 * @property {Map<Value, BatchValue>} reverted_values What teardowns see instead of the values sources hold
 * @property {Map<Derived, BatchValue>} derived_cache The values of deriveds in this view, until it changes
 * @property {TeardownContext | null} parent The context to restore after a nested flush or eager block
 */

/**
 * Effect teardowns revert the writes that caused them (see `runtime.js#teardown_view`).
 * @type {TeardownContext | null}
 */
export let teardown_context = null;

/** @param {TeardownContext | null} context */
export function set_teardown_context(context) {
	teardown_context = context;
}

/** @param {Map<Value, BatchValue>} [values] */
export function push_teardown_context(values) {
	var context = (teardown_context = {
		reverted_values: new Map(teardown_context?.reverted_values),
		derived_cache: new Map(),
		parent: teardown_context
	});

	for (const [source, value] of values ?? []) context.reverted_values.set(source, value);

	return context;
}

/**
 * A write in a teardown remains visible after returning to an enclosing teardown view,
 * and the deriveds that teardowns evaluated may depend on it
 * @param {Value} source
 */
export function teardown_write(source) {
	for (var context = teardown_context; context !== null; context = context.parent) {
		context.reverted_values.delete(source);
		context.derived_cache.clear();
	}
}

/**
 * @type {Map<Value, BatchValue> | null}
 */
export let batch_values = null;

/**
 * @type {Map<Derived, Derived | DerivedRecord | BatchValue> | null}
 */
export let view_cache = null;

/**
 * @type {Batch | null}
 */
export let view_batch = null;

/**
 * @param {Batch | null} current
 * @param {Batch | null} [processing]
 * @param {Batch | null} [view]
 * @param {Map<Value, BatchValue> | null} [values]
 * @param {Map<Derived, Derived | DerivedRecord | BatchValue> | null} [cache]
 */
export function set_active_batches(current, processing, view, values, cache) {
	current_batch = current;
	if (processing !== undefined) processing_batch = processing;
	if (view !== undefined) view_batch = view;
	if (values !== undefined) batch_values = values;
	if (cache !== undefined) view_cache = cache;
}

export function deactivate_batch() {
	current_batch = processing_batch = batch_values = view_cache = view_batch = null;
}

/** @type {Effect | null} */
let last_scheduled_effect = null;

export let is_flushing_sync = false;

/**
 * @type {Effect[] | null}
 */
export let collected_effects = null;

/**
 * @type {Effect[] | null}
 * @deprecated when we get rid of legacy mode and stores, we can get rid of this
 */
export let legacy_updates = null;

var flush_count = 0;

/** Sources whose DEV update counts and stack traces need resetting after the flush. @type {Set<Value>} */
export const source_stacks = new Set();

/** @type {Set<any> | null} */
var seen = null;
var count_deps = 0;

const sync_batch_proto = {
	flush() {
		batch_flush(/** @type {Batch} */ (/** @type {unknown} */ (this)));
	},
	deactivate: deactivate_batch,
	discard() {
		discard_sync_batch(/** @type {Batch} */ (/** @type {unknown} */ (this)));
	}
};

/**
 * Creates a lightweight synchronous batch object without multi-batch/async allocations.
 * @returns {Batch}
 */
function create_sync_batch() {
	var batch = Object.create(sync_batch_proto);
	batch.is_sync = true;
	batch.started = false;
	batch.linked = true;
	batch.is_fork = false;
	batch.merged = null;
	batch.prev = null;
	batch.next = null;
	batch.current = new Map();
	batch.previous = new Map();
	batch.records = null;
	batch.s = [];
	batch.u = null;
	batch.x = null;
	batch.y = null;
	batch.c = null;
	batch.d = null;
	batch.w = null;
	return batch;
}

/** @param {Batch} batch */
function discard_sync_batch(batch) {
	if (batch.d !== null) {
		run_batch_callbacks(batch, batch.d);
	}

	batch.linked = false;
	batch.w?.resolve();
}

/** @param {Batch} batch */
export function batch_flush(batch) {
	var context = push_teardown_context(batch.previous);

	try {
		/** @type {Batch | null} */
		var next = batch;

		while (next !== null) {
			next = process_step(next);
		}

		if (async_mode_flag) {
			flush_rebases();
		}
	} finally {
		flush_count = 0;
		last_scheduled_effect = null;
		collected_effects = null;
		legacy_updates = null;

		teardown_context = context.parent;
		deactivate_batch();

		if (DEV) {
			for (const source of source_stacks) {
				source.updated = null;
			}

			source_stacks.clear();
		}
	}
}

/**
 * Processes `batch` and returns the batch that needs to be processed next, if any.
 * Shared between sync and async modes; async-only steps are gated on `async_mode_flag`
 * so bundlers strip them completely from non-async apps while keeping a single scheduler loop.
 * @param {Batch} batch
 * @returns {Batch | null}
 */
function process_step(batch) {
	current_batch = processing_batch = view_batch = batch;

	teardown_context?.derived_cache.clear();

	if (async_mode_flag) {
		pre_process_async(batch);
	}

	batch.started = true;

	if (batch.u !== null && batch.u.size > 0) {
		for (const [e, status] of batch.u) add_scheduled_effect(batch, e, status);
		batch.u.clear();
	}

	if (DEV) {
		for (const value of batch.current.keys()) {
			source_stacks.add(value);
		}
	}

	/** @type {Effect[]} */
	var effects = (collected_effects = []);

	/** @type {Effect[] | null} */
	var render_effects = async_mode_flag ? [] : null;

	/** @type {Boundary[] | null} */
	var revealed_boundaries = async_mode_flag ? [] : null;

	/** @type {Effect[]} */
	var updates = (legacy_updates = []);

	while (batch.s.length > 0) {
		if (flush_count++ > 1000) {
			if (async_mode_flag) {
				unlink_batch(batch);
			} else {
				batch.linked = false;
			}

			infinite_loop_guard();
		}

		for (const root of resolve_roots(batch)) {
			try {
				traverse_batch(batch, root, effects, render_effects, revealed_boundaries);
			} catch (err) {
				reset_branch(root, true);
				if (async_mode_flag) {
					if (!is_batch_deferred(batch)) batch.discard();
				} else {
					discard_sync_batch(batch);
				}
				throw err;
			}
		}

		if (batch.s.length > 0) {
			if (async_mode_flag) {
				for (const effect of /** @type {Effect[]} */ (render_effects)) batch.s.push(effect);
				/** @type {Effect[]} */ (render_effects).length = 0;
			}

			for (const effect of effects) batch.s.push(effect);
			effects.length = 0;
		}
	}

	current_batch = null;

	if (updates.length > 0) {
		var updated_batch = ensure_batch();
		for (const e of updates) {
			if ((e.f & CLEAN) === 0) schedule_effect(updated_batch, e, MAYBE_DIRTY);
		}
	}

	collected_effects = null;
	legacy_updates = null;

	if (async_mode_flag) {
		var redirect = before_commit_async(
			batch,
			effects,
			/** @type {Effect[]} */ (render_effects),
			/** @type {Boundary[]} */ (revealed_boundaries),
			updates
		);
		if (redirect !== null) {
			return redirect.next;
		}
	}

	if (batch.c !== null) {
		run_batch_callbacks(batch, batch.c);
	}

	var was_flushing_effects = is_flushing_effects;
	var previous_captured_writes = captured_writes;

	try {
		is_flushing_effects = true;

		var earlier_writes = async_mode_flag
			? flush_queued_effects(/** @type {Effect[]} */ (render_effects))
			: null;

		if (custom_renderers_flag && before_effects !== null) {
			before_effects();
		}

		flush_queued_effects(effects, earlier_writes);
	} finally {
		is_flushing_effects = was_flushing_effects;
		captured_writes = previous_captured_writes;
	}

	batch.w?.resolve();

	var next_batch = /** @type {Batch | null} */ (/** @type {unknown} */ (current_batch));

	if (async_mode_flag) {
		after_commit_async(batch, next_batch);
	} else {
		batch.linked = false;
	}

	if (next_batch !== null && teardown_context !== null) {
		for (const [source, snapshot] of teardown_context.reverted_values) {
			if (next_batch.previous.get(source)?.wv !== snapshot.wv) {
				teardown_context.reverted_values.delete(source);
			}
		}
	}

	return next_batch;
}

/**
 * Ensures an active batch exists, scheduling a microtask flush if needed.
 * @returns {Batch}
 */
export function ensure_batch() {
	if (current_batch === null) {
		const batch = (current_batch = async_mode_flag ? create_async_batch() : create_sync_batch());

		if (processing_batch === null && !is_flushing_sync) {
			queue_micro_task(() => {
				if (!batch.started) {
					batch.flush();
				}
			});
		}
	} else if (async_mode_flag) {
		upgrade_batch_if_needed(current_batch);
	}

	return current_batch;
}

/**
 * @param {Batch} batch
 */
export function batch_settled(batch) {
	return (batch.w ??= deferred()).promise;
}

/**
 * Whether `effect` is a branch that `batch` skips, or that only exists offscreen for other batches
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function skips_branch(batch, effect) {
	return (
		(batch.x !== null && batch.x.has(effect)) ||
		((effect.f & EFFECT_OFFSCREEN) !== 0 && (batch.y === null || !batch.y.has(effect)))
	);
}

/**
 * Whether `effect` is inside a branch that `batch` skips
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function is_effect_skipped(batch, effect) {
	for (var e = /** @type {Effect | null} */ (effect); e !== null; e = e.parent) {
		if (skips_branch(batch, e)) return true;
	}

	return false;
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function skip_effect(batch, effect) {
	(batch.x ??= new Set()).add(effect);
	batch.y?.delete(effect);
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function unskip_effect(batch, effect) {
	if (
		(batch.x !== null && batch.x.delete(effect)) ||
		((batch.y === null || !batch.y.has(effect)) &&
			((effect.f & EFFECT_OFFSCREEN) !== 0 ||
				(async_mode_flag
					? !batch.is_sync && batch.f.some((b) => b.x !== null && b.x.has(effect))
					: false)))
	) {
		revalidate_branch(batch, effect);
	}

	(batch.y ??= new Set()).add(effect);
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function unskip_new_effect(batch, effect) {
	(batch.y ??= new Set()).add(effect);
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function revalidate_branch(batch, effect) {
	for (var e = effect.first; e !== null; e = e.next) {
		var flags = e.f;

		if ((flags & (DESTROYED | INERT)) === 0 && !skips_branch(batch, e)) {
			if ((flags & (BRANCH_EFFECT | ROOT_EFFECT | EAGER_EFFECT)) === 0 && e.fn !== null) {
				schedule_effect(batch, e, MAYBE_DIRTY);
			}

			revalidate_branch(batch, e);
		}
	}
}

/**
 * @param {Batch} batch
 * @param {(batch: Batch) => void} fn
 */
export function on_batch_commit(batch, fn) {
	(batch.c ??= new Map()).set(fn, eager_block_writes?.size ? eager_block_writes : null);
}

/**
 * @param {Batch} batch
 * @param {(batch: Batch) => void} fn
 */
export function on_batch_discard(batch, fn) {
	(batch.d ??= new Map()).set(fn, eager_block_writes?.size ? eager_block_writes : null);
}

/**
 * @param {Batch} batch
 * @param {Map<(batch: Batch) => void, Map<Value, BatchValue> | null>} callbacks
 */
export function run_batch_callbacks(batch, callbacks) {
	untrack(() => {
		for (const [fn, writes] of callbacks) {
			if (writes === null) {
				fn(batch);
				continue;
			}

			var context = push_teardown_context();

			for (const [source, write] of writes) {
				if (context.reverted_values.has(source)) context.reverted_values.set(source, write);
			}

			try {
				fn(batch);
			} finally {
				teardown_context = context.parent;
			}
		}
	});

	callbacks.clear();
}

/**
 * @param {Batch} batch
 * @returns {Effect[]}
 */
function resolve_roots(batch) {
	/** @type {Effect[]} */
	var roots = [];

	for (const effect of batch.s) {
		if ((effect.f & DESTROYED) !== 0 || (effect.f & (DIRTY | MAYBE_DIRTY)) === 0) continue;

		var e = effect;
		var covered = false;

		while (e.parent !== null) {
			e = e.parent;
			var flags = e.f;

			if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
				if ((flags & CLEAN) === 0) {
					covered = true;
					break;
				}

				e.f ^= CLEAN;
			}
		}

		if (!covered) {
			roots.push(e);
		}
	}

	batch.s = [];

	return roots;
}

/**
 * @param {Batch} batch
 * @param {Effect} root
 * @param {Effect[]} effects
 * @param {Effect[] | null} render_effects
 * @param {Boundary[] | null} revealed_boundaries
 */
function traverse_batch(batch, root, effects, render_effects, revealed_boundaries) {
	root.f ^= CLEAN;

	var effect = root.first;

	while (effect !== null) {
		var flags = effect.f;
		var is_branch = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
		var is_skippable_branch = is_branch && (flags & CLEAN) !== 0;

		var skip =
			is_skippable_branch || (flags & (INERT | EAGER_EFFECT)) !== 0 || skips_branch(batch, effect);

		if (!skip && effect.fn !== null) {
			if (is_branch) {
				effect.f ^= CLEAN;
			} else if ((flags & EFFECT) !== 0) {
				effects.push(effect);
			} else if (async_mode_flag ? (flags & (RENDER_EFFECT | MANAGED_EFFECT)) !== 0 : false) {
				/** @type {Effect[]} */ (render_effects).push(effect);
			} else if (is_dirty(effect)) {
				update_effect(effect);
			}

			var child = effect.first;

			if (child !== null) {
				effect = child;
				continue;
			}
		}

		while (effect !== null) {
			if (async_mode_flag) {
				if ((effect.f & (BOUNDARY_EFFECT | DESTROYED)) === BOUNDARY_EFFECT) {
					var boundary = /** @type {Boundary} */ (effect.b);

					if (boundary.is_pending && boundary.is_ready(batch)) {
						/** @type {Boundary[]} */ (revealed_boundaries).push(boundary);
					}
				}
			}

			var next = effect.next;

			if (next !== null) {
				effect = next;
				break;
			}

			effect = effect.parent;
		}
	}
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 * @param {number} status
 */
export function add_dirty_effect(batch, effect, status) {
	var map = (batch.u ??= new Map());
	if (status === DIRTY || map.get(effect) !== DIRTY) {
		map.set(effect, status);
	}
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 * @param {number} status
 */
function add_scheduled_effect(batch, effect, status) {
	if ((effect.f & DIRTY) === 0) {
		set_signal_status(effect, status);
	}

	batch.s.push(effect);
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 * @param {number} status DIRTY or MAYBE_DIRTY
 */
export function schedule_effect(batch, effect, status) {
	last_scheduled_effect = effect;

	if (view_batch !== null && view_batch !== batch && effect !== active_reaction) {
		add_dirty_effect(batch, effect, (effect.f & REACTION_IS_UPDATING) !== 0 ? status : MAYBE_DIRTY);
		return;
	}

	if (processing_batch !== batch && active_reaction === null) {
		if (async_mode_flag ? batch.prev !== null || batch.next !== null || batch.is_fork : false) {
			add_dirty_effect(batch, effect, MAYBE_DIRTY);
			return;
		}

		status = MAYBE_DIRTY;
	}

	add_scheduled_effect(batch, effect, status);
}

/**
 * @param {Batch} batch
 * @param {Value} source
 * @param {any} value
 * @param {boolean} same
 * @param {boolean} [error]
 * @param {Effect[] | null} [updated_during_traversal]
 */
export function capture_signal(
	batch,
	source,
	value,
	same,
	error = false,
	updated_during_traversal = null
) {
	var previous = batch.previous.get(source);
	var later = async_mode_flag ? later_writer(batch, source) : null;

	if (previous === undefined) {
		if (async_mode_flag) {
			if (later !== null) {
				previous = later.previous.get(source);
			}
		}

		if (previous === undefined && source.v !== UNINITIALIZED) {
			previous = {
				v: source.v,
				wv: source.wv,
				e: (source.f & ERROR_VALUE) !== 0,
				assigned: (source.f & ASSIGNED) !== 0
			};
		}

		if (previous !== undefined) batch.previous.set(source, previous);
	}

	if (is_destroying_effect) {
		teardown_write(source);
	} else if (previous !== undefined && teardown_context !== null) {
		teardown_context.reverted_values.set(source, previous);
		teardown_context.derived_cache.clear();
	}

	/** @type {BatchValue} */
	var entry = {
		v: value,
		wv: same ? source.wv : increment_write_version(),
		e: error,
		assigned: (source.f & DERIVED) !== 0,
		async: (source.f & ASYNC) !== 0
	};

	batch.current.set(source, entry);

	if (is_flushing_effects) {
		(captured_writes ??= new Set()).add(source);
	}

	if (async_mode_flag) {
		batch_values?.set(source, entry);
		view_cache?.delete(/** @type {Derived} */ (source));
		if (!batch.is_fork && later !== null) later.previous.set(source, entry);
	}

	if ((async_mode_flag ? !batch.is_fork && later === null : true) && !same) {
		apply_write(source, entry);
	}

	if (!same) {
		seen = null;
		count_deps = 0;
		mark_reactions(batch, source, DIRTY, updated_during_traversal);
		seen = null;

		if (eager_effects.size > 0 && !eager_effects_deferred) {
			flush_eager_effects();
		}
	}
}

/**
 * @param {Batch} batch
 * @param {Value} signal
 * @param {number} status should be DIRTY or MAYBE_DIRTY
 * @param {Effect[] | null} [updated_during_traversal]
 * @returns {void}
 */
export function mark_reactions(batch, signal, status, updated_during_traversal = null) {
	var reactions = signal.reactions;
	if (reactions === null) return;

	var runes = is_runes();
	var length = reactions.length;

	count_deps += length;
	if (count_deps > 100000 && seen === null) seen = new Set();

	if (seen !== null) {
		if (seen.has(signal)) return;
		seen.add(signal);
	}

	for (var i = 0; i < length; i++) {
		var reaction = reactions[i];
		var flags = reaction.f;

		if (!runes && reaction === active_effect) continue;

		var not_dirty = (flags & DIRTY) === 0;

		if ((flags & EAGER_EFFECT) !== 0) {
			if (!batch.is_fork) {
				if (not_dirty) {
					set_signal_status(reaction, status);
				}

				eager_effects.add(/** @type {Effect} */ (reaction));
			}
		} else if ((flags & DERIVED) !== 0) {
			if (not_dirty) {
				set_signal_status(reaction, status);
			}

			var derived = /** @type {Derived} */ (reaction);

			if (async_mode_flag) {
				view_cache?.delete(derived);
			}
			mark_reactions(batch, derived, MAYBE_DIRTY, updated_during_traversal);
		} else if (not_dirty) {
			var effect = /** @type {Effect} */ (reaction);

			if ((flags & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
				set_signal_status(effect, status);
				eager_block_effects.add(effect);
			}

			if (updated_during_traversal !== null) {
				set_signal_status(effect, status);
				updated_during_traversal.push(effect);
			} else {
				schedule_effect(batch, effect, status);
			}
		}
	}
}

/** @type {(() => void) | null} */
let before_effects = null;

/**
 * @param {(() => void) | null} fn
 */
export function set_before_effects(fn) {
	before_effects = fn;
}

/**
 * Synchronously flush any pending updates.
 * @template [T=void]
 * @param {(() => T) | undefined} [fn]
 * @returns {T}
 */
export function flushSync(fn) {
	var was_flushing_sync = is_flushing_sync;
	var previous_view_batch = view_batch !== current_batch ? view_batch : null;
	is_flushing_sync = true;

	try {
		var result;

		if (fn) {
			flushSync();

			result = fn();
		}

		while (true) {
			flush_tasks();

			if (current_batch === null) {
				return /** @type {T} */ (result);
			}

			current_batch.flush();
		}
	} finally {
		is_flushing_sync = was_flushing_sync;
		view_batch = previous_view_batch;
	}
}

function infinite_loop_guard() {
	if (DEV) {
		var updates = new Map();

		for (const source of /** @type {Batch} */ (current_batch).current.keys()) {
			for (const [stack, update] of source.updated ?? []) {
				var entry = updates.get(stack);

				if (!entry) {
					entry = { error: update.error, count: 0 };
					updates.set(stack, entry);
				}

				entry.count += update.count;
			}
		}

		for (const update of updates.values()) {
			if (update.error) {
				// eslint-disable-next-line no-console
				console.error(update.error);
			}
		}
	}

	try {
		e.effect_update_depth_exceeded();
	} catch (error) {
		if (DEV) {
			define_property(error, 'stack', { value: '' });
		}

		invoke_error_boundary(error, last_scheduled_effect);
	}
}

var is_flushing_effects = false;

/**
 * @type {Set<Value> | null}
 */
var captured_writes = null;

/** @type {Set<Effect> | null} */
export let eager_block_effects = null;

/**
 * @type {Map<Value, BatchValue> | null}
 */
export let eager_block_writes = null;

/**
 * @param {Effect} effect
 * @returns {boolean}
 */
function defer_if_pending(effect) {
	if ((effect.f & (EFFECT | REACTION_RAN)) !== EFFECT) return false;

	for (var boundary = effect.b; boundary !== null; boundary = boundary.parent) {
		if (boundary.is_pending) {
			boundary.defer_effect(effect);
			return true;
		}
	}

	return false;
}

/**
 * @param {Array<Effect>} effects
 * @param {Map<Value, BatchValue> | null} [earlier_writes]
 * @returns {Map<Value, BatchValue> | null}
 */
function flush_queued_effects(effects, earlier_writes = null) {
	var length = effects.length;
	if (length === 0) return earlier_writes;

	var i = 0;

	while (i < length) {
		var effect = effects[i++];

		if (
			(effect.f & (DESTROYED | INERT)) === 0 &&
			!(current_batch !== null && is_effect_skipped(current_batch, effect)) &&
			!(async_mode_flag ? defer_if_pending(effect) : false) &&
			is_dirty(effect)
		) {
			eager_block_effects = new Set();

			var version = write_version;
			update_effect(effect);

			if (
				effect.edges === null &&
				effect.first === null &&
				effect.nodes === null &&
				effect.teardown === null &&
				effect.ac === null
			) {
				unlink_effect(effect);
			}

			if (eager_block_effects?.size > 0) {
				var previous_teardown_context = teardown_context;

				if (earlier_writes !== null) push_teardown_context(earlier_writes);

				var previous_eager_block_writes = eager_block_writes;
				eager_block_writes = new Map(earlier_writes);

				try {
					for (const e of eager_block_effects) {
						if (
							(e.f & (DESTROYED | INERT)) !== 0 ||
							(current_batch !== null && is_effect_skipped(current_batch, e))
						) {
							continue;
						}

						/** @type {Effect[]} */
						const ordered_effects = [e];
						let ancestor = e.parent;
						while (ancestor !== null) {
							if (eager_block_effects.has(ancestor)) {
								eager_block_effects.delete(ancestor);
								ordered_effects.push(ancestor);
							}
							ancestor = ancestor.parent;
						}

						for (let j = ordered_effects.length - 1; j >= 0; j--) {
							const e = ordered_effects[j];
							if (
								(e.f & (DESTROYED | INERT)) !== 0 ||
								(current_batch !== null && is_effect_skipped(current_batch, e))
							) {
								continue;
							}
							update_effect(e);
						}
					}
				} finally {
					eager_block_writes = previous_eager_block_writes;
					eager_block_effects?.clear();
					teardown_context = previous_teardown_context;
				}
			}

			if (write_version !== version && current_batch !== null && captured_writes !== null) {
				for (const value of captured_writes) {
					var write = current_batch.current.get(value);
					if (write !== undefined && write.wv > version) {
						(earlier_writes ??= new Map()).set(value, write);
					}
				}
			}
		}

		captured_writes?.clear();
	}

	eager_block_effects = null;
	return earlier_writes;
}

/**
 * @param {Value} source
 * @param {BatchValue} entry
 */
export function apply_write(source, entry) {
	source.v = entry.v;
	source.wv = entry.wv;
	source.f = entry.e ? source.f | ERROR_VALUE : source.f & ~ERROR_VALUE;

	if ((source.f & DERIVED) !== 0) {
		source.f |= ASSIGNED;
		update_derived_status(/** @type {Derived} */ (source));
	}
}

/** @type {Source<number>[]} */
let eager_versions = [];

function eager_flush() {
	flushSync(() => {
		const eager = eager_versions;
		eager_versions = [];
		for (const version of eager) {
			update(version);
		}
	});
}

/** @type {Map<Reaction, Source<number>> | null} */
let version_map = null;

/**
 * Implementation of `$state.eager(fn())`
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function eager(fn) {
	var initial = true;
	var value = /** @type {T} */ (undefined);

	if (active_reaction === null) {
		return fn();
	}

	let parent = active_reaction;
	let map = (version_map ??= new Map());

	let version = map.get(parent) ?? source(0);
	map.set(parent, version);

	if (DEV) {
		version.label ??= '$state.eager version';
	}

	teardown(() => {
		if (parent.f & DESTROYING) map.delete(parent);
	});

	get(version);

	const run = () => {
		eager_effect(() => {
			if (initial) {
				value = fn();
				return;
			}

			if (eager_versions.length === 0) {
				queue_micro_task(eager_flush);
			}

			eager_versions.push(version);
		});
	};

	if (async_mode_flag) {
		in_real_world(run);
	} else {
		run();
	}

	initial = false;

	return value;
}

/**
 * Run `fn` with the real world (i.e. the latest values) as the active view, regardless of which batch is active
 * @param {() => void} fn
 */
export function in_real_world(fn) {
	var previous_batch_values = batch_values;
	var previous_view_cache = view_cache;
	var previous_view_batch = view_batch;

	batch_values = view_cache = view_batch = null;

	try {
		fn();
	} finally {
		batch_values = previous_batch_values;
		view_cache = previous_view_cache;
		view_batch = previous_view_batch;
	}
}

/**
 * @param {Effect} effect
 * @param {boolean} force
 */
export function reset_branch(effect, force = false) {
	if (!force && (effect.f & BRANCH_EFFECT) !== 0 && (effect.f & CLEAN) !== 0) {
		return;
	}

	set_signal_status(effect, CLEAN);

	var e = effect.first;
	while (e !== null) {
		reset_branch(e, force);
		e = e.next;
	}
}
