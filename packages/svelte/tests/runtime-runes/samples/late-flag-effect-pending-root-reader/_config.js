import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// The app is mounted before async mode is turned on. `$effect.pending()` outside any
// `<svelte:boundary>`, read for the first time while an `await` is pending, sees it
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
		const [show, reader, resolve] = target.querySelectorAll('button');

		enable_async_mode_flag();

		show.click();
		await tick();
		reader.click();
		await tick();

		const [output] = target.querySelectorAll('output');
		assert.htmlEqual(output.innerHTML, '1');

		resolve.click();
		await tick();
		assert.htmlEqual(output.innerHTML, '0');
		assert.htmlEqual(target.querySelector('p')?.innerHTML ?? '', '42');
	}
});
