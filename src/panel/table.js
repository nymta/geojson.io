const metatable = require('d3-metatable')(d3),
  quickZoom = require('../lib/quickzoom.js');

module.exports = function (context) {
  let panelSelection = null;
  let lastCheckedRowIndex = null;

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
                quickZoom(context.map, geojson.features[i]);
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

      const allVisible = features.every(isFeatureVisible);

      const header = table
        .select('thead')
        .select('tr')
        .selectAll('th.feature-visibility')
        .data([null]);

      const headerEnter = header
        .enter()
        .insert('th', ':first-child')
        .attr('class', 'feature-visibility');

      headerEnter
        .append('input')
        .attr('type', 'checkbox')
        .attr('title', 'Toggle all features on map');

      header.exit().remove();

      table
        .select('thead th.feature-visibility input')
        .property('checked', allVisible)
        .on('change', function () {
          const shouldShow = this.checked;
          features.forEach((feature) => {
            if (!feature) return;
            if (shouldShow) {
              delete feature._visible;
            } else {
              feature._visible = false;
            }
          });
          context.data.set({ map: geojson }, 'table-visibility');
        });

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
        .on('mousedown', function () {
          this.__exclusiveClick = d3.event && d3.event.metaKey;
          this.__shiftClick = d3.event && d3.event.shiftKey;
        })
        .on('change', function (rowIndex) {
          const isCommandClick = this.__exclusiveClick;
          const isShiftClick = this.__shiftClick;
          this.__exclusiveClick = false;
          this.__shiftClick = false;
          const feature = features[rowIndex];
          if (!feature) return;
          if (isCommandClick) {
            this.checked = true;
            features.forEach((item, index) => {
              if (!item) return;
              if (index === rowIndex) {
                delete item._visible;
              } else {
                item._visible = false;
              }
            });
            lastCheckedRowIndex = rowIndex;
          } else if (this.checked) {
            // Turning ON
            if (isShiftClick && lastCheckedRowIndex !== null) {
              // Enable all rows between lastCheckedRowIndex and rowIndex
              const start = Math.min(lastCheckedRowIndex, rowIndex);
              const end = Math.max(lastCheckedRowIndex, rowIndex);
              for (let i = start; i <= end; i++) {
                if (features[i]) {
                  delete features[i]._visible;
                }
              }
            } else {
              delete feature._visible;
            }
            lastCheckedRowIndex = rowIndex;
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
