<!--
  LED spectrum visualizer page, reached from the Plugins section in the
  sidebar. Holds the spectrum's own preferences, apart from MilkDrop's; it
  draws from the MilkDrop Visualizer plugin's relay, so that plugin has to be
  installed. The per-player delay is set from each player's fullscreen menu.
-->
<template>
  <div class="space-y-6 p-6">
    <Card>
      <CardHeader>
        <div class="flex items-center gap-4">
          <div
            class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10"
          >
            <AudioLines class="size-6 text-primary" />
          </div>
          <div>
            <CardTitle>{{ $t("spectrum.title") }}</CardTitle>
            <CardDescription>{{ $t("spectrum.description") }}</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>

    <Card v-if="!available">
      <CardContent class="text-sm">
        {{ $t("spectrum.relay_missing") }}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <div class="flex items-center gap-2">
          <SlidersHorizontal class="size-4 text-primary" />
          <CardTitle>{{ $t("visualizer.section_general") }}</CardTitle>
        </div>
      </CardHeader>
      <CardContent class="space-y-5">
        <VisualizerDefaultSwitch visualizer="spectrum" />

        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div class="min-w-0">
            <div class="font-medium">
              {{ $t("settings.visualizer_opacity.label") }}
            </div>
            <div class="text-sm text-muted-foreground">
              {{ $t("spectrum.opacity_description") }}
            </div>
          </div>
          <div class="flex w-full shrink-0 items-center gap-3 sm:w-64">
            <Slider
              :model-value="[opacityDraft]"
              :min="10"
              :max="100"
              :step="5"
              @update:model-value="
                (v: number[] | undefined) =>
                  (opacityDraft = v?.[0] ?? opacityDraft)
              "
              @value-commit="
                (v: number[]) => commit(SPECTRUM_OPACITY_KEY, v[0])
              "
            />
            <span class="w-12 text-right text-sm tabular-nums"
              >{{ opacityDraft }}%</span
            >
          </div>
        </div>

        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div class="min-w-0">
            <div class="font-medium">
              {{ $t("settings.visualizer_blur.label") }}
            </div>
            <div class="text-sm text-muted-foreground">
              {{ $t("settings.visualizer_blur.description") }}
            </div>
          </div>
          <div class="flex w-full shrink-0 items-center gap-3 sm:w-64">
            <Slider
              :model-value="[blurDraft]"
              :min="0"
              :max="30"
              :step="1"
              @update:model-value="
                (v: number[] | undefined) => (blurDraft = v?.[0] ?? blurDraft)
              "
              @value-commit="(v: number[]) => commit(SPECTRUM_BLUR_KEY, v[0])"
            />
            <span class="w-12 text-right text-sm tabular-nums"
              >{{ blurDraft }}px</span
            >
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <div class="flex items-center gap-2">
          <Timer class="size-4 text-primary" />
          <CardTitle>{{ $t("visualizer.delay") }}</CardTitle>
        </div>
        <CardDescription>{{
          $t("spectrum.delay_description")
        }}</CardDescription>
      </CardHeader>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AudioLines, SlidersHorizontal, Timer } from "@lucide/vue";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { setUserPreference } from "@/composables/userPreferences";
import { getVisualizer } from "@/composables/visualizer/registry";
import {
  spectrumBlur,
  spectrumOpacity,
  SPECTRUM_BLUR_KEY,
  SPECTRUM_OPACITY_KEY,
} from "@/composables/visualizer/spectrumPreferences";
import VisualizerDefaultSwitch from "@/views/settings/VisualizerDefaultSwitch.vue";

const available = computed(() => getVisualizer("spectrum").available());

// Drags stay local so the labels are live; the preference is written only on
// commit (drag end), since every write replaces the whole preferences object.
const opacityDraft = ref(spectrumOpacity());
watch(spectrumOpacity, (value) => (opacityDraft.value = value));
const blurDraft = ref(spectrumBlur());
watch(spectrumBlur, (value) => (blurDraft.value = value));

const commit = (key: string, value: number | undefined) => {
  if (value !== undefined) void setUserPreference(key, value);
};
</script>
