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
var Color = require('../../components/color');
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
        moduleHasTextangle: false,
        moduleHasInsideanchor: false
    });
    coerce('textposition');

    var lineWidth = coerce('marker.line.width');
    if(lineWidth) coerce('marker.line.color', layout.paper_bgcolor);

    coerce('marker.colors');
    var withColorscale = hasColorscale(traceIn, 'marker');

    var headerSize = traceOut.textfont.size * 1.6;
    coerce('marker.padding.top', headerSize);
    coerce('marker.padding.left', headerSize / 4);
    coerce('marker.padding.right', headerSize / 4);
    coerce('marker.padding.bottom', headerSize / 4);
    var paddingInside = coerce('marker.padding.inside');

    if(withColorscale) {
        colorscaleDefaults(traceIn, traceOut, layout, coerce, {prefix: 'marker.', cLetter: 'c'});
    }
    var markerOpacity = coerce('marker.opacity', withColorscale ? 1 : 0.5);
    coerce('hovered.marker.opacity', withColorscale ? 1 : 0.5 + markerOpacity / 2);
    coerce('hovered.marker.line.width', paddingInside < 2 ? paddingInside : 2);
    coerce('hovered.marker.line.color', Color.contrast(layout.paper_bgcolor));

    var dirSide = coerce('directory.side');
    if(dirSide) {
        coerce('directory.color');
        Lib.coerceFont(coerce, 'directory.textfont', layout.font);
        coerce('directory.height', traceOut.directory.textfont.size + 4);
    }

    handleDomainDefaults(traceOut, layout, coerce);

    // do not support transforms for now
    traceOut._length = null;
};
