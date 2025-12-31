const qs = require('qs-hash');

module.exports = function (context) {
  d3.select(window).on('unload', onunload);
  context.dispatch.on('change', onchange);

  const query = qs.stringQs(location.hash.split('#')[1] || '');

  if (location.hash !== '#new' && !query.id && !query.data) {
    // Skip recovery prompt - just clear any saved recovery data
    context.storage.remove('recover');
  }

  function onunload() {
    if (context.data.get('type') === 'local' && context.data.hasFeatures()) {
      try {
        context.storage.set('recover', context.data.all());
      } catch (e) {
        // QuotaStorageExceeded
      }
    } else {
      context.storage.remove('recover');
    }
  }

  function onchange() {
    if (context.data.get('type') !== 'local') {
      context.storage.remove('recover');
    }
  }
};
