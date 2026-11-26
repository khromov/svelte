import { flushSync, tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// Mounts with async off, triggers an error boundary in sync mode, then turns async on and verifies
// `pending` snippets both on a newly mounted `<svelte:boundary>` and on resetting the existing one.
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
		const [fail, prepare_reset, show_new, resolve_a, resolve_b] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.equal(async_mode_flag, false);
		assert.htmlEqual(output.innerHTML, '<p>sync: ok</p>');

		// Trigger failed snippet while still in sync mode
		flushSync(() => fail.click());
		assert.htmlEqual(output.innerHTML, '<button class="reset">reset</button>');

		// Enable async mode
		enable_async_mode_flag();

		// 1. Mount a new boundary with a pending snippet
		show_new.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<button class="reset">reset</button><p>new-pending</p>');

		resolve_a.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<button class="reset">reset</button><p>new: A</p>');

		// 2. Reset the pre-existing boundary into async pending content
		flushSync(() => prepare_reset.click());
		/** @type {HTMLElement} */ (target.querySelector('button.reset')).click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>existing-pending</p><p>new: A</p>');

		resolve_b.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>reset: B</p><p>new: A</p>');
	}
});
