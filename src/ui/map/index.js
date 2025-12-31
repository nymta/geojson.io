const mapboxgl = require('mapbox-gl');

require('qs-hash');
const geojsonRewind = require('@mapbox/geojson-rewind');
const MapboxDraw = require('@mapbox/mapbox-gl-draw').default;
const MapboxGeocoder = require('@mapbox/mapbox-gl-geocoder');

const DrawLineString = require('../draw/linestring');
const DrawRectangle = require('../draw/rectangle');
const DrawCircle = require('../draw/circle');
const SimpleSelect = require('../draw/simple_select');
const ExtendDrawBar = require('../draw/extend_draw_bar');
const {
  EditControl,
  SaveCancelControl,
  TrashControl,
  VertexViewControl
} = require('./controls');
const { geojsonToLayer, bindPopup } = require('./util');
const styles = require('./styles');
const {
  DEFAULT_STYLE,
  DEFAULT_PROJECTION,
  DEFAULT_DARK_FEATURE_COLOR,
  DEFAULT_LIGHT_FEATURE_COLOR,
  DEFAULT_SATELLITE_FEATURE_COLOR,
  DEFAULT_3D_BUILDINGS
} = require('../../constants');
const drawStyles = require('../draw/styles');

let writable = false;
let drawing = false;
let editing = false;
let viewingVertices = false;

const dummyGeojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [0, 0]
      }
    }
  ]
};

