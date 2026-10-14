export interface MattressDimensionsMm {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

export interface MattressDimensionMetrics {
  surfaceAreaM2: number;
  volumeM3: number;
}

/**
 * Calculate mattress geometry from millimetre inputs. This is a geometry helper,
 * not a BOM/cost estimate: it deliberately makes no assumptions about layers,
 * density, kerf, quilting shrinkage, or construction.
 */
export function calculateMattressDimensions(
  dimensions: MattressDimensionsMm,
): MattressDimensionMetrics {
  const { lengthMm, widthMm, thicknessMm } = dimensions;
  for (const [label, value] of [
    ["length", lengthMm],
    ["width", widthMm],
    ["thickness", thicknessMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Mattress ${label} must be a positive finite measurement in millimetres.`);
    }
  }

  return {
    surfaceAreaM2: (lengthMm * widthMm) / 1_000_000,
    volumeM3: (lengthMm * widthMm * thicknessMm) / 1_000_000_000,
  };
}

export function formatMattressDimensionsMm(dimensions: MattressDimensionsMm): string {
  // Validate through the same canonical path before serializing the order size.
  calculateMattressDimensions(dimensions);
  return `${dimensions.lengthMm} × ${dimensions.widthMm} × ${dimensions.thicknessMm} mm`;
}
