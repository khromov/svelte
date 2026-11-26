/** @import { BatchValue, Derived, DerivedRecord, Value } from '#client' */

// Only `experimental.async` ever sets these. They are declared without a value, in a module
// that imports nothing, so that bundlers can tell that they are always `undefined` otherwise
// (a declaration that comes after the code that reads it, or assigns something, is not folded)

/**
 * When time travelling (i.e. working in one batch, while other batches
 * still have ongoing work), we ignore the real values of affected
 * signals in favour of their values within the batch — along with their
 * versions: the batch's writes, and the values from before the writes of
 * other batches, which its view of the world undoes (see `Batch#activate`).
 * `undefined` means that the real world (i.e. the latest values) applies.
 * Doesn't contain computed deriveds, these are in {@link view_cache}.
 * @type {Map<Value, BatchValue> | undefined}
 */
export let batch_values;

/**
 * The values of deriveds in the active view of the world, for as long as it is active (see `get_view`):
 * a record of a run (in which case `e` tells whether its value is an error), the derived itself if its
 * global state applies, or the write to it that holds (an assignment). Exists whenever `batch_values` does
 * @type {Map<Derived, Derived | DerivedRecord | BatchValue> | undefined}
 */
export let view_cache;

/**
 * @param {Map<Value, BatchValue>} [values]
 * @param {Map<Derived, Derived | DerivedRecord | BatchValue>} [cache]
 */
export function set_view(values, cache) {
	batch_values = values;
	view_cache = cache;
}
