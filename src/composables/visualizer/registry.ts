/**
 * The visualizers the frontend offers, each as one self-contained entry: its
 * name and icon, its settings page, its popout menu, its appearance
 * preferences and the engine that draws it. The player menu, the settings
 * pages, the sidebar and the canvas all work from this list, so adding a
 * visualizer means adding an entry here (plus its id in state.ts).
 *
 * All of them are fed by the relay of the MilkDrop Visualizer server plugin,
 * so that plugin has to be installed for any of them to be available.
 */

import { AudioLines, Droplet } from "@lucide/vue";
import { defineAsyncComponent, type Component } from "vue";
import {
  spectrumBlur,
  spectrumOpacity,
  numberPreference,
} from "@/composables/visualizer/spectrumPreferences";
import {
  VISUALIZER_BLUR_DEFAULT,
  VISUALIZER_OPACITY_DEFAULT,
  type VisualizerId,
} from "@/composables/visualizer/state";
import {
  createSpectrumEngine,
  SPECTRUM_WINDOW_FRAMES,
} from "@/composables/visualizer/useSpectrumEngine";
import {
  createVisualizerEngine,
  isVisualizerSupported,
  type VisualizerEngine,
} from "@/composables/visualizer/useVisualizerEngine";
import {
  visualizerProviderAvailable,
  visualizerRelayReachable,
  type VisualizerRelayClient,
} from "@/plugins/visualizer-relay";

/** What an engine pulls its data from; read per tick, so both may change. */
export interface VisualizerEngineSource {
  relay: () => VisualizerRelayClient | null;
  // hold the picture back this long for output latency on the listener
  delayUs: () => number;
  // MilkDrop's render quality tier
  quality: string;
}

export interface VisualizerDefinition {
  id: VisualizerId;
  // i18n key of its name
  label: string;
  icon: Component;
  // route name of its own settings page
  settingsRoute: string;
  // whether the server side it depends on is installed
  available: () => boolean;
  // whether this session can actually draw it
  canRender: () => boolean;
  // appearance, read from its own preferences (reactive)
  opacity: () => number;
  blur: () => number;
  // MilkDrop-only behaviour of the hosting canvas: preset picking and beat
  // switching, and recolouring toward the artwork
  usesPresets: boolean;
  tintsWithArtwork: boolean;
  // popout body with its settings, opened from the visualizer menu; takes a
  // `playerId` prop
  menu: Component;
  createEngine: (
    canvas: HTMLCanvasElement,
    source: VisualizerEngineSource,
  ) => Promise<VisualizerEngine | null>;
}

export const VISUALIZERS: readonly VisualizerDefinition[] = [
  {
    id: "milkdrop",
    label: "visualizer.title",
    icon: Droplet,
    settingsRoute: "visualizer",
    available: visualizerProviderAvailable,
    canRender: () => visualizerRelayReachable() && isVisualizerSupported(),
    opacity: () =>
      numberPreference("visualizer_opacity", VISUALIZER_OPACITY_DEFAULT),
    blur: () => numberPreference("visualizer_blur", VISUALIZER_BLUR_DEFAULT),
    usesPresets: true,
    tintsWithArtwork: true,
    menu: defineAsyncComponent(
      () => import("@/layouts/default/PlayerOSD/MilkdropMenuControl.vue"),
    ),
    createEngine: (canvas, source) =>
      createVisualizerEngine(
        canvas,
        () => source.relay()?.currentFrame() ?? null,
        source.quality,
      ),
  },
  {
    id: "spectrum",
    label: "spectrum.title",
    icon: AudioLines,
    settingsRoute: "spectrum",
    available: visualizerProviderAvailable,
    canRender: visualizerRelayReachable,
    opacity: spectrumOpacity,
    blur: spectrumBlur,
    usesPresets: false,
    tintsWithArtwork: false,
    menu: defineAsyncComponent(
      () => import("@/layouts/default/PlayerOSD/SpectrumMenuControl.vue"),
    ),
    createEngine: async (canvas, source) =>
      createSpectrumEngine(
        canvas,
        () =>
          source
            .relay()
            ?.currentWindow(SPECTRUM_WINDOW_FRAMES, source.delayUs()) ?? null,
      ),
  },
];

export function getVisualizer(id: VisualizerId): VisualizerDefinition {
  const definition = VISUALIZERS.find((entry) => entry.id === id);
  if (!definition) throw new Error(`unknown visualizer "${id}"`);
  return definition;
}

/** The visualizers whose server side is installed, in menu order. */
export function availableVisualizers(): VisualizerDefinition[] {
  return VISUALIZERS.filter((entry) => entry.available());
}
