const styles = require('./map/styles');
const { DEFAULT_STYLE, NEARMAP_API_KEY } = require('../constants');

async function getNearmapCaptureDateViaCoverageApi(map) {
  // Nearmap Coverage API (point endpoint)
  const center = map.getCenter();
  const lng = center.lng;
  const lat = center.lat;

  // Keep plenty of precision while still stable for caching.
  const lngStr = lng.toFixed(6);
  const latStr = lat.toFixed(6);

  const url = `https://api.nearmap.com/coverage/v2/point/${lngStr},${latStr}?apikey=${NEARMAP_API_KEY}&limit=2`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return null;

  const data = await res.json();
  const surveys = data && data.surveys;
  if (!Array.isArray(surveys) || surveys.length === 0) return null;

  // Pick the newest capture date.
  let best = null;
  for (const s of surveys) {
    const raw = s.captureDateTime || s.captureDate;
    const isDateOnly = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw);
    const d = raw
      ? new Date(isDateOnly ? `${raw}T00:00:00Z` : raw)
      : new Date(NaN);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }

  if (!best) return null;
  return best.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

module.exports = function (context) {
  return function (selection) {
    const getMap = () => {
      return typeof context.map === 'function' ? null : context.map;
    };

    const layerSwitch = selection
      .append('div')
      .attr('class', 'layer-switch absolute left-0 bottom-0 mb-9 text-xs z-10');

    const nearmapDateLabel = layerSwitch
      .append('div')
      .attr('class', 'nearmap-date hidden');

    const layerButtons = layerSwitch.selectAll('button').data(styles);

    let nearmapMoveHandler = null;
    let nearmapDebounce = null;
    let lastRequestedKey = null;
    let activeRequestId = 0;
    const coverageCache = new Map(); // key -> formatted "Mon YYYY"

    function positionNearmapLabel() {
      const nearmapBtn = layerButtons
        .filter((d) => d.title === 'Nearmap')
        .node();
      if (!nearmapBtn) return;
      nearmapDateLabel.style('left', `${nearmapBtn.offsetLeft}px`);
    }

    async function updateNearmapDateLabel() {
      // Only update if Nearmap is the active style
      const activeTitle = context.storage.get('style') || DEFAULT_STYLE;
      if (activeTitle !== 'Nearmap') return;

      positionNearmapLabel();

      const map = context.map;
      if (!map || !map._loaded) return;

      const center = map.getCenter();
      const coverageKey = `${center.lng.toFixed(4)},${center.lat.toFixed(4)}`;
      if (coverageKey === lastRequestedKey) return;
      lastRequestedKey = coverageKey;

      if (coverageCache.has(coverageKey)) {
        nearmapDateLabel.text(coverageCache.get(coverageKey));
        nearmapDateLabel.classed('hidden', false);
        return;
      }

      // No loading state: keep existing date until a new one arrives.
      // If we don’t have an existing date yet, keep the label hidden.
      const hasExistingDate = !!nearmapDateLabel.text();
      nearmapDateLabel.classed('hidden', !hasExistingDate);

      const requestId = ++activeRequestId;
      let formatted = null;

      try {
        formatted = await getNearmapCaptureDateViaCoverageApi(map);
      } catch (e) {
        formatted = null;
      }

      // Ignore out-of-order responses.
      if (requestId !== activeRequestId) return;

      if (formatted) {
        coverageCache.set(coverageKey, formatted);
        nearmapDateLabel.text(formatted);
        nearmapDateLabel.classed('hidden', false);
      }
    }

    function scheduleNearmapUpdate() {
      if (nearmapDebounce) clearTimeout(nearmapDebounce);
      nearmapDebounce = setTimeout(() => {
        nearmapDebounce = null;
        updateNearmapDateLabel();
      }, 400);
    }

    function enableNearmapDateUi() {
      nearmapDateLabel.classed('hidden', false);
      positionNearmapLabel();
      scheduleNearmapUpdate();

      if (!nearmapMoveHandler) {
        const map = getMap();
        if (!map) return;

        nearmapMoveHandler = () => scheduleNearmapUpdate();
        map.on('moveend', nearmapMoveHandler);
        map.on('zoomend', nearmapMoveHandler);
      }
    }

    function disableNearmapDateUi() {
      nearmapDateLabel.text('');
      nearmapDateLabel.classed('hidden', true);

      if (nearmapMoveHandler) {
        const map = getMap();
        if (map) {
          map.off('moveend', nearmapMoveHandler);
          map.off('zoomend', nearmapMoveHandler);
        }
        nearmapMoveHandler = null;
      }
    }

    const layerSwap = function () {
      const clicked = this instanceof d3.selection ? this.node() : this;
      layerButtons.classed('active', function () {
        return clicked === this;
      });

      // set user-layer button to inactive
      d3.select('.user-layer-button').classed('active', false);

      const map = getMap();

      // this will likely run before the initial map style is loaded
      // streets is default, but on subsequent runs we must change styles
      if (map && map._loaded) {
        const { title, style, config } = d3.select(clicked).datum();

        map.setStyle(style, {
          ...(config ? { config } : {})
        });

        context.storage.set('style', title);

        context.data.set({
          mapStyleLoaded: true
        });

        if (title === 'Nearmap') {
          enableNearmapDateUi();
        } else {
          disableNearmapDateUi();
        }
      }
    };

    layerButtons
      .enter()
      .append('button')
      .attr('class', 'pad0x')
      .on('click', layerSwap)
      .text((d) => {
        return d.title;
      });

    const activeStyle = context.storage.get('style') || DEFAULT_STYLE;

    // Check if activeStyle exists in styles array, default to 'MTA light' if not
    const styleExists = styles.some(({ title }) => title === activeStyle);
    const correctedStyle = styleExists ? activeStyle : 'MTA light';

    // Update localStorage if we had to correct the style
    if (!styleExists) {
      context.storage.set('style', correctedStyle);
    }

    layerButtons
      .filter(({ title }) => {
        return title === correctedStyle;
      })
      .call(layerSwap);

    // If the saved style is Nearmap and the map finishes loading after the UI
    // renders, enable the date label once.
    setTimeout(() => {
      const map = getMap();
      if (!map || typeof map.on !== 'function') return;
      map.on('load', () => {
        const activeTitle = context.storage.get('style') || DEFAULT_STYLE;
        if (activeTitle === 'Nearmap') enableNearmapDateUi();
      });
      window.addEventListener('resize', positionNearmapLabel);
    }, 0);
  };
};
