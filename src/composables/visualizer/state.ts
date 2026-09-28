/**
 * Tiny shared state and defaults for the visualizers.
 * The canvas picks presets internally (random modes), so controls that act
 * on "the preset currently showing" read it from here.
 */

import { ref } from "vue";

export const currentVisualizerPreset = ref<string | null>(null);

// Defaults for MilkDrop's blur/opacity preferences. Every reader goes through
// these (settings page, fullscreen menu, useVisualizer, and the canvas prop
// fallbacks) so the four cannot drift apart.
export const VISUALIZER_BLUR_DEFAULT = 0;
export const VISUALIZER_OPACITY_DEFAULT = 40;

// The spectrum's own appearance defaults, independent of MilkDrop's.
export const SPECTRUM_BLUR_DEFAULT = 0;
export const SPECTRUM_OPACITY_DEFAULT = 60;
// Extra delay (ms) for output latency on the listening device.
export const SPECTRUM_DELAY_MAX_MS = 1000;

// The visualizers the frontend knows; at most one is active per player.
// Their descriptions (name, menu, settings page, engine) live in registry.ts.
export const VISUALIZER_IDS = ["milkdrop", "spectrum"] as const;
export type VisualizerId = (typeof VISUALIZER_IDS)[number];
// What a player shows when switched on without ever picking one.
export const VISUALIZER_DEFAULT_ID: VisualizerId = "milkdrop";

export function isVisualizerId(value: unknown): value is VisualizerId {
  return (VISUALIZER_IDS as readonly unknown[]).includes(value);
}
