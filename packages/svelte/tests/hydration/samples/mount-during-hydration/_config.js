import { test } from '../../test';
import {
	async_mode_flag,
	disable_async_mode_flag,
	enable_async_mode_flag
} from '../../../../src/internal/flags/index.js';

let was_enabled = false;

// `mount` called from the script of a component that is being hydrated fails without moving
// the hydration cursor of the app being hydrated, which therefore hydrates normally.
// Other samples may have turned the (global) async flag on, so turn it off for this one
export default test({
	expect_hydration_error: true,

	snapshot(target) {
		return {
			p: target.querySelector('p'),
			section: target.querySelector('section')
		};
	},

	before_test() {
		was_enabled = async_mode_flag;
		disable_async_mode_flag();
	},

	after_test() {
		if (was_enabled) enable_async_mode_flag();
	}
});
