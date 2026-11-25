import { flushSync, tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

let was_enabled = false;

// An error that is routed through the effect tree (rather than thrown) while a nested app
// (`mount` inside another app) renders for the first time stops at the nested app's root:
// `mount` throws, and boundaries of the app that called `mount` don't see it
export default test({
	mode: ['client'],
	compileOptions: { dev: true },

	// with `SVELTE_NO_ASYNC`, an earlier sample in this worker may have turned async mode on
	before_test() {
		was_enabled = async_mode_flag;
		if (!async_mode) disable_async_mode_flag();
	},

	after_test() {
		if (was_enabled) enable_async_mode_flag();
	},

	async test({ assert, target }) {
		flushSync();
		await tick();

		const [output] = target.querySelectorAll('output');
		assert.htmlEqual(output.innerHTML, 'mount threw inspect');
		assert.equal(target.querySelector('p'), null);
	}
});
