/**
 * Street View Mode
 *
 * Hold Option to place an orange dot at cursor. Move mouse to aim the arrow.
 * Click to open Google Street View at the dot location, looking in the arrow direction.
 * Release Option or press Escape to cancel.
 */

const turfBearing = require('@turf/bearing').default;

const ARROW_COLOR = '#FF6B35';

const streetViewMode = {
  active: false,
  origin: null, // { lngLat, lat, lng }
  heading: 0,
  overlay: null
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
 * Create the overlay element (just the orange dot - arrow is drawn separately)
 */
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'street-view-overlay';
  overlay.innerHTML = `
    <svg class="dot-svg" width="20" height="20" style="position: absolute; left: -10px; top: -10px;">
      <circle cx="10" cy="10" r="5" fill="${ARROW_COLOR}" />
    </svg>
  `;

  overlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    z-index: 1000;
  `;

  return overlay;
}

/**
 * Create the arrow SVG element that spans the map container
 */
function createArrowSvg(container) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('street-view-arrow');
  svg.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 999;
  `;
  svg.innerHTML = `
    <defs>
      <marker id="sv-arrowhead" markerWidth="5" markerHeight="4" 
              refX="4.5" refY="2" orient="auto" fill="${ARROW_COLOR}">
        <polygon points="0 0, 5 2, 0 4" />
      </marker>
    </defs>
    <line class="direction-arrow" x1="0" y1="0" x2="0" y2="0"
          stroke="${ARROW_COLOR}" stroke-width="2" marker-end="url(#sv-arrowhead)" />
  `;
  container.appendChild(svg);
  return svg;
}

/**
 * Update the arrow to point from origin to cursor screen position
 */
function updateArrow(arrowSvg, originPoint, cursorPoint) {
  const arrow = arrowSvg.querySelector('.direction-arrow');
  if (arrow) {
    arrow.setAttribute('x1', originPoint.x);
    arrow.setAttribute('y1', originPoint.y);
    arrow.setAttribute('x2', cursorPoint.x);
    arrow.setAttribute('y2', cursorPoint.y);
  }
}

/**
 * Update overlay (dot) position to follow the map point
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
function exitStreetViewMode(map, arrowSvg) {
  if (streetViewMode.overlay) {
    streetViewMode.overlay.remove();
  }
  if (arrowSvg) {
    arrowSvg.remove();
  }

  streetViewMode.active = false;
  streetViewMode.origin = null;
  streetViewMode.heading = 0;
  streetViewMode.overlay = null;

  // Re-enable map dragging
  map.dragPan.enable();

  // Restore cursor to grab
  map.getCanvas().style.cursor = 'grab';
}

/**
 * Initialize Street View mode on a Mapbox map
 */
function initStreetView(context) {
  const map = context.map;
  const container = map.getContainer();

  // Track current mouse position
  let currentMouseLngLat = null;

  // Arrow SVG element (created when entering street view mode)
  let arrowSvg = null;

  // Handle clicks
  map.on('click', (e) => {
    // Click while in street view mode → open Street View
    if (streetViewMode.active && e.originalEvent.altKey) {
      const { lat, lng } = streetViewMode.origin;
      const heading = streetViewMode.heading;

      openStreetView(lat, lng, heading);
      exitStreetViewMode(map, arrowSvg);
      arrowSvg = null;
    }
  });

  // Handle mouse move to track position and update arrow
  map.on('mousemove', (e) => {
    // Always track mouse position
    currentMouseLngLat = e.lngLat;

    // Update arrow if in street view mode
    if (streetViewMode.active && streetViewMode.origin && arrowSvg) {
      // Calculate bearing from origin to cursor
      const bearing = calculateBearing(streetViewMode.origin.lngLat, e.lngLat);
      streetViewMode.heading = bearing;

      // Update arrow to point from origin to cursor
      const originPoint = map.project(streetViewMode.origin.lngLat);
      const cursorPoint = map.project(e.lngLat);
      updateArrow(arrowSvg, originPoint, cursorPoint);
    }
  });

  // Update overlay position when map moves
  map.on('move', () => {
    if (streetViewMode.active && streetViewMode.overlay && streetViewMode.origin) {
      updateOverlayPosition(map, streetViewMode.overlay, streetViewMode.origin.lngLat);
    }
  });

  // Handle keydown events
  document.addEventListener('keydown', (e) => {
    // Cancel on Escape
    if (e.key === 'Escape' && streetViewMode.active) {
      exitStreetViewMode(map, arrowSvg);
      arrowSvg = null;
      return;
    }

    // When Option/Alt is pressed, enter street view mode at current mouse position
    if (e.key === 'Alt' && !streetViewMode.active && currentMouseLngLat) {
      streetViewMode.active = true;
      streetViewMode.origin = {
        lngLat: currentMouseLngLat,
        lat: currentMouseLngLat.lat,
        lng: currentMouseLngLat.lng
      };
      streetViewMode.heading = 90; // Default heading east

      // Create and add the dot overlay
      streetViewMode.overlay = createOverlay();
      container.appendChild(streetViewMode.overlay);
      updateOverlayPosition(map, streetViewMode.overlay, currentMouseLngLat);

      // Create the arrow SVG
      arrowSvg = createArrowSvg(container);
      const originPoint = map.project(currentMouseLngLat);
      updateArrow(arrowSvg, originPoint, originPoint); // Arrow starts at origin

      // Disable map dragging while in street view mode
      map.dragPan.disable();

      map.getCanvas().style.cursor = 'crosshair';
    }
  });

  // Handle keyup events
  document.addEventListener('keyup', (e) => {
    // When Option/Alt is released, cancel street view mode
    if (e.key === 'Alt') {
      if (streetViewMode.active) {
        exitStreetViewMode(map, arrowSvg);
        arrowSvg = null;
      }
      map.getCanvas().style.cursor = 'grab';
    }
  });
}

module.exports = initStreetView;
