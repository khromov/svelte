/** @import { Fork } from 'svelte' */
/** @import { Batch, BatchRecord, Derived, Effect, Reaction, Source, Value } from '#client' */
/** @import { Boundary } from '../dom/blocks/boundary.js' */
import {
	ASYNC,
	BLOCK_EFFECT,
	CLEAN,
	DERIVED,
	DESTROYED,
	DIRTY,
	EAGER_EFFECT,
	INERT,
	MAYBE_DIRTY,
	BOUNDARY_EFFECT
} from '#client/constants';
import { async_mode_flag } from '../../flags/index.js';
import { deferred } from '../../shared/utils.js';
import { DEV } from 'esm-env';
import { invariant } from '../../shared/dev.js';
import * as e from '../errors.js';
import { queue_micro_task } from '../dom/task.js';
import {
	abort_record,
	active_effect,
	is_outdated,
	promote_record,
	prune_edges
} from '../runtime.js';
import { eager_effects, flush_eager_effects } from './sources.js';
import { OBSOLETE } from './deriveds.js';
import { set_signal_status } from './status.js';
import { merge_target } from './async.js';
import {
	add_dirty_effect,
	apply_write,
	create_sync_batch,
	current_batch,
	ensure_batch,
	flushSync,
	in_real_world,
	is_effect_skipped,
	mark_reactions,
	on_batch_commit,
	on_batch_discard,
	reset_branch,
	run_batch_callbacks,
	schedule_effect,
	set_active_batches,
	set_first_batch,
	skips_branch
} from './batch.js';

/** @type {Batch | null} */
let head_batch = null;

/** @type {Batch | null} */
let last_batch = null;

/**
 * Batches whose view of the world changed because another batch committed, and that
 * therefore need to be processed again once the current flush is done (see `commit_batch`)
 * @type {Set<Batch> | null}
 */
let rebases = null;

let uid = 1;

/** @type {number | null} */
let last_processed = null;

/**
 * @param {Batch | null} batch
 */
function update_head(batch) {
	head_batch = batch;
	set_first_batch(batch);
}

/**
 * @param {Batch} batch
 */
function link_batch(batch) {
	if (last_batch === null) {
		update_head(batch);
		last_batch = batch;
	} else {
		last_batch.next = batch;
		batch.prev = last_batch;
		last_batch = batch;
	}
}

const batch_static = {
	ensure: ensure_batch
};

export { batch_static as Batch };

/**
 * Whether async work in `effect` holds up `batch` — or, with `root`, the boundary whose content `root` is.
 * @param {Batch} batch
 * @param {Effect} effect
 * @param {Effect | null} [root]
 */
export function is_batch_blocked_by(batch, effect, root = null) {
	if (!async_mode_flag) return false;

	for (var e = /** @type {Effect | null} */ (effect); e !== null && e !== root; e = e.parent) {
		if (skips_branch(batch, e)) return false;

		if (
			(e.f & (BOUNDARY_EFFECT | DESTROYED)) === BOUNDARY_EFFECT &&
			/** @type {Boundary} */ (e.b).is_pending
		) {
			return false;
		}
	}

	return true;
}

/**
 * @param {Batch} batch
 */
export function discard_async_batch(batch) {
	if (batch.d !== null) {
		run_batch_callbacks(batch, batch.d);
	}

	if (!batch.is_sync) {
		for (const d of batch.async_deriveds.values()) {
			d.reject(OBSOLETE);
		}

		unlink_batch(batch);
	} else {
		batch.linked = false;
	}

	batch.w?.resolve();
}

/**
 * @param {Batch} batch
 */
