/**
 * Diagonal stripe patterns for fill-pattern layers, generated rather than
 * shipped as image assets so the spacing, weight and colour stay described in
 * one place — POLITY_STATUS in lib/mapStyle.ts — instead of baked into a PNG.
 */

/**
 * Stands in for a fixed colour when the stripes should take the polity's own.
 * `fill-pattern` cannot be tinted per feature, so a spec that says this needs
 * one generated image per colour that actually occurs in the data — which is
 * why the build lists them in polity-hatches.json rather than the style
 * guessing. See POLITY_HATCHES in lib/mapStyle.ts.
 */
export const POLITY_COLOR = 'polity';

export type Rgb = readonly [number, number, number];

export type HatchSpec = {
  /** Tile size in CSS pixels. Must be a whole multiple of `period`. */
  size: number;
  /** Distance between stripe centres, along the diagonal, in CSS pixels. */
  period: number;
  /** Stripe width in CSS pixels. */
  thickness: number;
  /** A fixed colour, or POLITY_COLOR to take the polity's own. */
  color: Rgb | typeof POLITY_COLOR;
  opacity: number;
};

/**
 * Which way stripes lean. Two polities claiming one piece of ground are drawn
 * on top of each other, so they are given opposite leans and each still reads
 * through the other instead of one hiding the one beneath it.
 */
export type Slope = 1 | -1;

/** What the generated image is scaled by; MapLibre is told the same number. */
export const HATCH_PIXEL_RATIO = 2;

/** `#rrggbb` -> the channels hatchImage wants. */
export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * A 45° stripe tile. Stripes run along x + y = c (or x - y = c leaning the
 * other way), which repeats seamlessly in both directions as long as the tile
 * is a whole number of periods across, so MapLibre can tile it without a
 * visible join.
 *
 * `color` is required when the spec defers to the polity's own, and ignored
 * otherwise.
 */
export function hatchImage(
  spec: HatchSpec,
  options: { color?: Rgb; slope?: Slope } = {},
): { width: number; height: number; data: Uint8Array } {
  const rgb = spec.color === POLITY_COLOR ? options.color : spec.color;
  if (!rgb) throw new Error('hatchImage: this pattern needs a colour to be given');
  const slope = options.slope ?? 1;
  const scale = HATCH_PIXEL_RATIO;
  const size = Math.round(spec.size * scale);
  const period = spec.period * scale;
  const half = (spec.thickness * scale) / 2;
  const [r, g, b] = rgb;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance to the nearest stripe centre, measured across the diagonal.
      const along = slope > 0 ? x + y : x - y;
      const phase = (((along + 0.5) % period) + period) % period;
      const distance = Math.min(phase, period - phase);
      // The half-pixel ramp is the antialiasing: a hard cut looks jagged at 45°.
      const coverage = Math.min(Math.max(half + 0.5 - distance, 0), 1);
      if (coverage <= 0) continue;
      const alpha = coverage * spec.opacity;
      const i = (y * size + x) * 4;
      // MapLibre expects premultiplied alpha.
      data[i] = Math.round(r * alpha);
      data[i + 1] = Math.round(g * alpha);
      data[i + 2] = Math.round(b * alpha);
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  return { width: size, height: size, data };
}
