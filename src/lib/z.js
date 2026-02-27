const MICRO_DEGREES = 1e6;

module.exports.decodeZGeoJSON = decodeZGeoJSON;
module.exports.decodeNycPayload = decodeNycPayload;

async function decodeZGeoJSON(encoded) {
  if (!encoded || typeof encoded !== 'string') {
    throw new Error('z payload is empty');
  }

  const compressed = decodeBase64Url(encoded);
  const inflated = await inflateDeflate(compressed);
  const text = decodeUtf8(inflated);
  const payload = JSON.parse(text);
  return decodeNycPayload(payload);
}

function decodeNycPayload(payload) {
  if (payload && payload.type === 'FeatureCollection' && payload.features) {
    return payload;
  }

  if (!payload || payload.v !== 2) {
    throw new Error('Unsupported z payload version');
  }

  const reference = readReference(payload.r);
  const compactFeatures = Array.isArray(payload.f)
    ? payload.f
    : Array.isArray(payload.features)
    ? payload.features
    : [];

  return {
    type: 'FeatureCollection',
    features: compactFeatures.map((feature) => {
      return decodeFeature(feature, reference);
    })
  };
}

function decodeFeature(feature, reference) {
  if (!feature || typeof feature !== 'object') {
    throw new Error('Invalid z feature');
  }

  if (feature.type === 'Feature' && feature.geometry) {
    return feature;
  }

  const geometryPayload = resolveGeometryPayload(feature);
  const geometry = decodeGeometry(geometryPayload, reference);
  const decodedFeature = {
    type: 'Feature',
    properties: feature.p && typeof feature.p === 'object' ? feature.p : {},
    geometry: geometry
  };

  if (Object.prototype.hasOwnProperty.call(feature, 'i')) {
    decodedFeature.id = feature.i;
  } else if (Object.prototype.hasOwnProperty.call(feature, 'id')) {
    decodedFeature.id = feature.id;
  }

  return decodedFeature;
}

function resolveGeometryPayload(feature) {
  if (feature.g || feature.geometry) return feature.g || feature.geometry;

  // Support compact feature-level geometry where { t, d, r, c } live directly on feature.
  if (
    Object.prototype.hasOwnProperty.call(feature, 't') ||
    Object.prototype.hasOwnProperty.call(feature, 'd') ||
    Object.prototype.hasOwnProperty.call(feature, 'r') ||
    Object.prototype.hasOwnProperty.call(feature, 'c')
  ) {
    return feature;
  }

  throw new Error('Invalid z geometry');
}

function decodeGeometry(geometry, defaultReference) {
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Invalid z geometry');
  }

  if (
    geometry.type &&
    Object.prototype.hasOwnProperty.call(geometry, 'coordinates')
  ) {
    return geometry;
  }

  const type = normalizeGeometryType(geometry.t || geometry.type);
  const reference = readReference(geometry.r || defaultReference);

  if (type === 'GeometryCollection') {
    const geometries = geometry.c || geometry.geometries;
    if (!Array.isArray(geometries)) {
      throw new Error('Invalid z GeometryCollection payload');
    }

    return {
      type: 'GeometryCollection',
      geometries: geometries.map((item) => decodeGeometry(item, reference))
    };
  }

  const coordinates = decodeCoordinates(
    type,
    Object.prototype.hasOwnProperty.call(geometry, 'd')
      ? geometry.d
      : geometry.coordinates,
    reference
  );

  return {
    type: type,
    coordinates: coordinates
  };
}

function normalizeGeometryType(type) {
  const aliases = {
    p: 'Point',
    mp: 'MultiPoint',
    l: 'LineString',
    ml: 'MultiLineString',
    pt: 'Point',
    mpt: 'MultiPoint',
    ls: 'LineString',
    mls: 'MultiLineString',
    pg: 'Polygon',
    mpg: 'MultiPolygon',
    gc: 'GeometryCollection'
  };
  const normalized = aliases[type] || type;

  if (!normalized || typeof normalized !== 'string') {
    throw new Error('Invalid z geometry type');
  }

  return normalized;
}

