import { flushSync, tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// `$effect.pending()`, `$state`, and `$derived` are mounted and updated while async mode is off;
// async mode then turns on and lazy `await` work holds up the batch and updates `$effect.pending()`.
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
		const [inc, show, resolve] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.equal(async_mode_flag, false);
		assert.htmlEqual(output.innerHTML, '<p>count: 0 doubled: 0 pending: 0</p>');

		// Update on the sync scheduler before async turns on
		flushSync(() => inc.click());
		assert.htmlEqual(output.innerHTML, '<p>count: 1 doubled: 2 pending: 0</p>');

		// Turn async mode on and start async work alongside a state update
		enable_async_mode_flag();
		assert.equal(async_mode_flag, true);

		show.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '<p>count: 1 doubled: 2 pending: 1</p>');

		resolve.click();
		await tick();
		assert.htmlEqual(
			output.innerHTML,
			'<p>count: 2 doubled: 4 pending: 0</p><span>lazy: 42</span>'
		);
	}
});
