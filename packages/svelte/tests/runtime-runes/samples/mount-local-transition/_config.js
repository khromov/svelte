import { flushSync } from 'svelte';
import { test } from '../../test';
import { async_mode } from '../../../helpers.js';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

let was_enabled = false;

// local (non-global) transitions on the top-level elements of a mounted component
// play on `mount(..., { intro: true })` and on `unmount(..., { outro: true })`
export default test({
	// with `SVELTE_NO_ASYNC`, an earlier sample in this worker may have turned async mode on
	before_test() {
		was_enabled = async_mode_flag;
		if (!async_mode) disable_async_mode_flag();
	},

	after_test() {
		if (was_enabled) enable_async_mode_flag();
	},

	test({ assert, target, raf }) {
		const [mount_button, unmount_button] = target.querySelectorAll('button');

		mount_button.click();
		flushSync();

		const p = /** @type {HTMLParagraphElement & { foo: number }} */ (target.querySelector('p'));

		raf.tick(50);
		assert.equal(p.foo, 0.5);

		raf.tick(100);
		assert.equal(p.foo, 1);

		unmount_button.click();
		flushSync();

		raf.tick(150);
		assert.equal(p.foo, 0.5);
		assert.ok(target.querySelector('p'));

		raf.tick(200);
		assert.equal(target.querySelector('p'), null);
	}
});
