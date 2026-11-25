import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// The app is mounted before async mode is turned on (e.g. by a lazily loaded component that uses
// `await`). `$effect.pending()` outside any `<svelte:boundary>`, read before that, sees the work
export default test({
	mode: ['client', 'hydrate'],
	compileOptions: { experimental: { async: true } },

	before_test() {
		disable_async_mode_flag();
	},

	after_test() {
		if (async_mode) enable_async_mode_flag();
		else disable_async_mode_flag();
	},

	async test({ assert, target }) {
		const [show, resolve] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		enable_async_mode_flag();

		show.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '1');
		assert.equal(target.querySelector('p'), null);

		resolve.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '0');
		assert.htmlEqual(target.querySelector('p')?.innerHTML ?? '', '42');
	}
});
