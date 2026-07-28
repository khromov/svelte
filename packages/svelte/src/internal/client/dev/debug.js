/** @import { Derived, Effect, Value } from '#client' */

import {
	BLOCK_EFFECT,
	BOUNDARY_EFFECT,
	BRANCH_EFFECT,
	CLEAN,
	CONNECTED,
	DERIVED,
	DIRTY,
	EFFECT,
	ASYNC,
	DESTROYED,
	INERT,
	MAYBE_DIRTY,
	RENDER_EFFECT,
	ROOT_EFFECT,
	WAS_MARKED,
	MANAGED_EFFECT
} from '#client/constants';
import { snapshot } from '../../shared/clone.js';
import { untrack } from '../runtime.js';

/**
 *
 * @param {Effect} effect
 */
export function root(effect) {
	while (effect.parent !== null) {
		effect = effect.parent;
	}

	return effect;
}

/**
 *
 * @param {Effect} effect
 * @param {boolean} append_effect
 * @returns {string}
 */
function effect_label(effect, append_effect = false) {
	const flags = effect.f;

	let label = `(unknown ${append_effect ? 'effect' : ''})`;

	if ((flags & ROOT_EFFECT) !== 0) {
		label = 'root';
	} else if ((flags & BOUNDARY_EFFECT) !== 0) {
		label = 'boundary';
	} else if ((flags & BLOCK_EFFECT) !== 0) {
		label = 'block';
	} else if ((flags & MANAGED_EFFECT) !== 0) {
		label = 'managed';
	} else if ((flags & ASYNC) !== 0) {
		label = 'async';
	} else if ((flags & BRANCH_EFFECT) !== 0) {
		label = 'branch';
	} else if ((flags & RENDER_EFFECT) !== 0) {
		label = 'render effect';
	} else if ((flags & EFFECT) !== 0) {
		label = 'effect';
	}

	if (append_effect && !label.endsWith('effect')) {
		label += ' effect';
	}

	return label;
}

/**
 * @param {Effect} effect
 * @param {Effect[]} highlighted
 */
export function log_effect_tree(effect, highlighted = [], depth = 0, is_reachable = true) {
	const flags = effect.f;
	let label = effect_label(effect);

	let status =
		(flags & CLEAN) !== 0 ? 'clean' : (flags & MAYBE_DIRTY) !== 0 ? 'maybe dirty' : 'dirty';

	let styles = [`font-weight: ${status === 'clean' ? 'normal' : 'bold'}`];

	if (status !== 'clean' && !is_reachable) {
		label = `⚠️ ${label}`;
		styles.push(`color: red`);
	}

	if ((flags & INERT) !== 0) {
		styles.push('font-style: italic');
	}

	if (highlighted.includes(effect)) {
		styles.push('background-color: yellow');
	}

	// eslint-disable-next-line no-console
	console.group(`%c${label} (${status})`, styles.join('; '));

	if (depth === 0) {
		const callsite = new Error().stack
			?.split('\n')[2]
			.replace(/\s+at (?: \w+\(?)?(.+)\)?/, (m, $1) => $1.replace(/\?[^:]+/, ''));

		// eslint-disable-next-line no-console
		console.log(callsite);
	} else {
		// eslint-disable-next-line no-console
		console.groupCollapsed(`%cfn`, `font-weight: normal`);
		// eslint-disable-next-line no-console
		console.log(effect.fn);
		// eslint-disable-next-line no-console
		console.groupEnd();
	}

	if (effect.deps !== null) {
		// eslint-disable-next-line no-console
		console.groupCollapsed('%cdeps', 'font-weight: normal');

		for (const dep of effect.deps) {
			log_dep(dep);
		}

		// eslint-disable-next-line no-console
		console.groupEnd();
	}

	if (effect.nodes) {
		// eslint-disable-next-line no-console
		console.log(effect.nodes.start);

		if (effect.nodes.start !== effect.nodes.end) {
			// eslint-disable-next-line no-console
			console.log(effect.nodes.end);
		}
	}

	var child_is_reachable = is_reachable && ((flags & BRANCH_EFFECT) === 0 || (flags & CLEAN) === 0);

	let child = effect.first;
	while (child !== null) {
		log_effect_tree(child, highlighted, depth + 1, child_is_reachable);
		child = child.next;
	}

	// eslint-disable-next-line no-console
	console.groupEnd();
}

/**
 *
 * @param {Value} dep
 */
function log_dep(dep) {
	if ((dep.f & DERIVED) !== 0) {
		const derived = /** @type {Derived} */ (dep);

		// eslint-disable-next-line no-console
		console.groupCollapsed(
			`%c$derived %c${dep.label ?? '<unknown>'}`,
			'font-weight: bold; color: CornflowerBlue',
			'font-weight: normal',
			untrack(() => snapshot(derived.v))
		);

		if (derived.deps) {
			for (const d of derived.deps) {
				log_dep(d);
			}
		}

		// eslint-disable-next-line no-console
		console.groupEnd();
	} else {
		// eslint-disable-next-line no-console
		console.log(
			`%c$state %c${dep.label ?? '<unknown>'}`,
			'font-weight: bold; color: CornflowerBlue',
			'font-weight: normal',
			untrack(() => snapshot(dep.v))
		);
	}
}

