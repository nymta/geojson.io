const metatable = require('d3-metatable')(d3),
  smartZoom = require('../lib/smartzoom.js');

module.exports = function (context) {
  let panelSelection = null;

  function render(selection) {
    panelSelection = selection;
    panelSelection.classed('table-panel', true);
    selection.html('');

    function rerender() {
      const geojson = context.data.get('map');
      let props;
      let features;

      if (
        !geojson ||
        (!geojson.geometry && (!geojson.features || !geojson.features.length))
      ) {
        selection
          .html('')
          .append('div')
          .attr('class', 'blank-banner center')
          .text('no features');
      } else {
        features = geojson.geometry ? [geojson] : geojson.features;
        props = features.map(getProperties);
        selection.select('.blank-banner').remove();
        selection.data([props]).call(
          metatable()
            .on('change', (row, i) => {
              const geojson = context.data.get('map');
              if (geojson.geometry) {
                geojson.properties = row;
              } else {
                geojson.features[i].properties = row;
              }
              context.data.set({ map: geojson }, 'table');
            })
            .on('rowfocus', (row, i) => {
              const geojson = context.data.get('map');
              if (!geojson.geometry) {
                smartZoom(context.map, geojson.features[i]);
              }
            })
        );
        syncVisibilityColumn(selection, features, geojson);
      }
    }

    context.dispatch.on('change.table', () => {
      rerender();
    });

    rerender();

    function getProperties(f) {
      return f.properties;
    }

    function syncVisibilityColumn(selection, features, geojson) {
      const table = selection.select('table');
      if (table.empty()) return;

      const header = table
        .select('thead')
        .select('tr')
        .selectAll('th.feature-visibility')
        .data([null]);

      header
        .enter()
        .insert('th', ':first-child')
        .attr('class', 'feature-visibility')
        .append('span')
        .text('map');

      header.exit().remove();

      const rows = table.select('tbody').selectAll('tr');
      const cells = rows.selectAll('td.feature-visibility').data((d, i) => [i]);

      const cellsEnter = cells
        .enter()
        .insert('td', ':first-child')
        .attr('class', 'feature-visibility');

      cellsEnter
        .append('input')
        .attr('type', 'checkbox')
        .attr('title', 'Show feature on map');

      cells.exit().remove();

      cells
        .select('input')
        .property('checked', (rowIndex) => isFeatureVisible(features[rowIndex]))
        .on('change', function (rowIndex) {
          const feature = features[rowIndex];
          if (!feature) return;
          if (this.checked) {
            delete feature._visible;
          } else {
            feature._visible = false;
          }
          context.data.set({ map: geojson }, 'table-visibility');
        });
    }

    function isFeatureVisible(feature) {
      return feature && feature._visible !== false;
    }
  }

  render.off = function () {
    context.dispatch.on('change.table', null);
    if (panelSelection) {
      panelSelection.classed('table-panel', false);
      panelSelection = null;
    }
  };

  return render;
};