export function commit_writes(batch) {
	if (!async_mode_flag || batch.is_sync) return;

	commit_batch(batch);
	if (batch.linked && batch.prev !== null) move_to_front(batch);
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function increment_batch(batch, effect) {
	if (!async_mode_flag) return;

	var count = batch.p.get(effect) ?? 0;
	batch.p.set(effect, count + 1);
}

/**
 * @param {Batch} batch
 * @param {Effect} effect
 */
export function decrement_batch(batch, effect) {
	if (!async_mode_flag) return;

	var count = batch.p.get(effect) ?? 0;

	if (count === 1) {
		batch.p.delete(effect);
	} else {
		batch.p.set(effect, count - 1);
	}

	if (batch.q) return;
	batch.q = true;

	queue_micro_task(() => {
		batch.q = false;

		if (batch.linked) {
			batch.flush();
		}
	});
}

/**
 * @param {Batch} batch
 * @param {Reaction} reaction
 * @returns {BatchRecord | undefined}
 */
export function get_batch_record(batch, reaction) {
	var record = batch.records?.get(reaction);
	if (!async_mode_flag || batch.is_sync) return record;

	var i = batch.f.length;

	while (record === undefined && i--) {
		record = batch.f[i].records?.get(reaction);
	}

	return record;
}

/**
 * @param {Batch} batch
 */
export function is_batch_deferred(batch) {
	if (batch.is_sync) return false;
	if (batch.is_fork) return true;

	for (const effect of batch.p.keys()) {
		if (is_batch_blocked_by(batch, effect)) {
			return true;
		}
	}

	return false;
}

/**
 * Runs at the start of `process_step` in async mode: upgrades any sync batch, revalidates
 * if another batch ran in the meantime, and activates the batch's view of the world.
 * @param {Batch} batch
 */
export function pre_process_async(batch) {
	upgrade_batch_if_needed(batch);

	if (batch.started && last_processed !== batch.id) {
		revalidate(batch, batch.current.keys());
	}

	last_processed = batch.id;
	activate_batch(batch);
}

/**
 * Runs after traversal in async mode: handles merge requests, pending deferral, intersecting
 * earlier batches, pending boundaries ready to reveal, and promoting batch records.
 * Returns `{ next: Batch | null }` to short-circuit `process_step`, or `null` to proceed with commit.
 * @param {Batch} batch
 * @param {Effect[]} effects
 * @param {Effect[]} render_effects
 * @param {Boundary[]} revealed_boundaries
 * @param {Effect[]} updates
 * @returns {{ next: Batch | null } | null}
 */
export function before_commit_async(batch, effects, render_effects, revealed_boundaries, updates) {
	upgrade_batch_if_needed(batch);

	if (batch.merge_requests.size > 0) {
		const sorted = Array.from(batch.merge_requests, merge_target)
			.filter((b) => b !== batch && b.linked && !b.is_fork)
			.sort((a, b) => a.id - b.id);
		batch.merge_requests.clear();

		if (sorted.length > 0) {
			defer_effects(batch, render_effects);
			defer_effects(batch, effects);

			/** @type {Batch} */
			var target = batch;
			var i = sorted.length;

			while (i--) {
				var earlier = sorted[i];
				if (earlier === target) continue;
				merge_batches(earlier, target);
				target = earlier;
			}

			return { next: target };
		}
	}

	if (is_batch_deferred(batch)) {
		defer_effects(batch, render_effects);
		defer_effects(batch, effects);

		if (batch.x !== null) {
			for (const e of batch.x) {
				reset_branch(e);
			}
		}

		return {
			next: updates.length > 0 ? /** @type {Batch} */ (current_batch) : null
		};
	}

	const earlier_batch = find_earlier_batch(batch);

	if (earlier_batch !== null) {
		defer_effects(batch, render_effects);
		defer_effects(batch, effects);
		merge_batches(earlier_batch, batch);

		return { next: earlier_batch };
	}

	for (const boundary of revealed_boundaries) {
		if (boundary.is_pending && boundary.is_ready(batch)) {
			boundary.reveal(effects);
		}
	}

	release_records(batch, true);
	return null;
}

/**
 * Runs after effects flush in async mode: unlinks finished batches and commits writes across pending views.
 * @param {Batch} batch
 * @param {Batch | null} next_batch
 */
export function after_commit_async(batch, next_batch) {
	if (batch.is_sync) {
		batch.linked = false;
		return;
	}

	if (batch.p.size === 0 && (batch.s.length === 0 || next_batch !== null)) {
		unlink_batch(batch);
	}

	commit_writes(batch);
}

/**
 * @param {Batch} batch
 */
export function activate_batch(batch) {
	upgrade_batch_if_needed(batch);

	if (last_processed !== batch.id) last_processed = null;

	if (!async_mode_flag) {
		set_active_batches(batch, undefined, batch, null, null);
		return;
	}

	batch.f = [];

	if (!batch.is_fork && batch.prev === null && batch.next === null) {
		set_active_batches(batch, undefined, batch, null, null);
		return;
	}

	var values = new Map(batch.current);
	var cache = new Map();

	for (let b = head_batch; b !== null; b = b.next) {
		if (b === batch || b.is_fork) continue;

		if (b.id < batch.id && intersects(b, batch)) {
			batch.f.push(b);
		} else {
			for (const [source, previous] of b.previous) {
				if (!values.has(source) && ((source.f & DERIVED) !== 0 || !source.equals(previous.v))) {
					values.set(source, previous);
				}
			}
		}
	}

	set_active_batches(batch, undefined, batch, values, cache);
}

/**
 * @param {Batch} batch
 * @param {Iterable<Source>} sources
 */
function revalidate(batch, sources) {
	/** @type {Set<Value>} */
	var values = new Set(sources);

	/** @type {Set<Effect>} */
	var effects = new Set();

	for (const value of values) {
		var reactions = value.reactions;
		if (reactions === null) continue;

		for (const reaction of reactions) {
			var flags = reaction.f;

			if ((flags & DERIVED) !== 0) {
				if ((flags & CLEAN) !== 0) set_signal_status(reaction, MAYBE_DIRTY);
				values.add(/** @type {Derived} */ (reaction));
				continue;
			}

			var effect = /** @type {Effect} */ (reaction);
			if (effects.has(effect)) continue;
			effects.add(effect);

			if ((flags & (EAGER_EFFECT | INERT | DESTROYED)) === 0 && !is_effect_skipped(batch, effect)) {
				schedule_effect(batch, effect, MAYBE_DIRTY);
			}
		}
	}
}

/**
 * @param {Batch} batch
 */
function find_earlier_batch(batch) {
	for (var b = batch.prev; b !== null; b = b.prev) {
		if (!b.is_fork && intersects(b, batch)) return b;
	}

	return null;
}

/**
 * @param {Batch} a
 * @param {Batch} b
 */
function intersects(a, b) {
	for (const source of a.current.keys()) {
		if (b.current.has(source)) return true;
	}

	return false;
}

/**
 * @param {Batch} target
 * @param {Batch} batch
 */
function merge_batches(target, batch) {
	for (const req of batch.merge_requests) target.merge_requests.add(req);
	batch.merge_requests.clear();

	for (const [source, entry] of batch.current) {
		if (!target.previous.has(source)) {
			const previous = batch.previous.get(source);
			if (previous) target.previous.set(source, previous);
		}

		target.current.set(source, entry);
	}

	for (const [effect, d_in] of batch.async_deriveds) {
		const d = target.async_deriveds.get(effect);
		if (d && d !== d_in) d_in.promise.then(d.resolve, d.reject);
		target.async_deriveds.set(effect, d_in);
	}

	for (const [reaction, record] of batch.records ?? []) {
		if ((reaction.f & BLOCK_EFFECT) === 0) {
			var replaced = target.records?.get(reaction);
			(target.records ??= new Map()).set(reaction, record);

			batch.records?.delete(reaction);

			abort_record(reaction, replaced);
		}
	}

	batch.async_deriveds.clear();

	if (batch.p.size > 0) {
		for (const [effect, count] of batch.p) {
			target.p.set(effect, (target.p.get(effect) ?? 0) + count);
		}

		batch.p.clear();
	}

	if (batch.u !== null && batch.u.size > 0) {
		for (const [effect, status] of batch.u) {
			add_dirty_effect(target, effect, status);
		}

		batch.u.clear();
	}

	const discard = () => discard_async_batch(batch);
	on_batch_commit(target, discard);
	on_batch_discard(target, discard);
	batch.merged = target;
	unlink_batch(batch);
}

/**
 * @param {Batch} batch
 * @param {Effect[]} effects
 */
function defer_effects(batch, effects) {
	for (var i = 0; i < effects.length; i += 1) {
		var effect = effects[i];
		var status = effect.f & (DIRTY | MAYBE_DIRTY);

		if (status !== 0) {
			add_dirty_effect(batch, effect, effect.dv === null ? MAYBE_DIRTY : status);
			set_signal_status(effect, CLEAN);
		}
	}
}

/**
 * @param {Batch} self
 */
function commit_batch(self) {
	for (let batch = head_batch; batch !== null; batch = batch.next) {
		if (batch === self) continue;

		var is_earlier = batch.id < self.id;

		/** @type {Source[]} */
		var sources = [];

		for (const [source, entry] of self.current) {
			var own = batch.current.get(source);

			if (own !== undefined) {
				if (is_earlier && entry.v !== own.v && !own.async) {
					batch.current.set(source, entry);
				} else {
					continue;
				}
			}

			sources.push(source);
		}

		if (!batch.started || batch.current.size === 0) continue;

		var obsolete = true;

		for (const source of batch.current.keys()) {
			if (!self.current.has(source)) {
				obsolete = false;
				break;
			}
		}

		if (obsolete && is_earlier) {
			discard_async_batch(batch);
		} else if (sources.length > 0) {
			if (DEV && !batch.q) {
				invariant(batch.s.length === 0, 'Batch has scheduled effects');
			}

			revalidate(batch, sources);
			(rebases ??= new Set()).add(batch);
		}
	}

	self.current.clear();
	self.previous.clear();
}

/**
 * @param {Batch} batch
 * @param {boolean} [commit]
 */
function release_records(batch, commit = false) {
	var records = batch.records;
	if (records === null) return;

	batch.records = null;
	for (const [reaction, record] of records) {
		if ((reaction.f & (DERIVED | DESTROYED)) === 0) {
			var replaced = (reaction.f & ASYNC) !== 0 && is_outdated(record) && !is_outdated(reaction);

			if (commit && !replaced) {
				promote_record(reaction, record);

				if ((reaction.f & ASYNC) !== 0) {
					for (let b = head_batch; b !== null; b = b.next) {
						if (b !== batch && !b.records?.has(reaction)) {
							b.async_deriveds.get(/** @type {Effect} */ (reaction))?.reject(OBSOLETE);
						}
					}
				}
			}

			prune_edges(reaction);
		}

		abort_record(reaction, record);
	}
}

/**
 * @param {Batch} batch
 */
function move_to_front(batch) {
	var prev = /** @type {Batch} */ (batch.prev);
	var first = /** @type {Batch} */ (head_batch);

	prev.next = batch.next;
	if (batch.next === null) last_batch = prev;
	else batch.next.prev = prev;

	batch.prev = null;
	batch.next = first;
	first.prev = batch;
	update_head(batch);
	batch.id = first.id - 1;
}

/**
 * @param {Batch} batch
 */
export function unlink_batch(batch) {
	if (!batch.linked) return;

	if (batch.is_sync) {
		batch.linked = false;
		return;
	}

	var prev = batch.prev;
	var next = batch.next;

	if (prev === null) {
		update_head(next);
	} else {
		prev.next = next;
	}

	if (next === null) {
		last_batch = prev;
	} else {
		next.prev = prev;
	}

	batch.linked = false;
	release_records(batch);
}

export function create_async_batch() {
	return upgrade_batch_if_needed(create_sync_batch());
}

/**
 * Attaches async fields to a sync batch object and links it into the active batch list.
 * Preserves object identity and prototype (no `Object.setPrototypeOf` needed).
 * @param {Batch} batch
 * @returns {Batch}
 */
export function upgrade_batch_if_needed(batch) {
	if (!batch.is_sync) return batch;

	batch.is_sync = false;
	batch.id = uid++;
	batch.async_deriveds = new Map();
	batch.f = [];
	batch.p = new Map();
	batch.merge_requests = new Set();
	batch.q = false;

	link_batch(batch);
	return batch;
}

export function flush_rebases() {
	if (rebases !== null && rebases.size > 0) {
		for (const batch of rebases) {
			rebases.delete(batch);

			if (batch.linked && !batch.q) {
				batch.flush();
			}
		}
	}
}

/**
 * The next batch after `batch` that wrote `source`, if any.
 * @param {Batch} batch
 * @param {Value} source
 */
export function later_writer(batch, source) {
	var later = batch.next;

	while (later !== null && (later.is_fork || !later.current.has(source))) {
		later = later.next;
	}

	return later;
}

/**
 * Creates a 'fork', in which state changes are evaluated but not applied to the DOM.
 * @param {() => void} fn
 * @returns {Fork}
 * @since 5.42
 */
export function fork(fn) {
	if (!async_mode_flag) {
		e.experimental_async_required('fork');
	}

	if (active_effect !== null || current_batch?.is_fork) {
		e.fork_timing();
	}

	var batch = flushSync(() => {
		var b = ensure_batch();
		b.is_fork = true;

		try {
			in_real_world(() => {
				set_active_batches(b, undefined, b, new Map(), new Map());
				fn();
			});
		} catch (error) {
			discard_async_batch(b);
			b.deactivate();
			throw error;
		}

		return b;
	});

	var settled_promise = (batch.w ??= deferred()).promise;
	var committed = false;
	var discarded = false;

	return {
		commit: async () => {
			if (committed) {
				await settled_promise;
				return;
			}

			if (discarded) {
				e.fork_discarded();
			}

			if (!batch.linked) {
				committed = true;
				return;
			}

			committed = true;
			batch.is_fork = false;

			for (const [source, entry] of batch.current) {
				const later = later_writer(batch, source);

				if (later !== null) {
					later.previous.set(source, entry);
				} else {
					mark_reactions(batch, source, MAYBE_DIRTY);
					apply_write(source, entry);
				}
			}

			if (eager_effects.size > 0) {
				flush_eager_effects();
			}

			batch.flush();
			await settled_promise;
		},
		discard: () => {
			if (!committed && batch.linked) {
				discard_async_batch(batch);
			}

			discarded = true;
		}
	};
}

/**
 * Forcibly remove all current batches, to prevent cross-talk between tests
 */
export function clear() {
	update_head(null);
	last_batch = null;
}
