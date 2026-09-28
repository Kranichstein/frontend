<!--
  The LED spectrum's settings in the visualizer menu: blur and opacity (its
  own `spectrum_*` preferences, shared by all players) and the delay for this
  player's output latency. Switching it on or off is the host list's job
  (VisualizerMenuControl).
-->
<template>
  <div class="spectrum-menu" @pointerdown.stop @click.stop>
    <div class="spectrum-menu__row">
      <Focus :size="20" class="spectrum-menu__icon" />
      <Slider
        :model-value="[blurDraft]"
        :min="0"
        :max="30"
        :step="1"
        class="spectrum-menu__slider"
        @update:model-value="(v) => (blurDraft = v?.[0] ?? blurDraft)"
        @value-commit="(v) => commit(SPECTRUM_BLUR_KEY, v[0])"
      />
      <span class="spectrum-menu__value">{{ blurDraft }}px</span>
    </div>
    <div class="spectrum-menu__row">
      <Contrast :size="20" class="spectrum-menu__icon" />
      <Slider
        :model-value="[opacityDraft]"
        :min="10"
        :max="100"
        :step="5"
        class="spectrum-menu__slider"
        @update:model-value="(v) => (opacityDraft = v?.[0] ?? opacityDraft)"
        @value-commit="(v) => commit(SPECTRUM_OPACITY_KEY, v[0])"
      />
      <span class="spectrum-menu__value">{{ opacityDraft }}%</span>
    </div>
    <!-- holds the spectrum back for output latency on this player's device -->
    <div class="spectrum-menu__row" :title="$t('visualizer.delay')">
      <Timer :size="20" class="spectrum-menu__icon" />
      <Slider
        :model-value="[delayDraft]"
        :min="0"
        :max="SPECTRUM_DELAY_MAX_MS"
        :step="10"
        :aria-label="$t('visualizer.delay')"
        class="spectrum-menu__slider"
        @update:model-value="(v) => (delayDraft = v?.[0] ?? delayDraft)"
        @value-commit="
          (v) => setSpectrumDelayForPlayer(resolvedPlayerId, v[0] ?? 0)
        "
      />
      <span class="spectrum-menu__value">{{ delayDraft }} ms</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Contrast, Focus, Timer } from "@lucide/vue";
import { Slider } from "@/components/ui/slider";
import { setUserPreference } from "@/composables/userPreferences";
import {
  setSpectrumDelayForPlayer,
  spectrumBlur,
  spectrumDelayForPlayer,
  spectrumOpacity,
  SPECTRUM_BLUR_KEY,
  SPECTRUM_OPACITY_KEY,
} from "@/composables/visualizer/spectrumPreferences";
import { SPECTRUM_DELAY_MAX_MS } from "@/composables/visualizer/state";
import { store } from "@/plugins/store";

const props = defineProps<{
  // player whose delay this sets; defaults to the active player
  playerId?: string;
}>();

const resolvedPlayerId = computed(
  () => props.playerId || store.activePlayer?.player_id,
);

// Drags stay local so the labels are live; the preference is written only on
// commit (drag end), since every write replaces the whole preferences object.
const blurDraft = ref(spectrumBlur());
watch(spectrumBlur, (value) => (blurDraft.value = value));
const opacityDraft = ref(spectrumOpacity());
watch(spectrumOpacity, (value) => (opacityDraft.value = value));
const delayDraft = ref(spectrumDelayForPlayer(resolvedPlayerId.value));
watch(
  () => spectrumDelayForPlayer(resolvedPlayerId.value),
  (value) => (delayDraft.value = value),
);

const commit = (key: string, value: number | undefined) => {
  if (value !== undefined) void setUserPreference(key, value);
};
</script>

<style scoped>
.spectrum-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 8px;
  font-size: 0.875rem;
}

.spectrum-menu__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.spectrum-menu__icon {
  flex: 0 0 auto;
}

.spectrum-menu__slider {
  flex: 1 1 auto;
}

.spectrum-menu__value {
  min-width: 4ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
