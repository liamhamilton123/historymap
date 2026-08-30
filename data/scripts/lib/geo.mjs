// Minimal geometry helpers for the ETL. No dependencies on purpose — this
// pipeline should keep working years from now without a lockfile archaeology
// session.

/** Perpendicular distance from p to the segment a-b, in degrees. */
function segmentDistance(p, a, b) {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      [x, y] = b;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Douglas-Peucker on an open point list. */
function simplifyPoints(points, sqTolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const dist = segmentDistance(points[i], points[first], points[last]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist > sqTolerance && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Simplify a closed ring, keeping it closed and valid. Returns null if the ring
 * collapses below the 4 positions GeoJSON requires.
 */
function simplifyRing(ring, sqTolerance) {
  if (ring.length < 4) return null;
  const simplified = simplifyPoints(ring.slice(0, -1), sqTolerance);
  if (simplified.length < 3) return null;
  return [...simplified, simplified[0]];
}

/** Approximate area of a ring in square degrees, used to drop specks. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
}

const round = (n, precision) => Math.round(n * precision) / precision;

/**
 * Simplify a Polygon/MultiPolygon/LineString/MultiLineString geometry.
 * `tolerance` is in degrees; `minArea` drops polygon rings smaller than that.
 * Returns null when nothing survives.
 */
export function simplifyGeometry(geometry, { tolerance, minArea = 0, precision = 1e4 }) {
  if (!geometry) return null;
  const sqTolerance = tolerance * tolerance;
  const quantize = (ring) => ring.map(([x, y]) => [round(x, precision), round(y, precision)]);

  const doPolygon = (polygon) => {
    const rings = [];
    for (let i = 0; i < polygon.length; i++) {
      const ring = simplifyRing(polygon[i], sqTolerance);
      if (!ring) {
        // An outer ring that collapses takes its holes with it.
        if (i === 0) return null;
        continue;
      }
      if (i === 0 && minArea > 0 && ringArea(ring) < minArea) return null;
      rings.push(quantize(ring));
    }
    return rings.length ? rings : null;
  };

  const doLine = (line) => {
    const simplified = simplifyPoints(line, sqTolerance);
    return simplified.length >= 2 ? quantize(simplified) : null;
  };

  switch (geometry.type) {
    case 'Polygon': {
      const rings = doPolygon(geometry.coordinates);
      return rings ? { type: 'Polygon', coordinates: rings } : null;
    }
    case 'MultiPolygon': {
      const polygons = geometry.coordinates.map(doPolygon).filter(Boolean);
      return polygons.length ? { type: 'MultiPolygon', coordinates: polygons } : null;
    }
    case 'LineString': {
      const line = doLine(geometry.coordinates);
      return line ? { type: 'LineString', coordinates: line } : null;
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates.map(doLine).filter(Boolean);
      return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
    }
    default:
      return geometry;
  }
}
