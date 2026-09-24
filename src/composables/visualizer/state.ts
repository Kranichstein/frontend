/**
 * Tiny shared state and defaults for the visualizer.
 * The canvas picks presets internally (random modes), so controls that act
 * on "the preset currently showing" read it from here.
 */

import { ref } from "vue";

export const currentVisualizerPreset = ref<string | null>(null);

// Defaults for the blur/opacity preferences. Every reader goes through these
// (settings page, fullscreen menu, useVisualizer, and the canvas prop
// fallbacks) so the four cannot drift apart.
export const VISUALIZER_BLUR_DEFAULT = 0;
export const VISUALIZER_OPACITY_DEFAULT = 40;
// Extra delay (ms) for output latency on the listening device.
export const VISUALIZER_DELAY_MAX_MS = 1000;

// What the visualizer draws while it is on; "off" is the enabled preference.
export type VisualizerStyle = "milkdrop" | "spectrum";
export type VisualizerMode = "off" | VisualizerStyle;
export const VISUALIZER_STYLE_DEFAULT: VisualizerStyle = "milkdrop";
export const VISUALIZER_MODES: readonly VisualizerMode[] = [
  "off",
  "milkdrop",
  "spectrum",
];

export function isVisualizerStyle(value: unknown): value is VisualizerStyle {
  return value === "milkdrop" || value === "spectrum";
}
