import { describe, expect, it } from "vitest";
import {
  logBandEdges,
  snapSampleRate,
  SPECTRUM_BAND_COUNT,
  SpectrumAnalyzer,
} from "./spectrum";

// A sine as the relay would send it: uint8 offset-binary frames of 1024.
function sineFrames(
  hz: number,
  sampleRate: number,
  amplitude = 1,
  frames = 4,
): Uint8Array[] {
  return Array.from({ length: frames }, (_, f) => {
    const frame = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) {
      const t = (f * 1024 + i) / sampleRate;
      frame[i] = Math.round(
        128 + 127 * amplitude * Math.sin(2 * Math.PI * hz * t),
      );
    }
    return frame;
  });
}

function bandOf(hz: number): number {
  const edges = logBandEdges();
  return edges.findIndex((edge, i) => hz >= edge && hz < edges[i + 1]);
}

describe("snapSampleRate", () => {
  it("snaps measured rates to the nearest common one", () => {
    expect(snapSampleRate(1024 / 0.02322)).toBe(44_100);
    expect(snapSampleRate(1024 / 0.021333)).toBe(48_000);
    expect(snapSampleRate(96_500)).toBe(96_000);
  });

  it("rejects rates that match nothing (gaps, reordering)", () => {
    expect(snapSampleRate(60_000)).toBeNull();
    expect(snapSampleRate(0)).toBeNull();
    expect(snapSampleRate(Number.NaN)).toBeNull();
  });
});

describe("logBandEdges", () => {
  it("spans 40 Hz to 16 kHz in equal ratios", () => {
    const edges = logBandEdges();
    expect(edges).toHaveLength(SPECTRUM_BAND_COUNT + 1);
    expect(edges[0]).toBeCloseTo(40);
    expect(edges[SPECTRUM_BAND_COUNT]).toBeCloseTo(16_000);
    const ratio = edges[1] / edges[0];
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i] / edges[i - 1]).toBeCloseTo(ratio);
    }
  });
});

describe("SpectrumAnalyzer", () => {
  it("reads silence as all bands dark", () => {
    const silence = Array.from({ length: 4 }, () =>
      new Uint8Array(1024).fill(0x80),
    );
    const levels = new SpectrumAnalyzer().analyze(silence, 44_100);
    expect(Array.from(levels).every((level) => level === 0)).toBe(true);
  });

  it.each([
    [100, 44_100],
    [1000, 44_100],
    [8000, 48_000],
  ])("puts a %d Hz sine at %d Hz into its own band", (hz, rate) => {
    const levels = new SpectrumAnalyzer().analyze(sineFrames(hz, rate), rate);
    const loudest = levels.indexOf(Math.max(...levels));
    expect(loudest).toBe(bandOf(hz));
    expect(levels[loudest]).toBeGreaterThan(0.9);
    // far-away bands stay low
    expect(levels[(loudest + 16) % SPECTRUM_BAND_COUNT]).toBeLessThan(0.3);
  });

  it("drops by about 20 dB for a sine at a tenth of the amplitude", () => {
    const analyzer = new SpectrumAnalyzer();
    const band = bandOf(1000);
    const loud = analyzer.analyze(sineFrames(1000, 44_100, 0.5), 44_100)[band];
    const quiet = analyzer.analyze(sineFrames(1000, 44_100, 0.05), 44_100)[
      band
    ];
    // 20 dB over the 48 dB display range
    expect(loud - quiet).toBeCloseTo(20 / 48, 1);
  });

  it("pads short input with silence instead of failing", () => {
    const levels = new SpectrumAnalyzer().analyze(
      sineFrames(1000, 44_100, 1, 1),
      44_100,
    );
    expect(levels.indexOf(Math.max(...levels))).toBe(bandOf(1000));
  });
});
