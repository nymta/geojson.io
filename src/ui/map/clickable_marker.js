// extend mapboxGL Marker so we can pass in an onClick handler
const mapboxgl = require('mapbox-gl');
const { icons: phosphorIcons } = require('@phosphor-icons/core');
const phosphorNames = phosphorIcons.map((icon) => icon.name);

class ClickableMarker extends mapboxgl.Marker {
  constructor(options, legacyOptions) {
    super(options, legacyOptions);

    const { symbol = 'circle', symbolColor = '#fff' } = options;

    if (
      symbol !== 'circle' &&
      (phosphorNames.includes(symbol) || /^[a-z0-9]$/.test(symbol))
    ) {
      const symbolPath = document.createElement('path');
      this._element.querySelector('circle').replaceWith(symbolPath);

      // download svg symbol and insert its path where the circle was
      d3.xml(`../dist/icons/${symbol}-fill.svg`, (err, xml) => {
        if (err) {
          console.error(
            `Error downloading the svg from: ../dist/icons/${symbol}-fill.svg`
          );
        } else {
          // Phosphor icons use a 256x256 viewBox, so we need to scale them down
          // Scale factor: ~0.06 (15/256) to fit in the marker, then translate to center
          const pathD = xml.documentElement
            .getElementsByTagName('path')[0]
            .getAttribute('d');
          symbolPath.outerHTML = `<path fill="${symbolColor}" transform="translate(6 6) scale(0.06)" d="${pathD}"></path>`;
        }
      });
    }
  }

  // new method onClick, sets _handleClick to a function you pass in
  onClick(handleClick) {
    this._handleClick = handleClick;
    return this;
  }

  // the existing _onMapClick was there to trigger a popup
  // but we are hijacking it to run a function we define
  _onMapClick(e) {
    const targetElement = e.originalEvent.target;
    const element = this._element;

    if (
      this._handleClick &&
      (targetElement === element || element.contains(targetElement))
    ) {
      this._handleClick();
    }
  }
}

module.exports = ClickableMarker;
