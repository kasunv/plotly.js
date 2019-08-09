/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var plotAttrs = require('../../plots/attributes');
var hovertemplateAttrs = require('../../components/fx/hovertemplate_attributes');
// var texttemplateAttrs = require('../../plots/texttemplate_attributes');
var colorScaleAttrs = require('../../components/colorscale/attributes');
var domainAttrs = require('../../plots/domain').attributes;
var pieAttrs = require('../pie/attributes');
var barAttrs = require('../bar/attributes');

var extendFlat = require('../../lib/extend').extendFlat;

module.exports = {
    tiling: {
        dflt: 'Squarify',
        values: [
            'Binary',
            'Squarify', // this algorithm accepts an extra 'ratio' parameter. What should we do about that?
            // 'Resquarify',
            'SliceDice',
            'Slice',
            'Dice'
        ],
        valType: 'enumerated',
        role: 'info',
        editType: 'plot'
    },

    labels: {
        valType: 'data_array',
        editType: 'calc',
        description: [
            'Sets the labels of each of the treemap sectors.'
        ].join(' ')
    },
    parents: {
        valType: 'data_array',
        editType: 'calc',
        description: [
            'Sets the parent sectors for each of the treemap sectors.',
            'Empty string items \'\' are understood to reference',
            'the root node in the hierarchy.',
            'If `ids` is filled, `parents` items are understood to be "ids" themselves.',
            'When `ids` is not set, plotly attempts to find matching items in `labels`,',
            'but beware they must be unique.'
        ].join(' ')
    },

    values: {
        valType: 'data_array',
        editType: 'calc',
        description: [
            'Sets the values associated with each of the treemap sectors.',
            'Use with `branchvalues` to determine how the values are summed.'
        ].join(' ')
    },
    branchvalues: {
        valType: 'enumerated',
        values: ['remainder', 'total'],
        dflt: 'remainder',
        editType: 'calc',
        role: 'info',
        description: [
            'Determines how the items in `values` are summed.',
            'When set to *total*, items in `values` are taken to be value of all its descendants.',
            'When set to *remainder*, items in `values` corresponding to the root and the branches sectors',
            'are taken to be the extra part not part of the sum of the values at their leaves.'
        ].join(' ')
    },

    level: {
        valType: 'any',
        editType: 'plot',
        anim: true,
        role: 'info',
        description: [
            'Sets the level from which this treemap trace hierarchy is rendered.',
            'Set `level` to `\'\'` to start the treemap from the root node in the hierarchy.',
            'Must be an "id" if `ids` is filled in, otherwise plotly attempts to find a matching',
            'item in `labels`.'
        ].join(' ')
    },
    maxdepth: {
        valType: 'integer',
        editType: 'plot',
        role: 'info',
        dflt: -1,
        description: [
            'Sets the number of rendered treemap depth from any given `level`.',
            'Set `maxdepth` to *-1* to render all the levels in the hierarchy.'
        ].join(' ')
    },

    marker: extendFlat({
        colors: {
            valType: 'data_array',
            editType: 'calc',
            description: [
                'Sets the color of each sector of this treemap chart.',
                'If not specified, the default trace color set is used',
                'to pick the sector colors.'
            ].join(' ')
        },

        // colorinheritance: {
        //     valType: 'enumerated',
        //     values: ['per-branch', 'per-label', false]
        // },

        opacity: {
            valType: 'number',
            editType: 'plot',
            role: 'style',
            min: 0,
            max: 1,
            description: [
                'Sets the opacity for the overlays. With colorscale',
                'it is defaulted to 1; otherwise it is defaulted to 0.5'
            ].join(' ')
        },

        padding: {
            inside: {
                valType: 'number',
                role: 'style',
                min: 0,
                dflt: 0,
                editType: 'plot',
                description: [
                    'Sets the inner padding (in px).'
                ].join(' ')
            },
            top: {
                valType: 'number',
                role: 'style',
                min: 0,
                dflt: 5,
                editType: 'plot',
                description: [
                    'Sets the padding form the top (in px).'
                ].join(' ')
            },
            left: {
                valType: 'number',
                role: 'style',
                min: 0,
                dflt: 5,
                editType: 'plot',
                description: [
                    'Sets the padding form the left (in px).'
                ].join(' ')
            },
            right: {
                valType: 'number',
                role: 'style',
                min: 0,
                dflt: 5,
                editType: 'plot',
                description: [
                    'Sets the padding form the right (in px).'
                ].join(' ')
            },
            bottom: {
                valType: 'number',
                role: 'style',
                min: 0,
                dflt: 5,
                editType: 'plot',
                description: [
                    'Sets the padding form the bottom (in px).'
                ].join(' ')
            },
            editType: 'plot'
        },

        line: {
            color: extendFlat({}, pieAttrs.marker.line.color, {
                dflt: null,
                description: [
                    'Sets the color of the line enclosing each sector.',
                    'Defaults to the `paper_bgcolor` value.'
                ].join(' ')
            }),
            width: extendFlat({}, pieAttrs.marker.line.width, {dflt: 1}),
            editType: 'calc'
        },

        editType: 'calc'
    },
        colorScaleAttrs('marker', {
            colorAttr: 'colors',
            anim: false // TODO: set to anim: true?
        })
    ),

    text: pieAttrs.text,
    textinfo: {
        valType: 'flaglist',
        role: 'info',
        flags: [
            // 'percent parent',
            // 'percent total',
            'label',
            'text',
            'value'
        ],
        extras: ['none'],
        editType: 'plot',
        description: [
            'Determines which trace information appear on the graph.'
        ].join(' ')
    },

    /*
    texttemplate: texttemplateAttrs({editType: 'plot'}, {
        keys: [
            // 'percent parent',
            // 'percent total',
            'label',
            'text',
            'value',
            'color'
        ]
    }),
    */

    hovertext: pieAttrs.hovertext,
    hoverinfo: extendFlat({}, plotAttrs.hoverinfo, {
        flags: [
            // 'percent parent',
            // 'percent total',
            'label',
            'text',
            'value',
            'name'
        ]
    }),
    hovertemplate: extendFlat({}, hovertemplateAttrs(), {
        flags: [
            // 'percent parent',
            // 'percent total',
            'label',
            'text',
            'value',
            'text'
        ]
    }),

    textfont: pieAttrs.textfont,
    insidetextfont: pieAttrs.insidetextfont,
    outsidetextfont: pieAttrs.outsidetextfont,

    textangle: extendFlat({}, barAttrs.textangle, {dflt: 0}),

    domain: domainAttrs({name: 'treemap', trace: true, editType: 'calc'})
};