module.exports = function (context, readonly) {
  writable = !readonly;

  // keyboard shortcuts
  const keybinding = d3
    .keybinding('map')
    // delete key triggers draw.trash()
    .on('⌫', () => {
      if (editing) {
        context.Draw.trash();
      }
    })
    .on('m', () => {
      if (!editing) {
        context.Draw.changeMode('draw_point');
      }
    })
    .on('l', () => {
      if (!editing) {
        context.Draw.changeMode('draw_line_string');
      }
    })
    .on('p', () => {
      if (!editing) {
        context.Draw.changeMode('draw_polygon');
      }
    })
    .on('r', () => {
      if (!editing) {
        context.Draw.changeMode('draw_rectangle');
      }
    })
    .on('c', () => {
      if (!editing) {
        context.Draw.changeMode('draw_circle');
      }
    });

  d3.select(document).call(keybinding);

  function maybeShowEditControl() {
    // if there are features, show the edit button and vertex view button
    if (context.data.hasFeatures()) {
      d3.select('.edit-control').style('display', 'block');
      d3.select('.vertex-view-control').style('display', 'block');
    }
  }

  function map() {
    mapboxgl.accessToken =
      'pk.eyJ1Ijoid2Zpc2hlciIsImEiOiJjanJsYTVyOWMwNmY3NDNuM3lrdGNhdHB5In0.mUVzIPzlPqp4waXsP1s6PQ';

    mapboxgl.setRTLTextPlugin(
      'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
      null,
      true
    );

    const projection = context.storage.get('projection') || DEFAULT_PROJECTION;
    const activeStyle = context.storage.get('style') || DEFAULT_STYLE;

    const foundStyle = styles.find((d) => d.title === activeStyle);
    const { style, config } =
      foundStyle || styles.find((d) => d.title === 'Standard');

    context.map = new mapboxgl.Map({
      container: 'map',
      style,
      ...(config ? { config } : {}),
      center: [-73.9855, 40.758], // Times Square
      zoom: 13, // Shows the five boroughs
      projection,
      hash: 'map'
    });

    if (writable) {
      context.map.addControl(
        new MapboxGeocoder({
          accessToken: mapboxgl.accessToken,
          mapboxgl,
          marker: true
        })
      );

      context.Draw = new MapboxDraw({
        displayControlsDefault: false,
        modes: {
          ...MapboxDraw.modes,
          simple_select: SimpleSelect,
          direct_select: MapboxDraw.modes.direct_select,
          draw_line_string: DrawLineString,
          draw_rectangle: DrawRectangle,
          draw_circle: DrawCircle
        },
        controls: {},
        styles: drawStyles
      });

      const drawControl = new ExtendDrawBar({
        draw: context.Draw,
        buttons: [
          {
            on: 'click',
            action: () => {
              drawing = true;
              context.Draw.changeMode('draw_point');
            },
            classes: ['mapbox-gl-draw_ctrl-draw-btn', 'mapbox-gl-draw_point'],
            title: 'Draw Point (m)'
          },
          {
            on: 'click',
            action: () => {
              drawing = true;
              context.Draw.changeMode('draw_line_string');
            },
            classes: ['mapbox-gl-draw_ctrl-draw-btn', 'mapbox-gl-draw_line'],
            title: 'Draw LineString (l)'
          },
          {
            on: 'click',
            action: () => {
              drawing = true;
              context.Draw.changeMode('draw_polygon');
            },
            classes: ['mapbox-gl-draw_ctrl-draw-btn', 'mapbox-gl-draw_polygon'],
            title: 'Draw Polygon (p)'
          },
          {
            on: 'click',
            action: () => {
              drawing = true;
              context.Draw.changeMode('draw_rectangle');
            },
            classes: [
              'mapbox-gl-draw_ctrl-draw-btn',
              'mapbox-gl-draw_rectangle'
            ],
            title: 'Draw Rectangular Polygon (r)'
          },
          {
            on: 'click',
            action: () => {
              drawing = true;
              context.Draw.changeMode('draw_circle');
            },
            classes: ['mapbox-gl-draw_ctrl-draw-btn', 'mapbox-gl-draw_circle'],
            title: 'Draw Circular Polygon (c)'
          }
        ]
      });

      context.map.addControl(new mapboxgl.NavigationControl());

      context.map.addControl(drawControl, 'top-right');

      const editControl = new EditControl();
      context.map.addControl(editControl, 'top-right');

      const vertexViewControl = new VertexViewControl();
      context.map.addControl(vertexViewControl, 'top-right');

      const saveCancelControl = new SaveCancelControl();

      context.map.addControl(saveCancelControl, 'top-right');

      const trashControl = new TrashControl();

      context.map.addControl(trashControl, 'top-right');

      const exitEditMode = () => {
        editing = false;
        // show the data layers
        context.map.setLayoutProperty('map-data-fill', 'visibility', 'visible');
        context.map.setLayoutProperty(
          'map-data-fill-outline',
          'visibility',
          'visible'
        );
        context.map.setLayoutProperty('map-data-line', 'visibility', 'visible');
        context.map.setLayoutProperty(
          'map-data-line-hitbox',
          'visibility',
          'visible'
        );

        // show markers
        d3.selectAll('.mapboxgl-marker').style('display', 'block');

        // clean up draw
        context.Draw.changeMode('simple_select');
        context.Draw.deleteAll();

        // hide the save/cancel control and the delete control
        d3.select('.save-cancel-control').style('display', 'none');
        d3.select('.trash-control').style('display', 'none');

        // show the edit button, vertex view button, and draw tools
        maybeShowEditControl();
        d3.select('.mapboxgl-ctrl-group:nth-child(3)').style(
          'display',
          'block'
        );
      };

      // handle save or cancel from edit mode
      d3.selectAll('.mapboxgl-draw-actions-btn').on('click', function () {
        const target = d3.select(this);
        const isSaveButton = target.classed('mapboxgl-draw-actions-btn_save');
        if (isSaveButton) {
          const FC = context.Draw.getAll();
          context.data.set(
            {
              map: {
                ...FC,
                features: stripIds(FC.features)
              }
            },
            'map'
          );
        }

        exitEditMode();
      });

      // handle delete
      d3.select('.mapbox-gl-draw_trash').on('click', () => {
        context.Draw.trash();
      });

      // enter edit mode
      d3.selectAll('.mapbox-gl-draw_edit').on('click', () => {
        editing = true;

        // Exit vertex view mode if active
        if (viewingVertices) {
          viewingVertices = false;
          d3.select('.mapbox-gl-draw_vertex-view').classed('active', false);
          if (context.map.getLayer('vertex-view-fill')) {
            context.map.removeLayer('vertex-view-fill');
          }
          if (context.map.getLayer('vertex-view-border')) {
            context.map.removeLayer('vertex-view-border');
          }
          if (context.map.getSource('vertex-view-data')) {
            context.map.removeSource('vertex-view-data');
          }
        }

        // hide the edit button and draw tools
        d3.select('.edit-control').style('display', 'none');
        d3.select('.vertex-view-control').style('display', 'none');
        d3.select('.mapboxgl-ctrl-group:nth-child(3)').style('display', 'none');

        // show the save/cancel control and the delete control
        d3.select('.save-cancel-control').style('display', 'block');
        d3.select('.trash-control').style('display', 'block');

        // hide the line and polygon data layers
        context.map.setLayoutProperty('map-data-fill', 'visibility', 'none');
        context.map.setLayoutProperty(
          'map-data-fill-outline',
          'visibility',
          'none'
        );
        context.map.setLayoutProperty('map-data-line', 'visibility', 'none');
        context.map.setLayoutProperty(
          'map-data-line-hitbox',
          'visibility',
          'none'
        );

        // hide markers
        d3.selectAll('.mapboxgl-marker').style('display', 'none');

        // import the current data into draw for editing
        const featureIds = context.Draw.add(context.data.get('map'));
        context.Draw.changeMode('simple_select', {
          featureIds
        });
      });

      // Generate vertex point features from all lines and polygons
      const generateVertexFeatures = () => {
        const geojson = context.data.get('map');
        if (!geojson || !geojson.features) return [];

        const vertexFeatures = [];

        geojson.features.forEach((feature) => {
          if (!feature.geometry) return;

          const { type, coordinates } = feature.geometry;
          const props = feature.properties || {};

          // Get the stroke/fill color for this feature
          const color =
            props.stroke || props.fill || DEFAULT_DARK_FEATURE_COLOR;

          // Helper to add vertex points from a coordinate array
          const addVertices = (coords, isRing = false) => {
            const len = coords.length;
            coords.forEach((coord, index) => {
              // For rings (polygons), last coord equals first, so skip it
              if (isRing && index === len - 1) return;

              // Determine vertex type: polygons are all 'middle', lines have start/end
              let vertexType = 'middle';
              if (!isRing) {
                if (index === 0) {
                  vertexType = 'start';
                } else if (index === len - 1) {
                  vertexType = 'end';
                }
              }

              vertexFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: coord
                },
                properties: {
                  vertexType,
                  color
                }
              });
            });
          };

          if (type === 'LineString') {
            addVertices(coordinates, false);
          } else if (type === 'MultiLineString') {
            coordinates.forEach((line) => addVertices(line, false));
          } else if (type === 'Polygon') {
            coordinates.forEach((ring) => addVertices(ring, true));
          } else if (type === 'MultiPolygon') {
            coordinates.forEach((polygon) => {
              polygon.forEach((ring) => addVertices(ring, true));
            });
          }
        });

        return vertexFeatures;
      };

      // Add vertex visualization layers
      const addVertexLayers = () => {
        const vertexFeatures = generateVertexFeatures();

        const vertexGeojson = {
          type: 'FeatureCollection',
          features: vertexFeatures
        };

        // Add source for vertices
        context.map.addSource('vertex-view-data', {
          type: 'geojson',
          data: vertexGeojson
        });

        // Add layer for vertex border
        // Start: same as fill (solid color), End: white, Middle: white
        context.map.addLayer({
          id: 'vertex-view-border',
          type: 'circle',
          source: 'vertex-view-data',
          paint: {
            'circle-radius': 6,
            'circle-color': [
              'case',
              ['==', ['get', 'vertexType'], 'start'],
              ['get', 'color'], // start: border matches fill (solid color)
              '#ffffff' // middle and end: white border
            ]
          }
        });

        // Add layer for vertex fill
        // Start: feature color, End: white, Middle: feature color
        context.map.addLayer({
          id: 'vertex-view-fill',
          type: 'circle',
          source: 'vertex-view-data',
          paint: {
            'circle-radius': 4,
            'circle-color': [
              'case',
              ['==', ['get', 'vertexType'], 'end'],
              '#ffffff', // end: white fill
              ['get', 'color'] // start and middle: feature color
            ]
          }
        });
      };

      // Remove vertex visualization layers
      const removeVertexLayers = () => {
        if (context.map.getLayer('vertex-view-fill')) {
          context.map.removeLayer('vertex-view-fill');
        }
        if (context.map.getLayer('vertex-view-border')) {
          context.map.removeLayer('vertex-view-border');
        }
        if (context.map.getSource('vertex-view-data')) {
          context.map.removeSource('vertex-view-data');
        }
      };

      // Toggle vertex view mode
      d3.selectAll('.mapbox-gl-draw_vertex-view').on('click', function () {
        viewingVertices = !viewingVertices;

        const button = d3.select(this);
        button.classed('active', viewingVertices);

        if (viewingVertices) {
          addVertexLayers();
        } else {
          removeVertexLayers();
        }
      });
    }

    context.map.on('idle', () => {
      if (
        context.data.get('mapStyleLoaded') &&
        !context.map.getSource('map-data')
      ) {
        let color = DEFAULT_DARK_FEATURE_COLOR; // Sets default dark color for lighter base maps

        // switch to darker feature color for dark base maps
        let config;
        const { imports } = context.map.getStyle();

        if (imports && imports.length > 0) {
          config = context.map.getConfig('basemap');
        }

        if (config) {
          // check for Standard Dark or Standard Satellite, these two should use lighter feature colors
          if (config.theme === 'monochrome' && config.lightPreset === 'night') {
            color = DEFAULT_LIGHT_FEATURE_COLOR;
          }

          if (imports[0].data.name === 'Mapbox Standard Satellite') {
            color = DEFAULT_SATELLITE_FEATURE_COLOR;
          }
        }

        context.map.addSource('map-data', {
          type: 'geojson',
          data: dummyGeojson
        });

        context.map.addLayer({
          id: 'map-data-fill',
          type: 'fill',
          source: 'map-data',
          paint: {
            'fill-color': ['coalesce', ['get', 'fill'], color],
            'fill-opacity': ['coalesce', ['get', 'fill-opacity'], 0.3],
            'fill-emissive-strength': 1
          },
          filter: ['==', ['geometry-type'], 'Polygon']
        });

        context.map.addLayer({
          id: 'map-data-fill-outline',
          type: 'line',
          source: 'map-data',
          paint: {
            'line-color': ['coalesce', ['get', 'stroke'], color],
            'line-width': ['coalesce', ['get', 'stroke-width'], 2],
            'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 1],
            'line-emissive-strength': 1
          },
          filter: ['==', ['geometry-type'], 'Polygon']
        });

        // Invisible hitbox layer with larger width for easier hover/click detection
        context.map.addLayer({
          id: 'map-data-line-hitbox',
          type: 'line',
          source: 'map-data',
          paint: {
            'line-color': '#000',
            'line-width': 20,
            'line-opacity': 0
          },
          filter: ['==', ['geometry-type'], 'LineString']
        });

        context.map.addLayer({
          id: 'map-data-line',
          type: 'line',
          source: 'map-data',
          paint: {
            'line-color': ['coalesce', ['get', 'stroke'], color],
            'line-width': ['coalesce', ['get', 'stroke-width'], 2],
            'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 1],
            'line-emissive-strength': 1
          },
          filter: ['==', ['geometry-type'], 'LineString']
        });

        geojsonToLayer(context, writable);

        // Initialize 3D buildings state from localStorage after style is loaded
        // This can't live in `ui/3d-buildings-toggle.js because we have to wait for the map style to be loaded
        const hasKey = context.storage.get('3DBuildings') !== undefined;
        const active3DBuildings = hasKey
          ? context.storage.get('3DBuildings')
          : DEFAULT_3D_BUILDINGS;
        if (context.map.getConfigProperty) {
          context.map.setConfigProperty(
            'basemap',
            'show3dObjects',
            active3DBuildings
          );
        }
        // Update the UI to reflect the active state
        d3.selectAll('.toggle-3D button').classed('active', function () {
          const { value } = d3.select(this).datum();
          return value === active3DBuildings;
        });

        context.data.set({
          mapStyleLoaded: false
        });
      }
    });

    // only show projection toggle on zoom < 6
    // only show 3d Buildings toggle on Zoom > 14
    function updateTogglesByZoom() {
      const zoom = context.map.getZoom();
      const projectionSwitch = d3.select('.projection-switch');
      const toggle3D = d3.select('.toggle-3D');

      // Get current style to check if 3D buildings should be hidden
      const currentStyle = context.storage.get('style') || DEFAULT_STYLE;
      const shouldHide3DForStyle =
        currentStyle === 'OSM' ||
        currentStyle === 'MTA light' ||
        currentStyle === 'Standard Satellite';

      if (zoom < 6) {
        projectionSwitch.style('opacity', 1);
        toggle3D.classed('hidden', true);
      } else if (zoom > 6 && zoom < 14) {
        projectionSwitch.style('opacity', 0);
        toggle3D.classed('hidden', true);
      } else {
        // Hide 3D toggle for OSM and MTA light styles, regardless of zoom
        toggle3D.classed('hidden', shouldHide3DForStyle);
      }
    }
    context.map.on('load', () => updateTogglesByZoom());
    context.map.on('zoomend', () => updateTogglesByZoom());

    const maybeSetCursorToPointer = () => {
      if (context.Draw.getMode() === 'simple_select') {
        context.map.getCanvas().style.cursor = 'pointer';
      }
    };

    const maybeResetCursor = () => {
      if (context.Draw.getMode() === 'simple_select') {
        context.map.getCanvas().style.removeProperty('cursor');
      }
    };

    const handleLinestringOrPolygonClick = (e) => {
      // prevent this popup from opening when the original click was on a marker
      const el = e.originalEvent.target;
      if (el.nodeName !== 'CANVAS') return;
      // prevent this popup from opening when drawing new features
      if (drawing) return;

      bindPopup(e, context, writable);
    };

    context.map.on('load', () => {
      context.data.set({
        mapStyleLoaded: true
      });
      context.map.on('mouseenter', 'map-data-fill', maybeSetCursorToPointer);
      context.map.on('mouseleave', 'map-data-fill', maybeResetCursor);
      context.map.on(
        'mouseenter',
        'map-data-line-hitbox',
        maybeSetCursorToPointer
      );
      context.map.on('mouseleave', 'map-data-line-hitbox', maybeResetCursor);

      context.map.on('click', 'map-data-fill', handleLinestringOrPolygonClick);
      context.map.on(
        'click',
        'map-data-line-hitbox',
        handleLinestringOrPolygonClick
      );
      context.map.on(
        'touchstart',
        'map-data-fill',
        handleLinestringOrPolygonClick
      );
      context.map.on(
        'touchstart',
        'map-data-line-hitbox',
        handleLinestringOrPolygonClick
      );
    });

    context.map.on('draw.create', created);

    function stripIds(features) {
      return features.map((feature) => {
        delete feature.id;
        return feature;
      });
    }

    function created(e) {
      context.Draw.deleteAll();
      update(stripIds(e.features));

      // delay setting drawing back to false after a drawn feature is created
      // this allows the map click handler to ignore the click and prevents a popup
      // if the drawn feature endeds within an existing feature
      setTimeout(() => {
        drawing = false;
      }, 500);
    }

    function update(features) {
      let FC = context.data.get('map');

      FC.features = [...FC.features, ...features];

      FC = geojsonRewind(FC);

      context.data.set({ map: FC }, 'map');
    }

    context.dispatch.on('change.map', ({ obj }) => {
      maybeShowEditControl();
      if (obj.map) {
        geojsonToLayer(context, writable);

        // Update vertex view layers if active
        if (viewingVertices && context.map.getSource('vertex-view-data')) {
          const geojson = context.data.get('map');
          if (geojson && geojson.features) {
            const vertexFeatures = [];

            geojson.features.forEach((feature) => {
              if (!feature.geometry) return;

              const { type, coordinates } = feature.geometry;
              const props = feature.properties || {};
              const color =
                props.stroke || props.fill || DEFAULT_DARK_FEATURE_COLOR;

              const addVertices = (coords, isRing = false) => {
                const len = coords.length;
                coords.forEach((coord, index) => {
                  if (isRing && index === len - 1) return;

                  // Determine vertex type: polygons are all 'middle', lines have start/end
                  let vertexType = 'middle';
                  if (!isRing) {
                    if (index === 0) {
                      vertexType = 'start';
                    } else if (index === len - 1) {
                      vertexType = 'end';
                    }
                  }

                  vertexFeatures.push({
                    type: 'Feature',
                    geometry: {
                      type: 'Point',
                      coordinates: coord
                    },
                    properties: {
                      vertexType,
                      color
                    }
                  });
                });
              };

              if (type === 'LineString') {
                addVertices(coordinates, false);
              } else if (type === 'MultiLineString') {
                coordinates.forEach((line) => addVertices(line, false));
              } else if (type === 'Polygon') {
                coordinates.forEach((ring) => addVertices(ring, true));
              } else if (type === 'MultiPolygon') {
                coordinates.forEach((polygon) => {
                  polygon.forEach((ring) => addVertices(ring, true));
                });
              }
            });

            context.map.getSource('vertex-view-data').setData({
              type: 'FeatureCollection',
              features: vertexFeatures
            });
          }
        }
      }
    });
  }

  return map;
};
