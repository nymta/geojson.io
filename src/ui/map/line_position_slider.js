const mapboxgl = require('mapbox-gl');

const SOURCE_ID = 'geojsonio-line-position-point';
const LAYER_OUTLINE_ID = 'geojsonio-line-position-point-outline';
const LAYER_FILL_ID = 'geojsonio-line-position-point-fill';
const UI_CONTAINER_ID = 'geojsonio-line-position-slider';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpCoord(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

function lngLatFromCoord(coord) {
  return new mapboxgl.LngLat(coord[0], coord[1]);
}

function distanceMeters(a, b) {
  return lngLatFromCoord(a).distanceTo(lngLatFromCoord(b));
}

function buildSegments(coords) {
  const segments = [];
  let cum = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const meters = distanceMeters(a, b);
    segments.push({ a, b, meters, cumStart: cum });
    cum += meters;
  }

  return { segments, totalMeters: cum };
}

function nearestPointOnSegmentPx(clickPx, aPx, bPx) {
  const abx = bPx.x - aPx.x;
  const aby = bPx.y - aPx.y;
  const acx = clickPx.x - aPx.x;
  const acy = clickPx.y - aPx.y;

  const denom = abx * abx + aby * aby;
  const u = denom === 0 ? 0 : clamp((acx * abx + acy * aby) / denom, 0, 1);

  const x = aPx.x + u * abx;
  const y = aPx.y + u * aby;

  const dx = clickPx.x - x;
  const dy = clickPx.y - y;

  return { u, dist2: dx * dx + dy * dy };
}

function bestFractionForLine({ map, coords, clickLngLat }) {
  const { segments, totalMeters } = buildSegments(coords);

  if (!segments.length || totalMeters === 0) {
    return { t: 0, segments, totalMeters, dist2: Infinity };
  }

  const clickPx = map.project(clickLngLat);

  let best = {
    dist2: Infinity,
    alongMeters: 0
  };

  for (const seg of segments) {
    const aPx = map.project(seg.a);
    const bPx = map.project(seg.b);
    const { u, dist2 } = nearestPointOnSegmentPx(clickPx, aPx, bPx);
    if (dist2 < best.dist2) {
      best = {
        dist2,
        alongMeters: seg.cumStart + u * seg.meters
      };
    }
  }

  const t = clamp(best.alongMeters / totalMeters, 0, 1);
  return { t, segments, totalMeters, dist2: best.dist2 };
}

function bestLineForClick({ map, geometry, clickLngLat }) {
  if (!geometry) return null;

  if (geometry.type === 'LineString') {
    const coords = geometry.coordinates || [];
    return bestFractionForLine({ map, coords, clickLngLat });
  }

  if (geometry.type === 'MultiLineString') {
    const lines = geometry.coordinates || [];
    let best = null;
    for (const coords of lines) {
      const candidate = bestFractionForLine({ map, coords, clickLngLat });
      if (!best || candidate.dist2 < best.dist2) best = candidate;
    }
    return best || { t: 0, segments: [], totalMeters: 0, dist2: Infinity };
  }

  return null;
}

function pointAtFraction({ segments, totalMeters, t }) {
  if (!segments.length || totalMeters === 0) {
    const fallback = segments[0] ? segments[0].a : null;
    return fallback || null;
  }

  const targetMeters = clamp(t, 0, 1) * totalMeters;
  for (const seg of segments) {
    const segEnd = seg.cumStart + seg.meters;
    if (targetMeters <= segEnd) {
      const u =
        seg.meters === 0 ? 0 : (targetMeters - seg.cumStart) / seg.meters;
      return lerpCoord(seg.a, seg.b, clamp(u, 0, 1));
    }
  }

  return segments[segments.length - 1].b;
}

function ensurePointLayers(map) {
  // (Re-)add source/layers if the style was changed.
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }

  if (!map.getLayer(LAYER_OUTLINE_ID)) {
    map.addLayer({
      id: LAYER_OUTLINE_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 8,
        'circle-color': '#111827',
        'circle-opacity': 0.9
      }
    });
  }

  if (!map.getLayer(LAYER_FILL_ID)) {
    map.addLayer({
      id: LAYER_FILL_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-opacity': 0.95
      }
    });
  }
}

function setPoint(map, coord) {
  const src = map.getSource(SOURCE_ID);
  if (!src) return;

  src.setData({
    type: 'FeatureCollection',
    features: coord
      ? [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: coord
            },
            properties: {}
          }
        ]
      : []
  });
}

function removePointLayers(map) {
  if (map.getLayer(LAYER_FILL_ID)) map.removeLayer(LAYER_FILL_ID);
  if (map.getLayer(LAYER_OUTLINE_ID)) map.removeLayer(LAYER_OUTLINE_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

function formatPercent(t) {
  const pct1 = Math.round(clamp(t, 0, 1) * 1000) / 10;
  if (pct1 <= 0) return '0%';
  if (pct1 >= 100) return '100%';
  return `${pct1.toFixed(1)}%`;
}

module.exports = function createLinePositionSlider({
  map,
  feature,
  clickLngLat
}) {
  const container = document.getElementById(UI_CONTAINER_ID);
  if (!container) return { destroy() {} };

  const slider = container.querySelector('.slider');
  const readout = container.querySelector('.readout');
  if (!slider || !readout) return { destroy() {} };

  const best = bestLineForClick({
    map,
    geometry: feature && feature.geometry,
    clickLngLat
  });

  if (!best) return { destroy() {} };

  let destroyed = false;
  const state = {
    segments: best.segments,
    totalMeters: best.totalMeters
  };

  function updateReadout(t) {
    readout.textContent = formatPercent(t);
  }

  function ensureAndUpdatePoint(t) {
    if (destroyed) return;
    ensurePointLayers(map);
    const coord = pointAtFraction({
      segments: state.segments,
      totalMeters: state.totalMeters,
      t
    });
    setPoint(map, coord);
  }

  const onSliderInput = () => {
    const t = clamp(parseFloat(slider.value) || 0, 0, 1);
    updateReadout(t);
    ensureAndUpdatePoint(t);
  };

  // Re-add layers after style changes.
  const onStyleData = () => {
    const t = clamp(parseFloat(slider.value) || 0, 0, 1);
    ensureAndUpdatePoint(t);
  };

  // Initialize
  slider.value = String(best.t);
  updateReadout(best.t);
  ensureAndUpdatePoint(best.t);

  // Show the container
  container.classList.add('active');

  // Bind events
  slider.addEventListener('input', onSliderInput);
  map.on('styledata', onStyleData);

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;

      slider.removeEventListener('input', onSliderInput);
      map.off('styledata', onStyleData);

      // Hide the container
      container.classList.remove('active');
      removePointLayers(map);
    }
  };
};
