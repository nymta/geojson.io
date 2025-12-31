// Made by the MTA
//
// quickzoom: Fast, context-aware map navigation to a feature.
//
// TARGET CENTER & ZOOM:
// - Center is always the centroid of the feature (midpoint of bounding box).
// - Zoom is clamped to 12.5-16.5 range for all geometry types.
//   This ensures enough context even for tiny features.
// - For points: use current zoom, clamped to 12.5-16.5.
// - For polygons/linestrings: use the zoom that would fit the bounds,
//   clamped to 12.5-16.5.
//
// ANIMATION (jumpTo vs easeTo):
// - Calculate the movement distance in pixels (at current zoom).
// - Calculate the average of current and target viewport sizes.
// - If movement > 3x that average, use jumpTo (instant).
// - Otherwise, use easeTo (smooth 400ms animation).
//
// This means:
// - Nearby features at similar zoom: smooth ease.
// - Far away features while zoomed in: instant jump (no slow pan).
// - Zooming out to a large feature that contains current view: smooth ease.

const bbox = require('@turf/bbox').default;

module.exports = function (map, feature) {
  // Calculate target center (centroid from bbox)
  const bounds = bbox(feature);
  const targetCenter = [
    (bounds[0] + bounds[2]) / 2,
    (bounds[1] + bounds[3]) / 2
  ];

  // Calculate target zoom
  // Clamp all geometries to 14-17 range for consistent context
  // ~zoom 14 = 1.5 mile view, ~zoom 17 = 0.25 mile view
  const minZoom = 12.5;
  const maxZoom = 16.5;

  let targetZoom;
  if (feature.geometry.type === 'Point') {
    // For points: clamp current zoom to the range
    targetZoom = Math.max(minZoom, Math.min(maxZoom, map.getZoom()));
  } else {
    // For other geometries: use zoom that fits bounds, but clamp to range
    const camera = map.cameraForBounds(bounds, { padding: 60 });
    const fitZoom = camera ? camera.zoom : map.getZoom();
    targetZoom = Math.max(minZoom, Math.min(maxZoom, fitZoom));
  }

  // Decide: jumpTo or easeTo?
  // Compare movement distance to average viewport size (in pixels at current zoom)
  const currentCenter = map.getCenter();
  const currentZoom = map.getZoom();

  // Project centers to pixels at current zoom
  const currentPixel = map.project(currentCenter);
  const targetPixel = map.project(targetCenter);
  const moveDistancePx = Math.hypot(
    targetPixel.x - currentPixel.x,
    targetPixel.y - currentPixel.y
  );

  // Get current viewport dimensions in pixels
  const canvas = map.getCanvas();
  const currentViewportSize = (canvas.width + canvas.height) / 2;

  // Estimate target viewport size (scales with zoom difference)
  // Each zoom level doubles/halves the pixel-per-degree ratio
  const zoomDiff = currentZoom - targetZoom;
  const targetViewportSize = currentViewportSize * Math.pow(2, zoomDiff);

  // Average of current and target viewport sizes
  const avgViewportSize = (currentViewportSize + targetViewportSize) / 2;

  // If movement > 3x average viewport size, jumpTo; else easeTo
  const useJump = moveDistancePx > 3 * avgViewportSize;

  const options = {
    center: targetCenter,
    zoom: targetZoom
  };

  if (useJump) {
    map.jumpTo(options);
  } else {
    map.easeTo({
      ...options,
      duration: 400
    });
  }
};
