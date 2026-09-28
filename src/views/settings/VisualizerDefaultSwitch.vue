<!--
  "Show by default" row for a visualizer's settings page: makes it the active
  visualizer for every player not set individually (from its fullscreen
  menu). Only one visualizer can be the default, so switching one on here
  takes over from whichever was before.
-->
<template>
  <div class="flex items-center justify-between gap-6">
    <div class="min-w-0">
      <div class="font-medium">{{ $t("visualizer.default_enabled") }}</div>
      <div class="text-sm text-muted-foreground">
        {{
          $t("visualizer.default_enabled_description", {
            name: $t(getVisualizer(visualizer).label),
          })
        }}
      </div>
    </div>
    <Switch
      :model-value="isDefault"
      @update:model-value="
        (on: boolean) =>
          void setActiveVisualizerForPlayer(
            undefined,
            on ? visualizer : isDefault ? null : activeDefault,
          )
      "
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Switch } from "@/components/ui/switch";
import { getVisualizer } from "@/composables/visualizer/registry";
import type { VisualizerId } from "@/composables/visualizer/state";
import {
  activeVisualizerForPlayer,
  setActiveVisualizerForPlayer,
} from "@/composables/visualizer/useVisualizer";

const props = defineProps<{ visualizer: VisualizerId }>();

// the default for players never set individually
const activeDefault = computed(() => activeVisualizerForPlayer());
const isDefault = computed(() => activeDefault.value === props.visualizer);
</script>