function decodeCoordinates(type, payload, reference) {
  switch (type) {
    case 'Point':
      return decodePoint(payload, reference);
    case 'MultiPoint':
      return decodeMultiPoint(payload, reference);
    case 'LineString':
      return decodeLine(payload, reference);
    case 'MultiLineString':
      if (
        Array.isArray(payload) &&
        payload.length &&
        typeof payload[0] === 'number'
      ) {
        return [decodeLine(payload, reference)];
      }
      return decodeNestedLines(payload, reference);
    case 'Polygon':
      if (
        Array.isArray(payload) &&
        payload.length &&
        typeof payload[0] === 'number'
      ) {
        return [decodeLine(payload, reference)];
      }
      return decodeNestedLines(payload, reference);
    case 'MultiPolygon':
      return decodeMultiPolygon(payload, reference);
    default:
      throw new Error('Unsupported z geometry type: ' + type);
  }
}

function decodePoint(payload, reference) {
  const tuple = readPair(payload);
  return toCoordinates(reference[0] + tuple[0], reference[1] + tuple[1]);
}

function decodeMultiPoint(payload, reference) {
  if (!Array.isArray(payload)) throw new Error('Invalid z MultiPoint payload');
  if (!payload.length) return [];

  if (typeof payload[0] === 'number') {
    return decodeLine(payload, reference);
  }

  return payload.map((entry) => decodePoint(entry, reference));
}

function decodeLine(payload, reference) {
  const values = flattenPairs(payload);
  if (!values.length) return [];
  if (values.length % 2 !== 0) throw new Error('Invalid z coordinate payload');

  let lng = reference[0] + values[0];
  let lat = reference[1] + values[1];
  const coordinates = [toCoordinates(lng, lat)];

  for (let i = 2; i < values.length; i += 2) {
    lng += values[i];
    lat += values[i + 1];
    coordinates.push(toCoordinates(lng, lat));
  }

  return coordinates;
}

function decodeNestedLines(payload, reference) {
  if (!Array.isArray(payload)) throw new Error('Invalid z nested payload');
  return payload.map((line) => decodeLine(line, reference));
}

function decodeMultiPolygon(payload, reference) {
  if (!Array.isArray(payload))
    throw new Error('Invalid z MultiPolygon payload');
  return payload.map((polygon) => decodeNestedLines(polygon, reference));
}

function readReference(reference) {
  const tuple = readPair(reference);
  return [tuple[0], tuple[1]];
}

function readPair(pair) {
  if (!Array.isArray(pair) || pair.length < 2) {
    throw new Error('Invalid z coordinate tuple');
  }

  if (typeof pair[0] !== 'number' || typeof pair[1] !== 'number') {
    throw new Error('Invalid z coordinate tuple');
  }

  return [pair[0], pair[1]];
}

function flattenPairs(payload) {
  if (!Array.isArray(payload)) throw new Error('Invalid z coordinate payload');
  if (!payload.length) return [];

  if (typeof payload[0] === 'number') {
    return payload;
  }

  return payload.reduce((memo, pair) => {
    const tuple = readPair(pair);
    memo.push(tuple[0], tuple[1]);
    return memo;
  }, []);
}

function toCoordinates(lngE6, latE6) {
  return [lngE6 / MICRO_DEGREES, latE6 / MICRO_DEGREES];
}

function decodeBase64Url(encoded) {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const mod = normalized.length % 4;
  const padded = mod ? normalized + '='.repeat(4 - mod) : normalized;

  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(padded, 'base64'));
  }

  throw new Error('No base64 decoder available');
}

async function inflateDeflate(compressedBytes) {
  const scope = typeof window !== 'undefined' ? window : global;
  const DecompressionStreamCtor = scope.DecompressionStream;

  if (typeof DecompressionStreamCtor !== 'function') {
    throw new Error('Browser does not support z decompression');
  }

  const formats = ['deflate', 'deflate-raw'];
  let error = null;

  for (let i = 0; i < formats.length; i++) {
    try {
      const stream = new Blob([compressedBytes])
        .stream()
        .pipeThrough(new DecompressionStreamCtor(formats[i]));
      const buffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(buffer);
    } catch (e) {
      error = e;
    }
  }

  throw error || new Error('Could not inflate z payload');
}

function decodeUtf8(bytes) {
  if (typeof TextDecoder === 'function') {
    return new TextDecoder().decode(bytes);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('utf8');
  }

  throw new Error('No UTF-8 decoder available');
}
