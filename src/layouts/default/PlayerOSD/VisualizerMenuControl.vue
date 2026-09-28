<!--
  Visualizer popout for the player overflow menus: one row per available
  visualizer (see composables/visualizer/registry.ts), each with its on/off
  switch for this player; at most one is on, so switching one on switches the
  other off. Tapping a row unfolds that visualizer's own settings below it.
-->
<template>
  <div class="visualizer-list" @pointerdown.stop @click.stop>
    <div
      v-for="entry in entries"
      :key="entry.id"
      class="visualizer-list__item"
      :class="{ 'visualizer-list__item--open': expanded === entry.id }"
    >
      <div
        class="visualizer-list__row"
        role="button"
        :aria-expanded="expanded === entry.id"
        @click="toggleExpanded(entry.id)"
      >
        <component
          :is="entry.icon"
          :size="20"
          class="visualizer-list__icon"
          :class="{ 'visualizer-list__icon--active': active === entry.id }"
        />
        <span class="visualizer-list__label">{{ $t(entry.label) }}</span>
        <!-- the switch must not also fold the row -->
        <span @click.stop>
          <Switch
            :model-value="active === entry.id"
            :disabled="!entry.canRender()"
            :aria-label="$t(entry.label)"
            @update:model-value="(on: boolean) => onSwitch(entry.id, on)"
          />
        </span>
        <ChevronDown
          :size="18"
          class="visualizer-list__chevron"
          :class="{ 'visualizer-list__chevron--open': expanded === entry.id }"
        />
      </div>
      <component
        :is="entry.menu"
        v-if="expanded === entry.id"
        :player-id="resolvedPlayerId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown } from "@lucide/vue";
import { Switch } from "@/components/ui/switch";
import { availableVisualizers } from "@/composables/visualizer/registry";
import type { VisualizerId } from "@/composables/visualizer/state";
import { useVisualizer } from "@/composables/visualizer/useVisualizer";
import { store } from "@/plugins/store";

const props = defineProps<{
  // player whose visualizer this controls; defaults to the active player
  playerId?: string;
}>();

const resolvedPlayerId = computed(
  () => props.playerId || store.activePlayer?.player_id,
);

const { activeVisualizer: active, setActiveVisualizer } = useVisualizer(
  () => resolvedPlayerId.value,
);

const entries = computed(() => availableVisualizers());

// Opens on the active visualizer's settings; per menu open, not persisted.
const expanded = ref<VisualizerId | null>(active.value);

const toggleExpanded = (id: VisualizerId) => {
  expanded.value = expanded.value === id ? null : id;
};

const onSwitch = (id: VisualizerId, on: boolean) => {
  if (on) {
    setActiveVisualizer(id);
    expanded.value = id;
  } else if (active.value === id) {
    setActiveVisualizer(null);
  }
};
</script>

<style scoped>
.visualizer-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  font-size: 0.875rem;
  min-width: 260px;
  min-height: 0;
  overflow-y: auto;
}

.visualizer-list__item + .visualizer-list__item {
  border-top: 1px solid var(--border);
  padding-top: 2px;
}

.visualizer-list__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
}

.visualizer-list__row:hover {
  background: var(--accent);
}

.visualizer-list__icon {
  flex: 0 0 auto;
}

.visualizer-list__icon--active {
  color: var(--primary);
}

.visualizer-list__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.visualizer-list__chevron {
  flex: 0 0 auto;
  transition: transform 0.15s ease;
}

.visualizer-list__chevron--open {
  transform: rotate(180deg);
}
</style>
