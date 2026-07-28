import { render_effect, effect, teardown } from '../../../reactivity/effects.js';
import { listen } from './shared.js';

/** @param {TimeRanges} ranges */
function time_ranges_to_array(ranges) {
	var array = [];

	for (var i = 0; i < ranges.length; i += 1) {
		array.push({ start: ranges.start(i), end: ranges.end(i) });
	}

	return array;
}

/**
 * @param {HTMLVideoElement | HTMLAudioElement} media
 * @param {() => number | undefined} get
 * @param {(value: number) => void} set
 * @returns {void}
 */
export function bind_current_time(media, get, set = get) {
	/** @type {number} */
	var raf_id;
	/** @type {number} */
	var value;

	// Ideally, listening to timeupdate would be enough, but it fires too infrequently for the currentTime
	// binding, which is why we use a raf loop, too. We additionally still listen to timeupdate because
	// the user could be scrubbing through the video using the native controls when the media is paused.
	var callback = () => {
		cancelAnimationFrame(raf_id);

		if (!media.paused) {
			raf_id = requestAnimationFrame(callback);
		}

		var next_value = media.currentTime;
		if (value !== next_value) {
			set((value = next_value));
		}
	};

	raf_id = requestAnimationFrame(callback);
	media.addEventListener('timeupdate', callback);

	render_effect(() => {
		var next_value = Number(get());

		if (value !== next_value && !isNaN(/** @type {any} */ (next_value))) {
			media.currentTime = value = next_value;
		}
	});

	teardown(() => {
		cancelAnimationFrame(raf_id);
		media.removeEventListener('timeupdate', callback);
	});
}

/**
 * @param {HTMLVideoElement | HTMLAudioElement} media
 * @param {(array: Array<{ start: number; end: number }>) => void} set
 */
export function bind_buffered(media, set) {
	/** @type {{ start: number; end: number; }[]} */
	var current;

	// `buffered` can update without emitting any event, so we check it on various events.
	// By specs, `buffered` always returns a new object, so we have to compare deeply.
	listen(media, ['loadedmetadata', 'progress', 'timeupdate', 'seeking'], () => {
		var ranges = media.buffered;

		if (
			!current ||
			current.length !== ranges.length ||
			current.some((range, i) => ranges.start(i) !== range.start || ranges.end(i) !== range.end)
		) {
			current = time_ranges_to_array(ranges);
			set(current);
		}
	});
}

/**
 * Creates a readonly binding that reports `get_value(media)` on the given events
 * @template T
 * @param {string[]} events
 * @param {(media: HTMLVideoElement | HTMLAudioElement) => T} get_value
 * @returns {(media: HTMLVideoElement | HTMLAudioElement, set: (value: T) => void) => void}
 */
function readonly_media_binding(events, get_value) {
	return (media, set) => {
		listen(media, events, () => set(get_value(media)));
	};
}

export const bind_seekable = /* @__PURE__ */ readonly_media_binding(['loadedmetadata'], (media) =>
	time_ranges_to_array(media.seekable)
);

export const bind_played = /* @__PURE__ */ readonly_media_binding(['timeupdate'], (media) =>
	time_ranges_to_array(media.played)
);

export const bind_seeking = /* @__PURE__ */ readonly_media_binding(
	['seeking', 'seeked'],
	(media) => media.seeking
);

export const bind_ended = /* @__PURE__ */ readonly_media_binding(
	['timeupdate', 'ended'],
	(media) => media.ended
);

export const bind_ready_state = /* @__PURE__ */ readonly_media_binding(
	['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing', 'waiting', 'emptied'],
	(media) => media.readyState
);

/**
 * @param {HTMLVideoElement | HTMLAudioElement} media
 * @param {() => number | undefined} get
 * @param {(playback_rate: number) => void} set
 */
export function bind_playback_rate(media, get, set = get) {
	// Needs to happen after element is inserted into the dom (which is guaranteed by using effect),
	// else playback will be set back to 1 by the browser
	effect(() => {
		var value = Number(get());

		if (value !== media.playbackRate && !isNaN(value)) {
			media.playbackRate = value;
		}
	});

	// Start listening to ratechange events after the element is inserted into the dom,
	// else playback will be set to 1 by the browser
	effect(() => {
		listen(media, ['ratechange'], () => {
			set(media.playbackRate);
		});
	});
}

/**
 * @param {HTMLVideoElement | HTMLAudioElement} media
 * @param {() => boolean | undefined} get
 * @param {(paused: boolean) => void} set
 */
export function bind_paused(media, get, set = get) {
	var paused = get();

	var update = () => {
		if (paused !== media.paused) {
			set((paused = media.paused));
		}
	};

	// If someone switches the src while media is playing, the player will pause.
	// Listen to the canplay event to get notified of this situation.
	listen(media, ['play', 'pause', 'canplay'], update, paused == null);

	// Needs to be an effect to ensure media element is mounted: else, if paused is `false` (i.e. should play right away)
	// a "The play() request was interrupted by a new load request" error would be thrown because the resource isn't loaded yet.
	effect(() => {
		if ((paused = !!get()) !== media.paused) {
			if (paused) {
				media.pause();
			} else {
				media.play().catch((error) => {
					set((paused = true));
					throw error;
				});
			}
		}
	});
}

/**
 * Creates a two-way binding for `volume`/`muted` — reports `media[prop]` on `volumechange`,
 * and writes the coerced bound value back whenever it differs
 * @template {'volume' | 'muted'} P
 * @param {P} prop
 * @param {(value: unknown) => (HTMLVideoElement | HTMLAudioElement)[P]} coerce
 * @returns {(
 *   media: HTMLVideoElement | HTMLAudioElement,
 *   get: () => (HTMLVideoElement | HTMLAudioElement)[P] | undefined,
 *   set?: (value: (HTMLVideoElement | HTMLAudioElement)[P]) => void
 * ) => void}
 */
function media_setter_binding(prop, coerce) {
	return (media, get, set = get) => {
		var callback = () => {
			set(media[prop]);
		};

		if (get() == null) {
			callback();
		}

		listen(media, ['volumechange'], callback, false);

		render_effect(() => {
			var value = coerce(get());

			// `isNaN` only ever excludes a non-numeric `volume`; for `muted` it is always false
			if (value !== media[prop] && !isNaN(/** @type {number} */ (value))) {
				media[prop] = value;
			}
		});
	};
}

export const bind_volume = /* @__PURE__ */ media_setter_binding('volume', Number);

export const bind_muted = /* @__PURE__ */ media_setter_binding('muted', (value) => !!value);
