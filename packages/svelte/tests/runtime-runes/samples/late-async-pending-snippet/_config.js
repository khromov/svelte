import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// A boundary with a `pending` snippet that is created once async mode is on shows the
// snippet, also inside a boundary from before. That one has rendered its content already:
// async work that starts directly inside it holds its batch back, as in any boundary that
// has resolved, instead of showing its `pending` snippet
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
		const [inner, direct, increment, shift] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.htmlEqual(output.innerHTML, `<p>outer 1</p>`);

		enable_async_mode_flag();

		inner.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>outer 1</p><p>inner pending</p>`);

		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>outer 1</p><p>inner 1</p>`);

		direct.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>outer 1</p><p>inner 1</p>`);

		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>outer 1</p><p>inner 1</p><p>direct 10</p>`);

		// both boundaries have resolved by now, so the whole batch waits
		increment.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>outer 1</p><p>inner 1</p><p>direct 10</p>`);

		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>outer 1</p><p>inner 1</p><p>direct 10</p>`);

		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>outer 2</p><p>inner 2</p><p>direct 20</p>`);
	}
});
