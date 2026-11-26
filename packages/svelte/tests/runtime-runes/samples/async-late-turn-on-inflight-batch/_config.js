import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import { current_batch } from '../../../../src/internal/client/reactivity/batch.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// Schedules a write into a sync batch (without flushing), turns async mode on in the same
// synchronous turn, and starts async work in that same batch — verifying in-place batch upgrade,
// deferral, and preservation of `previous` values for effect teardowns.
export default test({
	mode: ['client'],
	compileOptions: { experimental: { async: true } },

	before_test() {
		disable_async_mode_flag();
	},

	after_test() {
		if (async_mode) enable_async_mode_flag();
		else disable_async_mode_flag();
	},

	async test({ assert, target }) {
		const [write_sync, show_async, resolve] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.equal(async_mode_flag, false);
		assert.htmlEqual(output.innerHTML, '<p>count:0 teardown:none</p>');

		// 1. Write while async is OFF — creates an un-flushed sync batch (`is_sync === true`)
		write_sync.click();
		assert.equal(current_batch?.is_sync, true);

		// 2. Turn async ON synchronously before the microtask flushes, then write `show = true`
		enable_async_mode_flag();
		show_async.click();
		assert.equal(current_batch?.is_sync, false);

		// 3. Flush microtasks: `{await promise}` holds up the upgraded batch, so DOM stays at 0
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>count:0 teardown:none</p>');

		// 4. Resolve promise: batch commits, effect teardown sees reverted `count = 0`, then teardown's
		// own write (`teardown:was:0`) flushes in the follow-up batch.
		resolve.click();
		await tick();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>count:1 teardown:was:0</p><span>done</span>');
	}
});
