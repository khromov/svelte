import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// `$effect.pending()` is first read, inside a boundary that was created, while async mode
// is off. It has to count the async work that starts once async mode is on
export default test({
	mode: ['client'],
	compileOptions: { experimental: { async: true } },

	before_test() {
		disable_async_mode_flag();
	},

	// (the suite's mode decides, not the value the flag had: importing this sample turned it on)
	after_test() {
		if (async_mode) enable_async_mode_flag();
		else disable_async_mode_flag();
	},

	async test({ assert, target }) {
		const [show, increment, shift] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.htmlEqual(output.innerHTML, `<p>pending: 0</p>`);

		enable_async_mode_flag();

		show.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>pending: 1</p>`);

		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>pending: 0</p><p>1</p>`);

		increment.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>pending: 1</p><p>1</p>`);

		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>pending: 0</p><p>2</p>`);
	}
});
