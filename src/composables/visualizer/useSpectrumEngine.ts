/**
 * LED spectrum render engine: a Canvas 2D bar display fed by the same relay
 * waveform frames as MilkDrop. Each tick analyzes the window centred on "now"
 * into 32 log-spaced bands and lights 24 segments per band, green at the
 * bottom, yellow from 60 % and red from 85 % of the height. Bars rise at once
 * and sink smoothly; each band holds its peak for a moment before it drops.
 *
 * Implements the MilkDrop engine's interface so the hosting canvas can swap
 * one for the other; the preset calls are no-ops here.
 */

import type { VisualizerEngine } from "@/composables/visualizer/useVisualizerEngine";
import {
  SPECTRUM_BAND_COUNT,
  SPECTRUM_FFT_SIZE,
  SpectrumAnalyzer,
} from "@/helpers/visualizer/spectrum";
import type { SampleWindow } from "@/plugins/visualizer-relay";

// Frames per analysis window: 4 × 1024 samples = SPECTRUM_FFT_SIZE.
export const SPECTRUM_WINDOW_FRAMES = SPECTRUM_FFT_SIZE / 1024;

const SEGMENTS = 24;
const YELLOW_FROM = 0.6;
const RED_FROM = 0.85;
const COLORS = {
  green: "#2ee65a",
  yellow: "#ffd60a",
  red: "#ff3b30",
};
// unlit segments stay faintly visible, like a real LED panel
const UNLIT_ALPHA = 0.1;

// Bar dynamics, in display levels (0..1 = full height) per second.
const BAR_FALL_PER_SEC = 1.1;
const PEAK_HOLD_MS = 700;
const PEAK_GRAVITY_PER_SEC2 = 2.4;
const STARVATION_MS = 300;
const MAX_DPR = 2;

type SegmentColor = keyof typeof COLORS;

function segmentColor(segment: number): SegmentColor {
  // judged by the segment's centre, so the colour bands land on 60 % / 85 %
  const height = (segment + 0.5) / SEGMENTS;
  if (height >= RED_FROM) return "red";
  if (height >= YELLOW_FROM) return "yellow";
  return "green";
}

/**
 * Create the engine on a canvas. Returns null when no 2D context is available.
 *
 * @param canvas - the target canvas element.
 * @param getWindow - returns the sample window for "now", or null when none.
 */
