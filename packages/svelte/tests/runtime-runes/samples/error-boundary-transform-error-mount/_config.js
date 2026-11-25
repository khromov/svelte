import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

let was_enabled = false;

// `<svelte:boundary>` elements inherit the `transformError` passed to `mount`/`hydrate`,
// including those that are created after mounting
export default test({
	mode: ['client', 'hydrate'],

	transformError: (error) => `transformed ${error}`,

	// with `SVELTE_NO_ASYNC`, an earlier sample in this worker may have turned async mode on
	before_test() {
		was_enabled = async_mode_flag;
		if (!async_mode) disable_async_mode_flag();
	},

	after_test() {
		if (was_enabled) enable_async_mode_flag();
	},

	async test({ assert, target }) {
		const [button] = target.querySelectorAll('button');

		button.click();
		await tick();

		const [output] = target.querySelectorAll('output');
		assert.htmlEqual(output.outerHTML, '<output>inner transformed oops</output>');
	}
});
