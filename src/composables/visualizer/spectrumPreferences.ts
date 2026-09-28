/**
 * The LED spectrum's own preferences, kept apart from MilkDrop's
 * `visualizer_*` keys so each visualizer is set up on its own.
 *
 * - `spectrum_opacity`, `spectrum_blur`: appearance, for all players.
 * - `spectrum_delay.<player_id>`: per-player delay (ms) for output latency the
 *   server can't see (Bluetooth, an AirPlay receiver's own processing).
 */

import { setUserPreference } from "@/composables/userPreferences";
import {
  SPECTRUM_BLUR_DEFAULT,
  SPECTRUM_DELAY_MAX_MS,
  SPECTRUM_OPACITY_DEFAULT,
} from "@/composables/visualizer/state";
import { store } from "@/plugins/store";

export const SPECTRUM_OPACITY_KEY = "spectrum_opacity";
export const SPECTRUM_BLUR_KEY = "spectrum_blur";
const DELAY_KEY = "spectrum_delay";
// where the delay lived while the spectrum shared MilkDrop's settings
const LEGACY_DELAY_KEY = "visualizer_delay";

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * A numeric preference, or its fallback while unset. Reads reactive store
 * state, so it stays reactive inside a computed.
 */
export function numberPreference(key: string, fallback: number): number {
  return finiteNumber(store.currentUser?.preferences?.[key]) ?? fallback;
}

export const spectrumOpacity = (): number =>
  numberPreference(SPECTRUM_OPACITY_KEY, SPECTRUM_OPACITY_DEFAULT);

export const spectrumBlur = (): number =>
  numberPreference(SPECTRUM_BLUR_KEY, SPECTRUM_BLUR_DEFAULT);

/**
 * How many ms to hold the spectrum back for this player's output latency.
 */
export function spectrumDelayForPlayer(playerId?: string): number {
  if (!playerId) return 0;
  const prefs = store.currentUser?.preferences;
  const value =
    finiteNumber(prefs?.[`${DELAY_KEY}.${playerId}`]) ??
    finiteNumber(prefs?.[`${LEGACY_DELAY_KEY}.${playerId}`]) ??
    0;
  return Math.min(Math.max(value, 0), SPECTRUM_DELAY_MAX_MS);
}

export function setSpectrumDelayForPlayer(
  playerId: string | undefined,
  delayMs: number,
): void {
  if (!playerId) return;
  void setUserPreference(`${DELAY_KEY}.${playerId}`, delayMs);
}
