import { tick } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

// A component whose script uses `await` (at the top level, and in a derived) is rendered,
// updated and destroyed in an app that was mounted while async mode was off
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
		const [toggle, increment, shift] = target.querySelectorAll('button');
		const [output] = target.querySelectorAll('output');

		assert.htmlEqual(output.innerHTML, `<p>parent 1</p>`);

		enable_async_mode_flag();

		toggle.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>parent 1</p>`);

		// the top-level `await`
		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>parent 1</p>`);

		// the derived
		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>parent 1</p><p>child 1 1 2</p>`);

		increment.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>parent 1</p><p>child 1 1 2</p>`);

		shift.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>parent 2</p><p>child 1 2 4</p>`);

		toggle.click();
		await tick();
		assert.htmlEqual(output.innerHTML, `<p>parent 2</p>`);
	}
});