/**
 * Logs all reactions of a source or derived transitively
 * @param {Derived | Value} signal
 */
export function log_reactions(signal) {
	/** @type {Set<Derived | Value>} */
	const visited = new Set();

	/**
	 * Returns an array of flag names that are set on the given flags bitmask
	 * @param {number} flags
	 * @returns {string[]}
	 */
	function get_derived_flag_names(flags) {
		/** @type {string[]} */
		const names = [];

		if ((flags & CLEAN) !== 0) names.push('CLEAN');
		if ((flags & DIRTY) !== 0) names.push('DIRTY');
		if ((flags & MAYBE_DIRTY) !== 0) names.push('MAYBE_DIRTY');
		if ((flags & CONNECTED) !== 0) names.push('CONNECTED');
		if ((flags & WAS_MARKED) !== 0) names.push('WAS_MARKED');
		if ((flags & INERT) !== 0) names.push('INERT');
		if ((flags & DESTROYED) !== 0) names.push('DESTROYED');

		return names;
	}

	/**
	 * @param {Derived | Value} d
	 * @param {number} depth
	 */
	function log_derived(d, depth) {
		const flags = d.f;
		const flag_names = get_derived_flag_names(flags);
		const flags_str = flag_names.length > 0 ? `(${flag_names.join(', ')})` : '(no flags)';

		// eslint-disable-next-line no-console
		console.group(
			`%c${flags & DERIVED ? '$derived' : '$state'} %c${d.label ?? '<unknown>'} %c${flags_str}`,
			'font-weight: bold; color: CornflowerBlue',
			'font-weight: normal; color: inherit',
			'font-weight: normal; color: gray'
		);

		// eslint-disable-next-line no-console
		console.log(untrack(() => snapshot(d.v)));

		if ('fn' in d) {
			// eslint-disable-next-line no-console
			console.log('%cfn:', 'font-weight: bold', d.fn);
		}

		if (d.reactions !== null && d.reactions.length > 0) {
			// eslint-disable-next-line no-console
			console.group('%creactions', 'font-weight: bold');

			for (const reaction of d.reactions) {
				if ((reaction.f & DERIVED) !== 0) {
					const derived_reaction = /** @type {Derived} */ (reaction);

					if (visited.has(derived_reaction)) {
						// eslint-disable-next-line no-console
						console.log(
							`%c$derived %c${derived_reaction.label ?? '<unknown>'} %c(already seen)`,
							'font-weight: bold; color: CornflowerBlue',
							'font-weight: normal; color: inherit',
							'font-weight: bold; color: orange'
						);
					} else {
						visited.add(derived_reaction);
						log_derived(derived_reaction, depth + 1);
					}
				} else {
					// It's an effect
					const label = effect_label(/** @type {Effect} */ (reaction), true);
					const status = (flags & MAYBE_DIRTY) !== 0 ? 'maybe dirty' : 'dirty';

					// Collect parent statuses
					/** @type {string[]} */
					const parent_statuses = [];
					let show = false;
					let current = /** @type {Effect} */ (reaction).parent;
					while (current !== null) {
						const parent_flags = current.f;
						if ((parent_flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
							const parent_status = (parent_flags & CLEAN) !== 0 ? 'clean' : 'not clean';
							if (parent_status === 'clean' && parent_statuses.includes('not clean')) show = true;
							parent_statuses.push(parent_status);
						}
						if (!current.parent) break;
						current = current.parent;
					}

					// Check if reaction is reachable from root
					const seen_effects = new Set();
					let reachable = false;
					/**
					 * @param {Effect | null} effect
					 */
					function check_reachable(effect) {
						if (effect === null || reachable) return;
						if (effect === reaction) {
							reachable = true;
							return;
						}
						if (effect.f & DESTROYED) return;
						if (seen_effects.has(effect)) {
							throw new Error('');
						}
						seen_effects.add(effect);
						let child = effect.first;
						while (child !== null) {
							check_reachable(child);
							child = child.next;
						}
					}
					try {
						if (current) check_reachable(current);
					} catch (e) {
						// eslint-disable-next-line no-console
						console.log(
							`%c⚠️ Circular reference detected in effect tree`,
							'font-weight: bold; color: red',
							seen_effects
						);
					}

					if (!reachable) {
						// eslint-disable-next-line no-console
						console.log(
							`%c⚠️ Effect is NOT reachable from its parent chain`,
							'font-weight: bold; color: red'
						);
					}

					const parent_status_str = show ? ` (${parent_statuses.join(', ')})` : '';

					// eslint-disable-next-line no-console
					console.log(
						`%c${label} (${status})${parent_status_str}`,
						`font-weight: bold; color: ${parent_status_str ? 'red' : 'green'}`,
						reaction
					);
				}
			}

			// eslint-disable-next-line no-console
			console.groupEnd();
		} else {
			// eslint-disable-next-line no-console
			console.log('%cno reactions', 'font-style: italic; color: gray');
		}

		// eslint-disable-next-line no-console
		console.groupEnd();
	}

	// eslint-disable-next-line no-console
	console.group(`%cDerived Reactions Graph`, 'font-weight: bold; color: purple');

	visited.add(signal);
	log_derived(signal, 0);

	// eslint-disable-next-line no-console
	console.groupEnd();
}
