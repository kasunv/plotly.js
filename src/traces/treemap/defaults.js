/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var Lib = require('../../lib');
var attributes = require('./attributes');
var hasColorscale = require('../../components/colorscale/helpers').hasColorscale;
var colorscaleDefaults = require('../../components/colorscale/defaults');
var handleDomainDefaults = require('../../plots/domain').defaults;
var handleText = require('../bar/defaults').handleText;

module.exports = function supplyDefaults(traceIn, traceOut, defaultColor, layout) {
    function coerce(attr, dflt) {
        return Lib.coerce(traceIn, traceOut, attributes, attr, dflt);
    }

    var labels = coerce('labels');
    var parents = coerce('parents');

    if(!labels || !labels.length || !parents || !parents.length) {
        traceOut.visible = false;
        return;
    }

    var vals = coerce('values');
    if(vals && vals.length) coerce('branchvalues');

    coerce('level');
    coerce('maxdepth');

    coerce('tiling');
    coerce('marker.padding.inside');
    coerce('marker.padding.top');
    coerce('marker.padding.left');
    coerce('marker.padding.right');
    coerce('marker.padding.bottom');

    var lineWidth = coerce('marker.line.width');
    if(lineWidth) coerce('marker.line.color', layout.paper_bgcolor);

    coerce('marker.colors');
    var withColorscale = hasColorscale(traceIn, 'marker');
    if(withColorscale) {
        colorscaleDefaults(traceIn, traceOut, layout, coerce, {prefix: 'marker.', cLetter: 'c'});
    }

    coerce('marker.opacity', withColorscale ? 1 : 0.5);

    var text = coerce('text');
    /* coerce('texttemplate');
    if(!traceOut.texttemplate) */ coerce('textinfo', Array.isArray(text) ? 'text+label' : 'label');

    coerce('hovertext');
    coerce('hovertemplate');

    var textposition = 'auto';
    handleText(traceIn, traceOut, layout, coerce, textposition, {
        moduleHasSelected: false,
        moduleHasUnselected: false,
        moduleHasConstrain: false,
        moduleHasCliponaxis: false,
        moduleHasTextangle: true,
        moduleHasInsideanchor: false
    });

    handleDomainDefaults(traceOut, layout, coerce);

    // do not support transforms for now
    traceOut._length = null;
};
