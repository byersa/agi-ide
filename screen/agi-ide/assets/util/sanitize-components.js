(function () {
    const reserved = new Set(['text', 'circle', 'svg', 'image', 'path', 'filter', 'line', 'rect', 'polygon', 'polyline', 'pattern', 'mask', 'defs', 'use', 'g', 'symbol']);
    window.AgiComponents = new Proxy(window.AgiComponents || {}, {
        set(target, prop, value) {
            if (typeof prop === 'string' && reserved.has(prop.toLowerCase())) {
                return true; // silently ignore reserved tag assignment
            }
            target[prop] = value;
            return true;
        }
    });
    // Remove if already set
    reserved.forEach(tag => {
        delete window.AgiComponents[tag];
    });
})();