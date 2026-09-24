/**
 * Shared wiring for views that host a VisualizerCanvas: the user preferences
 * that parameterize it, plus the gating for when the visualizer is actually on.
 *
 * The on/off state is per player: an explicit `visualizer_enabled.<player_id>`
 * preference wins, with the plain `visualizer_enabled` preference as the
 * default for players never toggled individually (also the settings-page
 * toggle); that preference itself follows the expert mode until it is set.
 * Toggling from a view therefore only affects the player that view is showing,
 * not every display of the user.
 *
 * What it draws while on (MilkDrop or the LED spectrum) follows the same
 * pattern with `visualizer_style.<player_id>` over `visualizer_style`; the UI
 * offers both as one three-way mode ("off" / "milkdrop" / "spectrum").
 *
 * `visualizer_delay.<player_id>` holds a per-player delay (ms) for output
 * latency the server can't see, such as Bluetooth or a player's sync delay.
 */

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  setUserPreference,
  setUserPreferences,
  useUserPreferences,
} from "@/composables/userPreferences";
import {
  isVisualizerStyle,
  VISUALIZER_BLUR_DEFAULT,
  VISUALIZER_DELAY_MAX_MS,
  VISUALIZER_OPACITY_DEFAULT,
  VISUALIZER_STYLE_DEFAULT,
  type VisualizerMode,
  type VisualizerStyle,
} from "@/composables/visualizer/state";
import { expertModeSetting } from "@/helpers/expert_mode";
import { store } from "@/plugins/store";
import {
  visualizerCanRender,
  visualizerProviderAvailable,
} from "@/plugins/visualizer-relay";

/**
 * Whether the visualizer is on for this player (standalone: also usable from
 * plain functions like the player menu builder). Reads reactive store state,
 * so it stays reactive when called inside a computed.
 */
export function visualizerEnabledForPlayer(playerId?: string): boolean {
  const prefs = store.currentUser?.preferences;
  if (playerId) {
    const override = prefs?.[`visualizer_enabled.${playerId}`];
    if (override !== undefined) return Boolean(override);
  }
  return expertModeSetting("visualizer_enabled");
}

export function toggleVisualizerForPlayer(playerId?: string): void {
  const key = playerId
    ? `visualizer_enabled.${playerId}`
    : "visualizer_enabled";
  void setUserPreference(key, !visualizerEnabledForPlayer(playerId));
}

/**
 * What the visualizer draws for this player while it is on.
 */
export function visualizerStyleForPlayer(playerId?: string): VisualizerStyle {
  const prefs = store.currentUser?.preferences;
  const override = playerId
    ? prefs?.[`visualizer_style.${playerId}`]
    : undefined;
  if (isVisualizerStyle(override)) return override;
  const style = prefs?.visualizer_style;
  return isVisualizerStyle(style) ? style : VISUALIZER_STYLE_DEFAULT;
}

export function visualizerModeForPlayer(playerId?: string): VisualizerMode {
  return visualizerEnabledForPlayer(playerId)
    ? visualizerStyleForPlayer(playerId)
    : "off";
}

/**
 * Switch this player (or, without an id, the default) to a mode. Switching
 * off keeps the style, so turning it back on returns to the same one. Both
 * keys go out in one write so the account never holds half the answer.
 */
export function setVisualizerModeForPlayer(
  playerId: string | undefined,
  mode: VisualizerMode,
): Promise<boolean> {
  const suffix = playerId ? `.${playerId}` : "";
  const values: Record<string, unknown> = {
    [`visualizer_enabled${suffix}`]: mode !== "off",
  };
  if (mode !== "off") values[`visualizer_style${suffix}`] = mode;
  return setUserPreferences(values);
}

/**
 * How many ms to hold the picture back for this player's output latency.
 */
export function visualizerDelayForPlayer(playerId?: string): number {
  const prefs = store.currentUser?.preferences;
  const value = playerId ? prefs?.[`visualizer_delay.${playerId}`] : undefined;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), VISUALIZER_DELAY_MAX_MS)
    : 0;
}

export function setVisualizerDelayForPlayer(
  playerId: string | undefined,
  delayMs: number,
): void {
  if (!playerId) return;
  void setUserPreference(`visualizer_delay.${playerId}`, delayMs);
}

export function useVisualizer(playerId?: MaybeRefOrGetter<string | undefined>) {
  const { getPreference } = useUserPreferences();
  const visualizerPresetPref = getPreference("visualizer_preset", "");
  const visualizerBlurPref = getPreference(
    "visualizer_blur",
    VISUALIZER_BLUR_DEFAULT,
  );
  const visualizerOpacityPref = getPreference(
    "visualizer_opacity",
    VISUALIZER_OPACITY_DEFAULT,
  );

  const visualizerEnabledPref = computed(() =>
    visualizerEnabledForPlayer(toValue(playerId)),
  );
  const visualizerStyle = computed(() =>
    visualizerStyleForPlayer(toValue(playerId)),
  );
  const visualizerDelay = computed(() =>
    visualizerDelayForPlayer(toValue(playerId)),
  );
  const visualizerMode = computed<VisualizerMode>(() =>
    visualizerEnabledPref.value ? visualizerStyle.value : "off",
  );

  // The visualizer only exists when the milkdrop_visualizer server plugin is loaded.
  const visualizerAvailable = computed(() => visualizerProviderAvailable());

  // "On" also requires that this session can actually draw it: applying the
  // dark-palette / album-art-swap styling while the canvas stays transparent
  // (no WebGL2, or a remote session) would break the plain-background fallback.
  const visualizerActive = computed(
    () =>
      visualizerEnabledPref.value &&
      visualizerAvailable.value &&
      visualizerCanRender(visualizerStyle.value),
  );

  const toggleVisualizer = () => {
    toggleVisualizerForPlayer(toValue(playerId));
  };

  const setVisualizerMode = (mode: VisualizerMode) => {
    void setVisualizerModeForPlayer(toValue(playerId), mode);
  };

  const setVisualizerDelay = (delayMs: number) => {
    setVisualizerDelayForPlayer(toValue(playerId), delayMs);
  };

  return {
    visualizerEnabledPref,
    visualizerStyle,
    visualizerMode,
    visualizerDelay,
    visualizerPresetPref,
    visualizerBlurPref,
    visualizerOpacityPref,
    visualizerAvailable,
    visualizerActive,
    toggleVisualizer,
    setVisualizerMode,
    setVisualizerDelay,
  };
}
