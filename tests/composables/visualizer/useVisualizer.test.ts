/**
 * Tests for the visualizer's per-player preferences and their defaults.
 */
import {
  activeVisualizerForPlayer,
  setActiveVisualizerForPlayer,
  useVisualizer,
  visualizerEnabledForPlayer,
} from "@/composables/visualizer/useVisualizer";
import {
  SPECTRUM_BLUR_DEFAULT,
  SPECTRUM_OPACITY_DEFAULT,
  VISUALIZER_BLUR_DEFAULT,
  VISUALIZER_OPACITY_DEFAULT,
} from "@/composables/visualizer/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storeMock = vi.hoisted(() => ({
  store: { currentUser: { preferences: {} as Record<string, unknown> } },
}));
vi.mock("@/plugins/store", () => storeMock);

const setUserPreferences = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/composables/userPreferences", () => ({
  setUserPreference: vi.fn(),
  setUserPreferences,
  useUserPreferences: () => ({
    getPreference: (_key: string, defaultValue: unknown) => ({
      value: defaultValue,
    }),
  }),
}));

const relayInstalled = vi.hoisted(() => ({ value: true }));
vi.mock("@/plugins/visualizer-relay", () => ({
  visualizerRelayReachable: () => true,
  visualizerProviderAvailable: () => relayInstalled.value,
}));

describe("visualizerEnabledForPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMock.store.currentUser = { preferences: {} };
  });

  it("follows the expert mode until the preference is set", () => {
    storeMock.store.currentUser.preferences["expert_mode"] = true;
    expect(visualizerEnabledForPlayer("kitchen")).toBe(true);

    storeMock.store.currentUser.preferences["expert_mode"] = false;
    expect(visualizerEnabledForPlayer("kitchen")).toBe(false);

    storeMock.store.currentUser.preferences["expert_mode"] = true;
    storeMock.store.currentUser.preferences["visualizer_enabled"] = false;
    expect(visualizerEnabledForPlayer("kitchen")).toBe(false);
  });

  it("honours the preference, with the per-player one winning", () => {
    storeMock.store.currentUser.preferences["visualizer_enabled"] = true;
    expect(visualizerEnabledForPlayer("kitchen")).toBe(true);
    storeMock.store.currentUser.preferences["visualizer_enabled.kitchen"] =
      false;
    expect(visualizerEnabledForPlayer("kitchen")).toBe(false);
  });
});

describe("the active visualizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relayInstalled.value = true;
    storeMock.store.currentUser = { preferences: {} };
  });

  it("is none while switched off, MilkDrop when on without a choice", () => {
    expect(activeVisualizerForPlayer("kitchen")).toBeNull();
    storeMock.store.currentUser.preferences["visualizer_enabled"] = true;
    expect(activeVisualizerForPlayer("kitchen")).toBe("milkdrop");
  });

  it("follows the per-player choice over the default", () => {
    const prefs = storeMock.store.currentUser.preferences;
    prefs["visualizer_enabled"] = true;
    prefs["visualizer_style"] = "spectrum";
    expect(activeVisualizerForPlayer("kitchen")).toBe("spectrum");
    prefs["visualizer_style.kitchen"] = "milkdrop";
    expect(activeVisualizerForPlayer("kitchen")).toBe("milkdrop");
    expect(activeVisualizerForPlayer("office")).toBe("spectrum");
  });

  it("ignores an unknown choice and counts a missing relay as none", () => {
    const prefs = storeMock.store.currentUser.preferences;
    prefs["visualizer_enabled"] = true;
    prefs["visualizer_style"] = "fireworks";
    expect(activeVisualizerForPlayer("kitchen")).toBe("milkdrop");
    relayInstalled.value = false;
    expect(activeVisualizerForPlayer("kitchen")).toBeNull();
  });

  it("switches one on in a single write, and off keeping the choice", async () => {
    await setActiveVisualizerForPlayer("kitchen", "spectrum");
    expect(setUserPreferences).toHaveBeenLastCalledWith({
      "visualizer_enabled.kitchen": true,
      "visualizer_style.kitchen": "spectrum",
    });
    await setActiveVisualizerForPlayer(undefined, null);
    expect(setUserPreferences).toHaveBeenLastCalledWith({
      visualizer_enabled: false,
    });
  });
});

describe("blur and opacity defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    relayInstalled.value = true;
    storeMock.store.currentUser = {
      preferences: { visualizer_enabled: true },
    };
  });

  // The same two numbers used to sit hardcoded in four places; these assertions
  // are what stops them drifting apart again.
  it("falls back to the shared constants when nothing is stored", () => {
    const { visualizerBlurPref, visualizerOpacityPref } =
      useVisualizer("kitchen");
    expect(visualizerBlurPref.value).toBe(VISUALIZER_BLUR_DEFAULT);
    expect(visualizerOpacityPref.value).toBe(VISUALIZER_OPACITY_DEFAULT);
  });

  // the store mock is plain data, so each read builds a fresh composable
  const appearance = () => {
    const { visualizerBlurPref, visualizerOpacityPref, visualizerDelay } =
      useVisualizer("kitchen");
    return {
      blur: visualizerBlurPref.value,
      opacity: visualizerOpacityPref.value,
      delay: visualizerDelay.value,
    };
  };

  it("gives each visualizer its own appearance", () => {
    const prefs = storeMock.store.currentUser.preferences;
    prefs["visualizer_opacity"] = 80;
    prefs["visualizer_style.kitchen"] = "spectrum";
    // MilkDrop's opacity does not leak into the spectrum
    expect(appearance()).toMatchObject({
      blur: SPECTRUM_BLUR_DEFAULT,
      opacity: SPECTRUM_OPACITY_DEFAULT,
    });
    prefs["spectrum_opacity"] = 25;
    expect(appearance().opacity).toBe(25);
  });

  it("delays only the spectrum, falling back to the old delay key", () => {
    const prefs = storeMock.store.currentUser.preferences;
    prefs["visualizer_delay.kitchen"] = 700;
    expect(appearance().delay).toBe(0);
    prefs["visualizer_style.kitchen"] = "spectrum";
    expect(appearance().delay).toBe(700);
    prefs["spectrum_delay.kitchen"] = 250;
    expect(appearance().delay).toBe(250);
  });
});
