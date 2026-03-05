const clone = require('clone');
const { NEARMAP_API_KEY } = require('../../constants');
const FADED_LIGHT_STYLE = require('../../../faded-light-style.json');

function withSatelliteVisibility(visible) {
  const style = clone(FADED_LIGHT_STYLE);
  const satelliteLayer = style.layers.find(({ id }) => id === 'satellite');

  if (satelliteLayer) {
    satelliteLayer.layout = {
      ...(satelliteLayer.layout || {}),
      visibility: visible ? 'visible' : 'none'
    };
  }

  return style;
}

const FADED_LIGHT_STREETS_STYLE = withSatelliteVisibility(false);
const FADED_LIGHT_SATELLITE_STYLE = withSatelliteVisibility(true);

module.exports = [
  {
    title: 'Streets light',
    style: FADED_LIGHT_STREETS_STYLE
  },
  {
    title: 'Streets dark',
    style: 'mapbox://styles/mapbox/standard',
    config: {
      basemap: {
        theme: 'monochrome',
        lightPreset: 'night'
      }
    }
  },
  {
    title: 'Mapbox satellite',
    style: FADED_LIGHT_SATELLITE_STYLE
  },
  {
    title: 'Nearmap',
    style: {
      name: 'nearmap',
      version: 8,
      glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
      sources: {
        'nearmap-tiles': {
          type: 'raster',
          tiles: [
            'https://us0.nearmap.com/maps?z={z}&x={x}&y={y}&version=2&nml=Vert&client=wmts_integration&httpauth=false&apikey=' +
              NEARMAP_API_KEY
          ],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.nearmap.com">Nearmap</a>'
        }
      },
      layers: [
        {
          id: 'nearmap-layer',
          type: 'raster',
          source: 'nearmap-tiles',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  }
];
