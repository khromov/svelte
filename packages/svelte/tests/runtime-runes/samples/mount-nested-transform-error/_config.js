import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

let was_enabled = false;

// A nested app (`mount` inside another app) without a `transformError` of its own (`undefined`
// or `null`) inherits that of the app it is mounted in; its own takes precedence
export default test({
	mode: ['client'],

	transformError: (error) => `outer ${error}`,

	// with `SVELTE_NO_ASYNC`, an earlier sample in this worker may have turned async mode on
	before_test() {
		was_enabled = async_mode_flag;
		if (!async_mode) disable_async_mode_flag();
	},

	after_test() {
		if (was_enabled) enable_async_mode_flag();
	},

	async test({ assert, target }) {
		await tick();
		await tick();

		const outputs = [...target.querySelectorAll('output')].map((output) => output.innerHTML);
		assert.deepEqual(outputs, ['outer oops', 'outer oops', 'inner oops']);
	}
});
