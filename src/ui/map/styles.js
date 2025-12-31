module.exports = [
  {
    title: 'Standard',
    style: 'mapbox://styles/mapbox/standard'
  },
  {
    title: 'Standard Satellite',
    style: 'mapbox://styles/mapbox/standard-satellite'
  },
  {
    title: 'Standard Light',
    style: 'mapbox://styles/mapbox/standard',
    config: {
      basemap: {
        theme: 'monochrome'
      }
    }
  },
  {
    title: 'Standard Dark',
    style: 'mapbox://styles/mapbox/standard',
    config: {
      basemap: {
        theme: 'monochrome',
        lightPreset: 'night'
      }
    }
  },
  {
    title: 'MTA light',
    style: 'mapbox://styles/wfisher/cmjt9n67e000101rd80g24e01'
  },
  {
    title: 'OSM',
    style: {
      name: 'osm',
      version: 8,
      glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
      sources: {
        'osm-raster-tiles': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      },
      layers: [
        {
          id: 'osm-raster-layer',
          type: 'raster',
          source: 'osm-raster-tiles',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    }
  }
];
