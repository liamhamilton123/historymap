/**
 * Diagonal stripe patterns for fill-pattern layers, generated rather than
 * shipped as image assets so the spacing, weight and colour stay described in
 * one place — POLITY_STATUS in lib/mapStyle.ts — instead of baked into a PNG.
 */

export type HatchSpec = {
  /** Tile size in CSS pixels. Must be a whole multiple of `period`. */
  size: number;
  /** Distance between stripe centres, along the diagonal, in CSS pixels. */
  period: number;
  /** Stripe width in CSS pixels. */
  thickness: number;
  color: readonly [number, number, number];
  opacity: number;
};

/** What the generated image is scaled by; MapLibre is told the same number. */
export const HATCH_PIXEL_RATIO = 2;

/**
 * A 45° stripe tile. Stripes run along x + y = c, which repeats seamlessly in
 * both directions as long as the tile is a whole number of periods across, so
 * MapLibre can tile it without a visible join.
 */
export function hatchImage(spec: HatchSpec): { width: number; height: number; data: Uint8Array } {
  const scale = HATCH_PIXEL_RATIO;
  const size = Math.round(spec.size * scale);
  const period = spec.period * scale;
  const half = (spec.thickness * scale) / 2;
  const [r, g, b] = spec.color;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance to the nearest stripe centre, measured across the diagonal.
      const phase = (((x + y + 0.5) % period) + period) % period;
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
