const tape = require('tape');
const z = require('../src/lib/z');

tape('decodeNycPayload decodes line deltas from reference', (t) => {
  const payload = {
    v: 2,
    r: [-73985000, 40750000],
    f: [
      {
        p: { route: 'bx23' },
        g: {
          t: 'LineString',
          d: [1000, 0, 500, 1000, 300, 500]
        }
      }
    ]
  };

  const geojson = z.decodeNycPayload(payload);
  const coordinates = geojson.features[0].geometry.coordinates;

  t.deepEqual(coordinates[0], [-73.984, 40.75], 'first point uses ref offset');
  t.deepEqual(
    coordinates[1],
    [-73.9835, 40.751],
    'second point uses coordinate deltas'
  );
  t.deepEqual(
    coordinates[2],
    [-73.9832, 40.7515],
    'third point uses cumulative deltas'
  );
  t.end();
});

tape('decodeNycPayload supports compact polygon aliases', (t) => {
  const payload = {
    v: 2,
    r: [-73985000, 40750000],
    f: [
      {
        g: {
          t: 'pg',
          d: [[1000, 0, 500, 1000, -500, 0, 0, -1000]]
        }
      }
    ]
  };

  const geojson = z.decodeNycPayload(payload);
  t.equal(geojson.features[0].geometry.type, 'Polygon', 'maps pg alias');
  t.equal(
    geojson.features[0].geometry.coordinates[0].length,
    4,
    'decodes polygon ring points'
  );
  t.end();
});

tape('decodeNycPayload supports feature-level compact point geometry', (t) => {
  const payload = {
    v: 2,
    r: [-73985000, 40758000],
    f: [{ d: [-8000, -8000], t: 'p' }]
  };

  const geojson = z.decodeNycPayload(payload);
  t.equal(geojson.features[0].geometry.type, 'Point', 'maps p alias to Point');
  t.deepEqual(
    geojson.features[0].geometry.coordinates,
    [-73.993, 40.75],
    'decodes point from reference offset'
  );
  t.end();
});

tape(
  'decodeNycPayload decodes mixed geometries with per-feature properties',
  (t) => {
    const payload = {
      v: 2,
      r: [-73985000, 40758000],
      f: [
        {
          i: 'pt-1',
          p: { kind: 'stop', name: 'Grand Central', color: '#e11d48' },
          t: 'p',
          d: [-7000, -8000]
        },
        {
          i: 'line-1',
          p: { kind: 'route', name: 'M15', speed: 12.7 },
          t: 'l',
          d: [-9000, -7000, 800, 500, 900, 600, 700, 400]
        },
        {
          i: 'poly-1',
          p: { kind: 'zone', name: 'Midtown', priority: 2, active: true },
          t: 'pg',
          d: [[-12000, -9000, 5000, 0, 0, 4000, -5000, 0, 0, -4000]]
        },
        {
          i: 'mp-1',
          p: { kind: 'sensors', count: 3, status: 'ok' },
          t: 'mp',
          d: [
            [-6000, -6000],
            [-5500, -6400],
            [-5200, -6100]
          ]
        },
        {
          i: 'ml-1',
          p: { kind: 'branches', name: 'split' },
          t: 'ml',
          d: [
            [-10000, -4000, 1200, 700, 1000, 800],
            [-7800, -4200, 1000, -700, 900, -600]
          ]
        },
        {
          i: 'mpg-1',
          p: { kind: 'districts', name: 'two-boxes' },
          t: 'mpg',
          d: [
            [[-3000, -3000, 1200, 0, 0, 1200, -1200, 0, 0, -1200]],
            [[1000, 1000, 900, 0, 0, 900, -900, 0, 0, -900]]
          ]
        }
      ]
    };

    const geojson = z.decodeNycPayload(payload);

    t.equal(geojson.type, 'FeatureCollection', 'returns a FeatureCollection');
    t.equal(geojson.features.length, 6, 'decodes six features');

    t.equal(geojson.features[0].geometry.type, 'Point', 'decodes Point');
    t.equal(
      geojson.features[0].properties.kind,
      'stop',
      'keeps Point properties'
    );
    t.deepEqual(
      geojson.features[0].geometry.coordinates,
      [-73.992, 40.75],
      'decodes Point coordinates'
    );

    t.equal(
      geojson.features[1].geometry.type,
      'LineString',
      'decodes LineString'
    );
    t.equal(
      geojson.features[1].properties.speed,
      12.7,
      'keeps LineString properties'
    );
    t.equal(
      geojson.features[1].geometry.coordinates.length,
      4,
      'decodes LineString points'
    );

    t.equal(geojson.features[2].geometry.type, 'Polygon', 'decodes Polygon');
    t.equal(
      geojson.features[2].properties.active,
      true,
      'keeps Polygon properties'
    );
    t.equal(
      geojson.features[2].geometry.coordinates[0].length,
      5,
      'decodes Polygon ring points'
    );

    t.equal(
      geojson.features[3].geometry.type,
      'MultiPoint',
      'decodes MultiPoint'
    );
    t.equal(
      geojson.features[3].properties.count,
      3,
      'keeps MultiPoint properties'
    );
    t.equal(
      geojson.features[3].geometry.coordinates.length,
      3,
      'decodes MultiPoint coordinates'
    );

    t.equal(
      geojson.features[4].geometry.type,
      'MultiLineString',
      'decodes MultiLineString'
    );
    t.equal(
      geojson.features[4].properties.name,
      'split',
      'keeps MultiLineString properties'
    );
    t.equal(
      geojson.features[4].geometry.coordinates.length,
      2,
      'decodes MultiLineString lines'
    );

    t.equal(
      geojson.features[5].geometry.type,
      'MultiPolygon',
      'decodes MultiPolygon'
    );
    t.equal(
      geojson.features[5].properties.kind,
      'districts',
      'keeps MultiPolygon properties'
    );
    t.equal(
      geojson.features[5].geometry.coordinates.length,
      2,
      'decodes MultiPolygon polygons'
    );

    t.end();
  }
);
