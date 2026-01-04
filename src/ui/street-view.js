/**
 * Street View Mode
 *
 * Option-click on the map to set an origin point.
 * A circle appears around the origin with an arrow pointing toward the cursor.
 * Click again to open Google Street View at the origin, looking in the arrow's direction.
 */

const turfBearing = require('@turf/bearing').default;

const CIRCLE_RADIUS = 48;
const ARROW_COLOR = '#FF6B35';
const CIRCLE_COLOR = '#FF6B35';

const streetViewMode = {
  active: false,
  origin: null, // { lngLat, screenPoint }
  heading: 0,
  overlay: null,
  marker: null
};

/**
 * Calculate bearing/heading from point A to point B using turf
 * Returns degrees (0-360, where 0 is North, 90 is East)
 */
function calculateBearing(from, to) {
  const bearing = turfBearing([from.lng, from.lat], [to.lng, to.lat]);
  // turf returns -180 to 180, normalize to 0-360
  return (bearing + 360) % 360;
}

/**
 * Create the overlay element (circle + arrow)
 */
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'street-view-overlay';
  overlay.innerHTML = `
    <svg width="${CIRCLE_RADIUS * 2 + 20}" height="${CIRCLE_RADIUS * 2 + 20}" 
         style="position: absolute; left: ${-CIRCLE_RADIUS - 10}px; top: ${
    -CIRCLE_RADIUS - 10
  }px;">
      <defs>
        <marker id="arrowhead" markerWidth="5" markerHeight="4" 
                refX="4.5" refY="2" orient="auto" fill="${ARROW_COLOR}">
          <polygon points="0 0, 5 2, 0 4" />
        </marker>
      </defs>
      <circle cx="${CIRCLE_RADIUS + 10}" cy="${
    CIRCLE_RADIUS + 10
  }" r="${CIRCLE_RADIUS}" 
              fill="none" stroke="${CIRCLE_COLOR}" stroke-width="2" stroke-dasharray="4 4" />
      <circle cx="${CIRCLE_RADIUS + 10}" cy="${CIRCLE_RADIUS + 10}" r="5" 
              fill="${ARROW_COLOR}" />
      <line class="direction-arrow" 
            x1="${CIRCLE_RADIUS + 10}" y1="${CIRCLE_RADIUS + 10}" 
            x2="${CIRCLE_RADIUS + 10}" y2="${10}"
            stroke="${ARROW_COLOR}" stroke-width="2" marker-end="url(#arrowhead)" />
    </svg>
  `;

  overlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    z-index: 1000;
    transform: translate(0, 0);
  `;

  return overlay;
}

/**
 * Update the arrow direction based on mouse position
 */
function updateArrowDirection(overlay, angleDeg) {
  const arrow = overlay.querySelector('.direction-arrow');
  const cx = CIRCLE_RADIUS + 10;
  const cy = CIRCLE_RADIUS + 10;

  // Convert angle to radians (adjust so 0 is pointing up/north)
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;

  // Calculate endpoint on the circle
  const endX = cx + CIRCLE_RADIUS * Math.cos(angleRad);
  const endY = cy + CIRCLE_RADIUS * Math.sin(angleRad);

  arrow.setAttribute('x2', endX);
  arrow.setAttribute('y2', endY);
}

/**
 * Update overlay position to follow the map point
 */
function updateOverlayPosition(map, overlay, lngLat) {
  const point = map.project(lngLat);
  overlay.style.left = `${point.x}px`;
  overlay.style.top = `${point.y}px`;
}

/**
 * Open Google Street View at the given location with heading
 */
function openStreetView(lat, lng, heading) {
  // Google Street View URL with position and heading
  // pitch: 0 = horizontal, fov: 90 = default field of view
  const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}&heading=${heading}&pitch=0&fov=90`;
  window.open(url, '_blank');
}

/**
 * Exit street view mode and clean up
 */
function exitStreetViewMode(map) {
  if (streetViewMode.overlay) {
    streetViewMode.overlay.remove();
  }

  streetViewMode.active = false;
  streetViewMode.origin = null;
  streetViewMode.heading = 0;
  streetViewMode.overlay = null;

  // Restore cursor to grab
  map.getCanvas().style.cursor = 'grab';
}

/**
 * Initialize Street View mode on a Mapbox map
 */
function initStreetView(context) {
  const map = context.map;
  const container = map.getContainer();

  // Handle option-click to set origin
  map.on('click', (e) => {
    // Only activate on Option/Alt + click
    if (e.originalEvent.altKey) {
      e.preventDefault();

      // If already in street view mode, update origin
      if (streetViewMode.active) {
        exitStreetViewMode(map);
      }

      // Enter street view mode
      streetViewMode.active = true;
      streetViewMode.origin = {
        lngLat: e.lngLat,
        lat: e.lngLat.lat,
        lng: e.lngLat.lng
      };

      // Create and add overlay
      streetViewMode.overlay = createOverlay();
      container.appendChild(streetViewMode.overlay);
      updateOverlayPosition(map, streetViewMode.overlay, e.lngLat);

      // Set cursor to default while in street view mode
      map.getCanvas().style.cursor = 'default';

      return;
    }

    // Regular click while in street view mode → open Street View
    if (streetViewMode.active && !e.originalEvent.altKey) {
      const { lat, lng } = streetViewMode.origin;
      const heading = streetViewMode.heading;

      openStreetView(lat, lng, heading);
      exitStreetViewMode(map);
    }
  });

  // Handle mouse move to update arrow direction
  map.on('mousemove', (e) => {
    if (!streetViewMode.active || !streetViewMode.origin) return;

    // Calculate bearing from origin to cursor
    const bearing = calculateBearing(streetViewMode.origin.lngLat, e.lngLat);
    streetViewMode.heading = bearing;

    // Update arrow visual
    updateArrowDirection(streetViewMode.overlay, bearing);
  });

  // Update overlay position when map moves
  map.on('move', () => {
    if (
      streetViewMode.active &&
      streetViewMode.overlay &&
      streetViewMode.origin
    ) {
      updateOverlayPosition(
        map,
        streetViewMode.overlay,
        streetViewMode.origin.lngLat
      );
    }
  });

  // Cancel on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && streetViewMode.active) {
      exitStreetViewMode(map);
    }

    // When Option/Alt is pressed (and not already in street view mode), show crosshair cursor
    if (e.key === 'Alt' && !streetViewMode.active) {
      map.getCanvas().style.cursor = 'crosshair';
    }
  });

  // When Option/Alt is released without clicking, restore cursor
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && !streetViewMode.active) {
      map.getCanvas().style.cursor = 'grab';
    }
  });
}

module.exports = initStreetView;
