/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var Registry = require('../../registry');
var Fx = require('../../components/fx');
var Events = require('../../lib/events');
var constants = require('./constants');

module.exports = function attachFxHandlers(sliceTop, gd, cd) {
    var cd0 = cd[0];
    var trace = cd0.trace;

    var isSunburst = (trace.type === 'sunburst');
    var isTreemap = (trace.type === 'treemap');

    // hover state vars
    // have we drawn a hover label, so it should be cleared later
    if(!('_hasHoverLabel' in trace)) trace._hasHoverLabel = false;
    // have we emitted a hover event, so later an unhover event should be emitted
    // note that click events do not depend on this - you can still get them
    // with hovermode: false or if you were earlier dragging, then clicked
    // in the same slice that you moused up in
    if(!('_hasHoverEvent' in trace)) trace._hasHoverEvent = false;

    sliceTop.on('mouseover', function(pt) {
        var fullLayoutNow = gd._fullLayout;

        if(gd._dragging || fullLayoutNow.hovermode === false) return;

        var traceNow = gd._fullData[trace.index];
        var cdi = pt.data.data;
        var ptNumber = cdi.i;

        var _cast = function(astr) {
            return Lib.castOption(traceNow, ptNumber, astr);
        };

        var hovertemplate = _cast('hovertemplate');
        var hoverinfo = Fx.castHoverinfo(traceNow, fullLayoutNow, ptNumber);
        var separators = fullLayoutNow.separators;

        if(hovertemplate || (hoverinfo && hoverinfo !== 'none' && hoverinfo !== 'skip')) {
            var hoverCenterX;
            var hoverCenterY;
            if(isSunburst) {
                hoverCenterX = cd0.cx + pt.pxmid[0] * (1 - pt.rInscribed);
                hoverCenterY = cd0.cy + pt.pxmid[1] * (1 - pt.rInscribed);
            }
            if(isTreemap) {
                hoverCenterX = pt._right[0];
                hoverCenterY = pt._right[1];
            }

            var hoverPt = {};
            var parts = [];
            var thisText = [];
            var hasFlag = function(flag) { return parts.indexOf(flag) !== -1; };

            if(hoverinfo) {
                parts = hoverinfo === 'all' ?
                    traceNow._module.attributes.hoverinfo.flags :
                    hoverinfo.split('+');
            }

            hoverPt.label = cdi.label;
            if(hasFlag('label') && hoverPt.label) thisText.push(hoverPt.label);

            if(cdi.hasOwnProperty('v')) {
                hoverPt.value = cdi.v;
                hoverPt.valueLabel = formatPieValue(hoverPt.value, separators);
                if(hasFlag('value')) thisText.push(hoverPt.valueLabel);
            }

            hoverPt.text = _cast('hovertext') || _cast('text');
            if(hasFlag('text')) {
                var tx = hoverPt.text;
                if(Lib.isValidTextValue(tx)) thisText.push(tx);
            }

            var hoverItems = {
                trace: traceNow,
                y: hoverCenterY,
                text: thisText.join('<br>'),
                name: (hovertemplate || hasFlag('name')) ? traceNow.name : undefined,
                color: _cast('hoverlabel.bgcolor') || cdi.color,
                borderColor: _cast('hoverlabel.bordercolor'),
                fontFamily: _cast('hoverlabel.font.family'),
                fontSize: _cast('hoverlabel.font.size'),
                fontColor: _cast('hoverlabel.font.color'),
                nameLength: _cast('hoverlabel.namelength'),
                textAlign: _cast('hoverlabel.align'),
                hovertemplate: hovertemplate,
                hovertemplateLabels: hoverPt,
                eventData: [helpers.makeEventData(pt, traceNow)]
            };

            if(isSunburst) {
                hoverItems.x0 = hoverCenterX - pt.rInscribed * pt.rpx1;
                hoverItems.x1 = hoverCenterX + pt.rInscribed * pt.rpx1;
                hoverItems.idealAlign = pt.pxmid[0] < 0 ? 'left' : 'right';
            }
            if(isTreemap) {
                hoverItems.x = hoverCenterX;
                hoverItems.idealAlign = hoverCenterX < 0 ? 'left' : 'right';
            }

            Fx.loneHover(hoverItems, {
                container: fullLayoutNow._hoverlayer.node(),
                outerContainer: fullLayoutNow._paper.node(),
                gd: gd
            });

            trace._hasHoverLabel = true;
        }

        trace._hasHoverEvent = true;
        gd.emit('plotly_hover', {
            points: [helpers.makeEventData(pt, traceNow)],
            event: d3.event
        });

        if(isTreemap) {
            var slices = sliceTop.selectAll('path.surface');
            slices.each(function() {
                slices.call(styleOne, pt, traceNow, true);
            });
        }
    });

    sliceTop.on('mouseout', function(evt) {
        var fullLayoutNow = gd._fullLayout;
        var traceNow = gd._fullData[trace.index];
        var pt = d3.select(this).datum();

        if(trace._hasHoverEvent) {
            evt.originalEvent = d3.event;
            gd.emit('plotly_unhover', {
                points: [helpers.makeEventData(pt, traceNow)],
                event: d3.event
            });
            trace._hasHoverEvent = false;
        }

        if(trace._hasHoverLabel) {
            Fx.loneUnhover(fullLayoutNow._hoverlayer.node());
            trace._hasHoverLabel = false;
        }

        if(isTreemap) {
            var slices = sliceTop.selectAll('path.surface');
            slices.each(function() {
                slices.call(styleOne, pt, traceNow, false);
            });
        }
    });

    sliceTop.on('click', function(pt) {
        // TODO: this does not support right-click. If we want to support it, we
        // would likely need to change pie to use dragElement instead of straight
        // mapbox event binding. Or perhaps better, make a simple wrapper with the
        // right mousedown, mousemove, and mouseup handlers just for a left/right click
        // mapbox would use this too.
        var fullLayoutNow = gd._fullLayout;
        var traceNow = gd._fullData[trace.index];

        var clickVal = Events.triggerHandler(gd, 'plotly_' + trace.type + 'click', {
            points: [helpers.makeEventData(pt, traceNow)],
            event: d3.event
        });

        // 'regular' click event when sunburst/treemap click is disabled or when
        // clicking on leaves or the hierarchy root
        if(
            clickVal === false ||
            helpers.isHierachyRoot(pt) ||
            (isSunburst && helpers.isLeaf(pt))
        ) {
            if(fullLayoutNow.hovermode) {
                gd._hoverdata = [helpers.makeEventData(pt, traceNow)];
                Fx.click(gd, d3.event);
            }
            return;
        }

        // skip if triggered from dragging a nearby cartesian subplot
        if(gd._dragging) return;

        // skip during transitions, to avoid potential bugs
        // we could remove this check later
        if(gd._transitioning) return;

        if(isTreemap) {
            traceNow._rect = {
                x0: pt.x0,
                x1: pt.x1,
                y0: pt.y0,
                y1: pt.y1,
            };
        }

        // store 'old' level in guiEdit stash, so that subsequent Plotly.react
        // calls with the same uirevision can start from the same entry
        Registry.call('_storeDirectGUIEdit', traceNow, fullLayoutNow._tracePreGUI[traceNow.uid], {level: traceNow.level});

        var hierarchy = cd0.hierarchy;
        var id = helpers.getPtId(pt);

        var nextEntry =
            helpers.isEntry(pt) ?
            helpers.findEntryWithChild(hierarchy, id) :
            helpers.findEntryWithLevel(hierarchy, id);

        var frame = {
            data: [{level: helpers.getPtId(nextEntry)}],
            traces: [trace.index]
        };

        var animOpts = {
            frame: {
                redraw: false,
                duration: constants.CLICK_TRANSITION_TIME
            },
            transition: {
                duration: constants.CLICK_TRANSITION_TIME,
                easing: constants.CLICK_TRANSITION_EASING
            },
            mode: 'immediate',
            fromcurrent: true
        };

        Fx.loneUnhover(fullLayoutNow._hoverlayer.node());
        Registry.call('animate', gd, frame, animOpts);
    });
};
