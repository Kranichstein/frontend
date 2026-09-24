/**
 * Spectrum analysis for the LED spectrum visualizer: a Hann-windowed radix-2
 * FFT over the relay's waveform samples, grouped into logarithmically spaced
 * bands and mapped onto a 0..1 display level.
 *
 * The relay does not announce the sample rate. Its waveform frames are
 * back-to-back windows of the source PCM, though, so the spacing between two
 * frame timestamps gives it away (see snapSampleRate).
 */

export const SPECTRUM_BAND_COUNT = 32;
export const SPECTRUM_MIN_HZ = 40;
export const SPECTRUM_MAX_HZ = 16_000;
export const SPECTRUM_FFT_SIZE = 4096;
export const DEFAULT_SAMPLE_RATE = 44_100;

// Display range in dB relative to a full-scale sine. The uint8 samples leave
// ~48 dB above their quantization noise, which is about what 24 LEDs can show.
const FLOOR_DB = -54;
const CEILING_DB = -6;
// Music thins out towards the treble; a gentle lift around 1 kHz keeps the
// upper bands from sitting on the floor while the bass pins the top.
const TILT_DB_PER_OCTAVE = 1.5;
const TILT_PIVOT_HZ = 1000;

const ZERO_LEVEL = 0x80;
const COMMON_SAMPLE_RATES = [
  22_050, 32_000, 44_100, 48_000, 88_200, 96_000, 176_400, 192_000,
];
const SAMPLE_RATE_TOLERANCE = 0.03;

/**
 * Snap a measured sample rate to the nearest common one, or null when the
 * measurement is off (a seek or reordered frame in between, say).
 */
export function snapSampleRate(measured: number): number | null {
  if (!Number.isFinite(measured) || measured <= 0) return null;
  for (const rate of COMMON_SAMPLE_RATES) {
    if (Math.abs(measured - rate) / rate <= SAMPLE_RATE_TOLERANCE) return rate;
  }
  return null;
}

/**
 * Band edges in Hz: `bandCount + 1` logarithmically spaced frequencies.
 */
export function logBandEdges(
  bandCount = SPECTRUM_BAND_COUNT,
  minHz = SPECTRUM_MIN_HZ,
  maxHz = SPECTRUM_MAX_HZ,
): number[] {
  const ratio = Math.log(maxHz / minHz);
  return Array.from(
    { length: bandCount + 1 },
    (_, i) => minHz * Math.exp((ratio * i) / bandCount),
  );
}

interface BandBins {
  // FFT bins whose center frequency falls inside the band
  first: number;
  last: number;
  // fractional bin at the band's (geometric) center, for bands narrower than a bin
  center: number;
  tiltDb: number;
}

export class SpectrumAnalyzer {
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  private readonly power: Float32Array;
  private readonly window: Float32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly bitReversed: Uint32Array;
  private readonly edges: number[];
  private readonly levels: Float32Array;
  private bands: BandBins[] = [];
  private bandsSampleRate = 0;
  // a full-scale sine's peak bin power under the Hann window: (N/4)²
  private readonly referencePower: number;

  constructor(
    private readonly size = SPECTRUM_FFT_SIZE,
    bandCount = SPECTRUM_BAND_COUNT,
    minHz = SPECTRUM_MIN_HZ,
    maxHz = SPECTRUM_MAX_HZ,
  ) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error("FFT size must be a power of two");
    }
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    this.power = new Float32Array(size / 2 + 1);
    this.window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    }
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    const bits = Math.log2(size);
    this.bitReversed = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let reversed = 0;
      for (let b = 0; b < bits; b++)
        reversed |= ((i >> b) & 1) << (bits - 1 - b);
      this.bitReversed[i] = reversed;
    }
    this.edges = logBandEdges(bandCount, minHz, maxHz);
    this.levels = new Float32Array(bandCount);
    this.referencePower = (size / 4) ** 2;
  }

  /**
   * Analyze the newest `size` samples of the given back-to-back frames (oldest
   * first, uint8 offset-binary). Short input is padded with silence in front.
   * Returns per-band levels in 0..1; the array is reused between calls.
   */
  analyze(frames: readonly Uint8Array[], sampleRate: number): Float32Array {
    this.load(frames);
    this.transform();
    if (sampleRate !== this.bandsSampleRate) this.mapBands(sampleRate);

    const half = this.size / 2;
    for (let k = 0; k <= half; k++) {
      this.power[k] = this.re[k] * this.re[k] + this.im[k] * this.im[k];
    }
    for (let b = 0; b < this.bands.length; b++) {
      const band = this.bands[b];
      let sum = 0;
      if (band.last >= band.first) {
        for (let k = band.first; k <= band.last; k++) sum += this.power[k];
      } else {
        // narrower than one bin (the lowest bands): read between neighbours
        const k = Math.min(Math.floor(band.center), half - 1);
        const t = band.center - k;
        sum = this.power[k] * (1 - t) + this.power[k + 1] * t;
      }
      const db =
        10 * Math.log10(sum / this.referencePower + 1e-12) + band.tiltDb;
      const level = (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB);
      this.levels[b] = level < 0 ? 0 : level > 1 ? 1 : level;
    }
    return this.levels;
  }

  private load(frames: readonly Uint8Array[]): void {
    let write = this.size;
    // fill from the newest sample backwards
    for (let f = frames.length - 1; f >= 0 && write > 0; f--) {
      const frame = frames[f];
      for (let i = frame.length - 1; i >= 0 && write > 0; i--) {
        write -= 1;
        this.re[write] = ((frame[i] - ZERO_LEVEL) / 127) * this.window[write];
      }
    }
    this.re.fill(0, 0, write);
    this.im.fill(0);
    // bit-reversal permutation
    for (let i = 0; i < this.size; i++) {
      const j = this.bitReversed[i];
      if (j > i) {
        const tmp = this.re[i];
        this.re[i] = this.re[j];
        this.re[j] = tmp;
      }
    }
  }

  // Iterative in-place radix-2 Cooley-Tukey (input already bit-reversed).
  private transform(): void {
    const { re, im, cos, sin, size } = this;
    for (let len = 2; len <= size; len <<= 1) {
      const halfLen = len >> 1;
      const step = size / len;
      for (let start = 0; start < size; start += len) {
        for (let j = 0; j < halfLen; j++) {
          const wr = cos[j * step];
          const wi = sin[j * step];
          const a = start + j;
          const b = a + halfLen;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }

  private mapBands(sampleRate: number): void {
    const binHz = sampleRate / this.size;
    const half = this.size / 2;
    const nyquist = sampleRate / 2;
    this.bands = [];
    for (let b = 0; b < this.edges.length - 1; b++) {
      const lo = Math.min(this.edges[b], nyquist);
      const hi = Math.min(this.edges[b + 1], nyquist);
      const centerHz = Math.sqrt(lo * hi);
      this.bands.push({
        first: Math.ceil(lo / binHz),
        last: Math.min(Math.ceil(hi / binHz) - 1, half),
        center: centerHz / binHz,
        tiltDb: TILT_DB_PER_OCTAVE * Math.log2(centerHz / TILT_PIVOT_HZ),
      });
    }
    this.bandsSampleRate = sampleRate;
  }
}
