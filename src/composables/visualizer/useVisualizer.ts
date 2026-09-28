/**
 * Shared wiring for views that host a VisualizerCanvas: which visualizer is
 * active for the shown player, its appearance, and the gating for when it is
 * actually drawn.
 *
 * At most one visualizer is active per player. Two preferences hold that
 * choice, each per player with a plain default underneath:
 * - `visualizer_enabled.<player_id>` over `visualizer_enabled` - whether one is
 *   on at all; the default follows the expert mode until it is set.
 * - `visualizer_style.<player_id>` over `visualizer_style` - which one, by id
 *   (see registry.ts); switching off keeps it, so switching on returns to it.
 * Choosing from a view therefore only affects the player that view is
 * showing, not every display of the user.
 */

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  setUserPreference,
  setUserPreferences,
  useUserPreferences,
} from "@/composables/userPreferences";
import {
  availableVisualizers,
  getVisualizer,
} from "@/composables/visualizer/registry";
import { spectrumDelayForPlayer } from "@/composables/visualizer/spectrumPreferences";
import {
  isVisualizerId,
  VISUALIZER_DEFAULT_ID,
  type VisualizerId,
} from "@/composables/visualizer/state";
import { expertModeSetting } from "@/helpers/expert_mode";
import { store } from "@/plugins/store";

/**
 * Whether a visualizer is on for this player (standalone: also usable from
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

/** The visualizer this player shows while switched on. */
function chosenVisualizerForPlayer(playerId?: string): VisualizerId {
  const prefs = store.currentUser?.preferences;
  const override = playerId
    ? prefs?.[`visualizer_style.${playerId}`]
    : undefined;
  if (isVisualizerId(override)) return override;
  const chosen = prefs?.visualizer_style;
  return isVisualizerId(chosen) ? chosen : VISUALIZER_DEFAULT_ID;
}

/**
 * The visualizer active for this player (or, without an id, the default for
 * players never set individually), or null when none is. A chosen visualizer
 * whose server side went missing counts as none.
 */
export function activeVisualizerForPlayer(
  playerId?: string,
): VisualizerId | null {
  if (!visualizerEnabledForPlayer(playerId)) return null;
  const id = chosenVisualizerForPlayer(playerId);
  return getVisualizer(id).available() ? id : null;
}

/**
 * Make `id` the active visualizer for this player (or the default), or
 * switch visualizers off with null. Both keys go out in one write so the
 * account never holds half the answer.
 */
export function setActiveVisualizerForPlayer(
  playerId: string | undefined,
  id: VisualizerId | null,
): Promise<boolean> {
  const suffix = playerId ? `.${playerId}` : "";
  const values: Record<string, unknown> = {
    [`visualizer_enabled${suffix}`]: id !== null,
  };
  if (id !== null) values[`visualizer_style${suffix}`] = id;
  return setUserPreferences(values);
}

/**
 * Flip the visualizer on or off for this player, keeping which one it is.
 */
export function toggleVisualizerForPlayer(playerId?: string): void {
  const key = playerId
    ? `visualizer_enabled.${playerId}`
    : "visualizer_enabled";
  void setUserPreference(key, !visualizerEnabledForPlayer(playerId));
}

/** Whether any visualizer can be offered at all (its server side installed). */
export function anyVisualizerAvailable(): boolean {
  return availableVisualizers().length > 0;
}

export function useVisualizer(playerId?: MaybeRefOrGetter<string | undefined>) {
  const { getPreference } = useUserPreferences();
  const visualizerPresetPref = getPreference("visualizer_preset", "");

  const activeVisualizer = computed(() =>
    activeVisualizerForPlayer(toValue(playerId)),
  );
  const visualizerEnabledPref = computed(() => activeVisualizer.value !== null);
  const activeDefinition = computed(() =>
    activeVisualizer.value ? getVisualizer(activeVisualizer.value) : null,
  );

  // Appearance of whichever visualizer is active; each keeps its own.
  const visualizerBlurPref = computed(
    () => activeDefinition.value?.blur() ?? 0,
  );
  const visualizerOpacityPref = computed(
    () => activeDefinition.value?.opacity() ?? 0,
  );
  const visualizerDelay = computed(() =>
    activeVisualizer.value === "spectrum"
      ? spectrumDelayForPlayer(toValue(playerId))
      : 0,
  );

  const visualizerAvailable = computed(() => anyVisualizerAvailable());

  // "On" also requires that this session can actually draw it: applying the
  // dark-palette / album-art-swap styling while the canvas stays transparent
  // (no WebGL2 for MilkDrop, or a remote session) would break the
  // plain-background fallback.
  const visualizerActive = computed(
    () => activeDefinition.value?.canRender() ?? false,
  );

  const toggleVisualizer = () => {
    toggleVisualizerForPlayer(toValue(playerId));
  };

  const setActiveVisualizer = (id: VisualizerId | null) => {
    void setActiveVisualizerForPlayer(toValue(playerId), id);
  };

  return {
    activeVisualizer,
    visualizerEnabledPref,
    visualizerDelay,
    visualizerPresetPref,
    visualizerBlurPref,
    visualizerOpacityPref,
    visualizerAvailable,
    visualizerActive,
    toggleVisualizer,
    setActiveVisualizer,
  };
}
