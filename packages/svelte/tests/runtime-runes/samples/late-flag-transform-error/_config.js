import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// The app is mounted with `transformError` before async mode is turned on. A `<svelte:boundary>`
// created after that inherits it, and uses it for an `await` that rejects
export default test({
	mode: ['client'],
	compileOptions: { experimental: { async: true } },

	transformError: (error) => `transformed ${error}`,

	before_test() {
		disable_async_mode_flag();
	},

	after_test() {
		if (async_mode) enable_async_mode_flag();
		else disable_async_mode_flag();
	},

	async test({ assert, target }) {
		const [show, reject] = target.querySelectorAll('button');

		enable_async_mode_flag();

		show.click();
		await tick();
		assert.htmlEqual(target.querySelector('p')?.innerHTML ?? '', 'loading');

		reject.click();
		await tick();

		const [output] = target.querySelectorAll('output');
		assert.htmlEqual(output.innerHTML, 'transformed oops');
	}
});