export function createSpectrumEngine(
  canvas: HTMLCanvasElement,
  getWindow: () => SampleWindow | null,
): VisualizerEngine | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const analyzer = new SpectrumAnalyzer();
  const bars = new Float32Array(SPECTRUM_BAND_COUNT);
  const targets = new Float32Array(SPECTRUM_BAND_COUNT);
  const peaks = new Float32Array(SPECTRUM_BAND_COUNT);
  const peakHeldUntil = new Float64Array(SPECTRUM_BAND_COUNT);
  const peakVelocity = new Float32Array(SPECTRUM_BAND_COUNT);

  let rafHandle: number | null = null;
  let destroyed = false;
  let paused = false;
  let lastTickAt = 0;
  let lastWindowAt = 0;
  let lastAnalyzedTimestamp: number | null = null;

  // Geometry, recomputed on resize (device pixels).
  let width = 0;
  let height = 0;
  let segments: { x: number; y: number; w: number; h: number }[][] = [];
  let unlitLayer: HTMLCanvasElement | null = null;

  const layout = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    width = Math.round(canvas.clientWidth * dpr);
    height = Math.round(canvas.clientHeight * dpr);
    canvas.width = width;
    canvas.height = height;
    if (!width || !height) return;

    const padX = width * 0.04;
    const padY = height * 0.06;
    const innerW = width - 2 * padX;
    const innerH = height - 2 * padY;
    const colGap = (innerW / SPECTRUM_BAND_COUNT) * 0.18;
    const rowGap = (innerH / SEGMENTS) * 0.28;
    const colW =
      (innerW - colGap * (SPECTRUM_BAND_COUNT - 1)) / SPECTRUM_BAND_COUNT;
    const rowH = (innerH - rowGap * (SEGMENTS - 1)) / SEGMENTS;

    segments = [];
    for (let band = 0; band < SPECTRUM_BAND_COUNT; band++) {
      const column = [];
      const x = padX + band * (colW + colGap);
      for (let segment = 0; segment < SEGMENTS; segment++) {
        const y = height - padY - (segment + 1) * rowH - segment * rowGap;
        column.push({ x, y, w: colW, h: rowH });
      }
      segments.push(column);
    }

    // The unlit grid never changes between frames: draw it once per size.
    unlitLayer = document.createElement("canvas");
    unlitLayer.width = width;
    unlitLayer.height = height;
    const unlitCtx = unlitLayer.getContext("2d");
    if (unlitCtx) {
      unlitCtx.globalAlpha = UNLIT_ALPHA;
      for (const color of Object.keys(COLORS) as SegmentColor[]) {
        unlitCtx.fillStyle = COLORS[color];
        unlitCtx.beginPath();
        for (const column of segments) {
          column.forEach((rect, segment) => {
            if (segmentColor(segment) === color)
              unlitCtx.rect(rect.x, rect.y, rect.w, rect.h);
          });
        }
        unlitCtx.fill();
      }
    }
  };

  const draw = () => {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    if (unlitLayer) ctx.drawImage(unlitLayer, 0, 0);
    // one path per colour keeps it to three fills per frame
    for (const color of Object.keys(COLORS) as SegmentColor[]) {
      ctx.fillStyle = COLORS[color];
      ctx.beginPath();
      for (let band = 0; band < SPECTRUM_BAND_COUNT; band++) {
        const column = segments[band];
        const lit = Math.round(bars[band] * SEGMENTS);
        for (let segment = 0; segment < lit; segment++) {
          if (segmentColor(segment) !== color) continue;
          const rect = column[segment];
          ctx.rect(rect.x, rect.y, rect.w, rect.h);
        }
        const peakSegment = Math.round(peaks[band] * SEGMENTS) - 1;
        if (
          peakSegment >= lit &&
          peakSegment >= 0 &&
          segmentColor(peakSegment) === color
        ) {
          const rect = column[peakSegment];
          ctx.rect(rect.x, rect.y, rect.w, rect.h);
        }
      }
      ctx.fill();
    }
  };

  const stopLoop = () => {
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    rafHandle = null;
  };

  const readInput = (now: number) => {
    if (paused) {
      targets.fill(0);
      return;
    }
    const sampleWindow = getWindow();
    if (!sampleWindow) {
      if (now - lastWindowAt > STARVATION_MS) targets.fill(0);
      return;
    }
    lastWindowAt = now;
    // rAF usually outpaces the frames; only a new frame changes the spectrum
    if (sampleWindow.newestTimestampUs === lastAnalyzedTimestamp) return;
    lastAnalyzedTimestamp = sampleWindow.newestTimestampUs;
    targets.set(analyzer.analyze(sampleWindow.frames, sampleWindow.sampleRate));
  };

  // Advance bars and peaks by dt; returns whether anything is still lit.
  const step = (now: number, dt: number): boolean => {
    let anyLit = false;
    for (let band = 0; band < SPECTRUM_BAND_COUNT; band++) {
      const target = targets[band];
      bars[band] =
        target >= bars[band]
          ? target
          : Math.max(target, bars[band] - BAR_FALL_PER_SEC * dt);

      if (bars[band] >= peaks[band]) {
        peaks[band] = bars[band];
        peakHeldUntil[band] = now + PEAK_HOLD_MS;
        peakVelocity[band] = 0;
      } else if (now > peakHeldUntil[band]) {
        peakVelocity[band] += PEAK_GRAVITY_PER_SEC2 * dt;
        peaks[band] = Math.max(
          bars[band],
          peaks[band] - peakVelocity[band] * dt,
        );
      }
      if (bars[band] > 0 || peaks[band] > 0) anyLit = true;
    }
    return anyLit;
  };

  const renderLoop = () => {
    if (destroyed) return;
    rafHandle = requestAnimationFrame(renderLoop);
    if (document.visibilityState !== "visible") return;
    const now = performance.now();
    // clamp so a stalled tab doesn't drop everything in one step
    const dt = lastTickAt ? Math.min((now - lastTickAt) / 1000, 0.1) : 0;
    lastTickAt = now;
    readInput(now);
    const anyLit = step(now, dt);
    draw();
    // Paused and fully sunk: nothing left to animate.
    if (paused && !anyLit) stopLoop();
  };

  const startLoop = () => {
    if (rafHandle !== null || destroyed) return;
    lastTickAt = 0;
    rafHandle = requestAnimationFrame(renderLoop);
  };

  const resizeObserver = new ResizeObserver(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h || (w === width && h === height)) return;
    layout();
    // Resizing clears the canvas; a halted loop has to put the frame back.
    if (rafHandle === null) draw();
  });

  layout();
  resizeObserver.observe(canvas);
  startLoop();

  return {
    async loadPresetByName() {},
    async loadRandomPreset() {
      return "";
    },
    setPaused(value: boolean, ramp = true) {
      if (destroyed || value === paused) return;
      paused = value;
      if (paused) {
        // With a ramp the bars sink on their own and the loop halts after.
        if (!ramp) {
          bars.fill(0);
          peaks.fill(0);
          targets.fill(0);
          draw();
          stopLoop();
        }
        return;
      }
      lastWindowAt = performance.now();
      lastAnalyzedTimestamp = null;
      startLoop();
    },
    destroy() {
      destroyed = true;
      stopLoop();
      resizeObserver.disconnect();
    },
  };
}
