import { flushSync, tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// Turns async mode on *inside* a synchronous flush in progress (inside a user `$effect` that also
// triggers mounting an async `{await}` block in the follow-up pass), verifying mid-flush hand-over.
export default test({
	mode: ['client'],
	compileOptions: { experimental: { async: true } },

	get props() {
		return { enable: enable_async_mode_flag };
	},

	before_test() {
		disable_async_mode_flag();
	},

	after_test() {
		if (async_mode) enable_async_mode_flag();
		else disable_async_mode_flag();
	},

	async test({ assert, target }) {
		const [trigger, resolve] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.equal(async_mode_flag, false);
		assert.htmlEqual(output.innerHTML, '<p>step:0</p>');

		// Clicking `trigger` flushes synchronously: the sync traversal updates `step` to 1, then during
		// `flush_queued_effects` the `$effect` enables async mode and sets `load = true` for `next_batch`.
		flushSync(() => {
			trigger.click();
		});

		assert.equal(async_mode_flag, true);
		assert.htmlEqual(output.innerHTML, '<p>step:1</p>');

		resolve.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>step:1</p><span>loaded</span>');
	}
});
