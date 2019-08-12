/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var d3 = require('d3');
var d3Hierarchy = require('d3-hierarchy');

var Registry = require('../../registry');
var Fx = require('../../components/fx');
var Drawing = require('../../components/drawing');
var Lib = require('../../lib');
var Events = require('../../lib/events');
var svgTextUtils = require('../../lib/svg_text_utils');

var barPlot = require('../bar/plot');
var toMoveInsideBar = barPlot.toMoveInsideBar;
var getTransform = barPlot.getTransform;
var formatPieValue = require('../pie/helpers').formatPieValue;
var styleOne = require('./style').styleOne;

var constants = require('./constants');
var helpers = require('../sunburst/helpers');

module.exports = function(gd, cdmodule, transitionOpts, makeOnCompleteCallback) {
    var fullLayout = gd._fullLayout;
    var layer = fullLayout._treemaplayer;
    var join, onComplete;

    // If transition config is provided, then it is only a partial replot and traces not
    // updated are removed.
    var isFullReplot = !transitionOpts;
    var hasTransition = transitionOpts && transitionOpts.duration > 0;

    join = layer.selectAll('g.trace.treemap')
        .data(cdmodule, function(cd) { return cd[0].trace.uid; });

    // using same 'stroke-linejoin' as pie traces
    join.enter().append('g')
        .classed('trace', true)
        .classed('treemap', true)
        .attr('stroke-linejoin', 'round');

    join.order();

    if(hasTransition) {
        if(makeOnCompleteCallback) {
            // If it was passed a callback to register completion, make a callback. If
            // this is created, then it must be executed on completion, otherwise the
            // pos-transition redraw will not execute:
            onComplete = makeOnCompleteCallback();
        }

        var transition = d3.transition()
            .duration(transitionOpts.duration)
            .ease(transitionOpts.easing)
            .each('end', function() { onComplete && onComplete(); })
            .each('interrupt', function() { onComplete && onComplete(); });

        transition.each(function() {
            // Must run the selection again since otherwise enters/updates get grouped together
            // and these get executed out of order. Except we need them in order!
            layer.selectAll('g.trace').each(function(cd) {
                plotOne(gd, cd, this, transitionOpts);
            });
        });
    } else {
        join.each(function(cd) {
            plotOne(gd, cd, this, transitionOpts);
        });
    }

    if(isFullReplot) {
        join.exit().remove();
    }
};

var ORIGIN = {
    x0: 0,
    x1: 0,
    y0: 0,
    y1: 0
};

function plotOne(gd, cd, element, transitionOpts) {
    var fullLayout = gd._fullLayout;
    // We could optimize hasTransition per trace,
    // as treemap has no cross-trace logic!
    var hasTransition = transitionOpts && transitionOpts.duration > 0;

    var gTrace = d3.select(element);
    var slices = gTrace.selectAll('g.slice');

    var cd0 = cd[0];
    var trace = cd0.trace;
    var hierarchy = cd0.hierarchy;
    var entry = helpers.findEntryWithLevel(hierarchy, trace.level);
    var maxDepth = trace.maxdepth >= 0 ? trace.maxdepth : Infinity;

    var gs = fullLayout._size;
    var domain = trace.domain;
    var vpw = gs.w * (domain.x[1] - domain.x[0]);
    var vph = gs.h * (domain.y[1] - domain.y[0]);

    var cx = cd0.cx = gs.l + gs.w * (domain.x[1] + domain.x[0]) / 2;
    var cy = cd0.cy = gs.t + gs.h * (1 - domain.y[0]) - vph / 2;

    if(!entry) {
        return slices.remove();
    }

    // previous root 'pt' (can be empty)
    var prevEntry = null;
    // stash of 'previous' position data used by tweening functions
    var prevLookup = {};

    if(hasTransition) {
        // Important: do this before binding new sliceData!
        slices.each(function(pt) {
            prevLookup[helpers.getPtId(pt)] = {
                x0: pt.x0,
                x1: pt.x1,
                y0: pt.y0,
                y1: pt.y1,
                transform: pt.transform
            };

            if(!prevEntry && helpers.isEntry(pt)) {
                prevEntry = pt;
            }
        });
    }

    // N.B. slice data isn't the calcdata,
    // grab corresponding calcdata item in sliceData[i].data.data
    var sliceData = partition(entry, [vpw, vph], {
        tiling: trace.tiling,
        padding: trace.marker.padding
    }).descendants();

    // N.B. handle multiple-root special case
    if(cd0.hasMultipleRoots && helpers.isHierachyRoot(entry)) {
        sliceData = sliceData.slice(1);
    }

    // filter out slices that won't show up on graph
    sliceData = sliceData.filter(function(pt) { return pt.depth <= maxDepth; });

    var getX = function(x) { return x + cx - vpw / 2; };
    var getY = function(y) { return y + cy - vph / 2; };

    var toPoint = function(x, y) {
        return [
            getX(x),
            getY(y)
        ];
    };

    // slice path generation fn
    var pathSlice = function(d) {
        var _x0 = getX(d.x0);
        var _x1 = getX(d.x1);
        var _y0 = getY(d.y0);
        var _y1 = getY(d.y1);

        return (
           'M' + _x0 + ',' + _y0 +
           'L' + _x1 + ',' + _y0 +
           'L' + _x1 + ',' + _y1 +
           'L' + _x0 + ',' + _y1 + 'Z'
        );
    };

    slices = slices.data(sliceData, function(pt) { return helpers.getPtId(pt); });

    slices.enter().append('g')
        .classed('slice', true);

    if(hasTransition) {
        slices.exit().transition()
            .each(function() {
                var sliceTop = d3.select(this);

                var slicePath = sliceTop.select('path.surface');
                slicePath.transition().attrTween('d', function(pt2) {
                    var interp = makeExitSliceInterpolator(pt2);
                    return function(t) { return pathSlice(interp(t)); };
                });

                var sliceTextGroup = sliceTop.select('g.slicetext');
                sliceTextGroup.attr('opacity', 0);
            })
            .remove();
    } else {
        slices.exit().remove();
    }

    slices.order();

    var updateSlices = slices;
    if(hasTransition) {
        updateSlices = updateSlices.transition().each('end', function() {
            // N.B. gd._transitioning is (still) *true* by the time
            // transition updates get hare
            var sliceTop = d3.select(this);
            helpers.setSliceCursor(sliceTop, gd, {isTransitioning: false});
        });
    }

    updateSlices.each(function(pt) {
        var sliceTop = d3.select(this);

        var slicePath = Lib.ensureSingle(sliceTop, 'path', 'surface', function(s) {
            s.style('pointer-events', 'all');
        });

        pt.midpos = toPoint(
            (pt.x0 + pt.x1) / 2,
            (pt.y0 + pt.y1) / 2
        );

        if(hasTransition) {
            slicePath.transition().attrTween('d', function(pt2) {
                var interp = makeUpdateSliceIntepolator(pt2);
                return function(t) { return pathSlice(interp(t)); };
            });
        } else {
            slicePath.attr('d', pathSlice);
        }

        sliceTop
            .call(attachFxHandlers, gd, cd)
            .call(helpers.setSliceCursor, gd, {isTransitioning: gd._transitioning});

        slicePath.call(styleOne, pt, trace);

        var sliceTextGroup = Lib.ensureSingle(sliceTop, 'g', 'slicetext');
        var sliceText = Lib.ensureSingle(sliceTextGroup, 'text', '', function(s) {
            // prohibit tex interpretation until we can handle
            // tex and regular text together
            s.attr('data-notex', 1);
        });

        sliceText.text(formatSliceLabel(pt, trace, fullLayout))
            .classed('slicetext', true)
            .attr('text-anchor', 'middle')
            .call(Drawing.font, (helpers.isHierachyRoot(pt) && !trace._hasColorscale) ?
              helpers.determineOutsideTextFont(trace, pt, fullLayout.font) :
              helpers.determineInsideTextFont(trace, pt, fullLayout.font))
            .call(svgTextUtils.convertToTspans, gd);

        // position the text relative to the slice
        var textBB = Drawing.bBox(sliceText.node());
        pt.transform = toMoveInsideBar(pt.x0, pt.x1, pt.y0, pt.y1, textBB, {
            isHorizontal: false,
            constrained: true,
            angle: trace.textangle,
            anchor: trace.insidetextanchor
        });

        pt.transform.targetX = getX(pt.transform.targetX);
        pt.transform.targetY = getY(pt.transform.targetY);

        var strTransform = function(d) {
            return getTransform({
                textX: d.transform.textX,
                textY: d.transform.textY,
                targetX: d.transform.targetX,
                targetY: d.transform.targetY,
                scale: d.transform.scale,
                rotate: d.transform.rotate
            });
        };

        if(hasTransition) {
            sliceText.transition().attrTween('transform', function(pt2) {
                var interp = makeUpdateTextInterpolar(pt2);
                return function(t) { return strTransform(interp(t)); };
            });
        } else {
            sliceText.attr('transform', strTransform(pt));
        }
    });

    function makeExitSliceInterpolator(pt) {
        var id = helpers.getPtId(pt);
        var prev = prevLookup[id];
        var entryPrev = prevLookup[helpers.getPtId(entry)];
        var next = {};

        if(entryPrev) {
            // if pt to remove:
            Lib.extendFlat(next, ORIGIN);
        } else {
            // this happens when maxdepth is set, when leaves must
            // be removed and the rootPt is new (i.e. does not have a 'prev' object)
            var parent;
            var parentId = helpers.getPtId(pt.parent);
            slices.each(function(pt2) {
                if(helpers.getPtId(pt2) === parentId) {
                    return parent = pt2;
                }
            });
            var parentChildren = parent.children;
            var ci;
            parentChildren.forEach(function(pt2, i) {
                if(helpers.getPtId(pt2) === id) {
                    return ci = i;
                }
            });
            var n = parentChildren.length;
            var interpX = d3.interpolate(parent.x0, parent.x1);
            var interpY = d3.interpolate(parent.y0, parent.y1);
            next = {
                x0: interpX(ci / n),
                x1: interpX((ci + 1) / n),
                y0: interpY(ci / n),
                y1: interpY((ci + 1) / n)
            };
        }

        return d3.interpolate(prev, next);
    }

    function makeUpdateSliceIntepolator(pt) {
        var prev0 = prevLookup[helpers.getPtId(pt)];
        var prev = {};
        Lib.extendFlat(prev, ORIGIN);

        var next = {
            x0: pt.x0,
            x1: pt.x1,
            y0: pt.y0,
            y1: pt.y1
        };

        if(prev0) {
            // if pt already on graph, this is easy
            prev = prev0;
        } else {
            // for new pts:
            if(prevEntry) {
                // if trace was visible before
                if(pt.parent) {
                    Lib.extendFlat(prev, interpFromParent(pt));
                }
            }
        }

        return d3.interpolate(prev, next);
    }

    function makeUpdateTextInterpolar(pt) {
        var prev0 = prevLookup[helpers.getPtId(pt)];
        var prev = {
            transform: {
                scale: 0,
                rotate: 0,
                textX: 0,
                textY: 0,
                targetX: 0,
                targetY: 0
            }
        };

        if(prev0) {
            prev = prev0;
        } else {
            // for new pts:
            if(prevEntry) {
                // if trace was visible before
                if(pt.parent) {
                    Lib.extendFlat(prev, interpFromParent(pt));
                }
            }
        }

        var scaleFn = d3.interpolate(prev.transform.scale, pt.transform.scale);
        var rotateFn = d3.interpolate(prev.transform.rotate, pt.transform.rotate);
        var textXFn = d3.interpolate(prev.transform.textX, pt.transform.textX);
        var textYFn = d3.interpolate(prev.transform.textY, pt.transform.textY);
        var targetXFn = d3.interpolate(prev.transform.targetX, pt.transform.targetX);
        var targetYFn = d3.interpolate(prev.transform.targetY, pt.transform.targetY);

        return function(t) {
            return {
                transform: {
                    scale: scaleFn(t),
                    rotate: rotateFn(t),
                    textX: textXFn(t),
                    textY: textYFn(t),
                    targetX: targetXFn(t),
                    targetY: targetYFn(t)
                }
            };
        };
    }

    function interpFromParent(pt) {
        var parent = pt.parent;
        var parentPrev = prevLookup[helpers.getPtId(parent)];

        if(parentPrev) {
            // if parent is visible
            var parentChildren = parent.children;
            var ci = parentChildren.indexOf(pt);
            var n = parentChildren.length;
            var interpX = d3.interpolate(parentPrev.x0, parentPrev.x1);
            var interpY = d3.interpolate(parentPrev.y0, parentPrev.y1);

            return {
                x0: interpX(ci / n),
                x1: interpX(ci / n),
                y0: interpY(ci / n),
                y1: interpY(ci / n)
            };
        }

        return Lib.extendFlat({}, ORIGIN);
    }
}

// x[0-1] keys are hierarchy heights [integers]
// y[0-1] keys are hierarchy heights [integers]
function partition(entry, size, opts) {
    return d3Hierarchy
        .treemap()
        .tile(d3Hierarchy['treemap' + opts.tiling])
        .paddingInner(opts.padding.inside)
        .paddingTop(opts.padding.top)
        .paddingLeft(opts.padding.left)
        .paddingRight(opts.padding.right)
        .paddingBottom(opts.padding.bottom)
        .size(size)(
            entry
        );
}

function attachFxHandlers(sliceTop, gd, cd) {
    var cd0 = cd[0];
    var trace = cd0.trace;

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
            var hoverCenterX = pt.midpos[0];
            var hoverCenterY = pt.midpos[1];
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

            Fx.loneHover({
                trace: traceNow,
                x: hoverCenterX,
                y: hoverCenterY,
                idealAlign: pt.midpos[0] < 0 ? 'left' : 'right',
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
            }, {
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
    });

    sliceTop.on('click', function(pt) {
        // TODO: this does not support right-click. If we want to support it, we
        // would likely need to change pie to use dragElement instead of straight
        // mapbox event binding. Or perhaps better, make a simple wrapper with the
        // right mousedown, mousemove, and mouseup handlers just for a left/right click
        // mapbox would use this too.
        var fullLayoutNow = gd._fullLayout;
        var traceNow = gd._fullData[trace.index];

        var clickVal = Events.triggerHandler(gd, 'plotly_treemapclick', {
            points: [helpers.makeEventData(pt, traceNow)],
            event: d3.event
        });

        // 'regular' click event when treemapclick is disabled or when
        // clikcin on leaves or the hierarchy root
        if(
            clickVal === false ||
            helpers.isHierachyRoot(pt)
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
}

function formatSliceLabel(pt, trace, fullLayout) {
    var texttemplate = trace.texttemplate;
    var textinfo = trace.textinfo;

    if(!texttemplate && (!textinfo || textinfo === 'none')) {
        return '';
    }

    var cdi = pt.data.data;
    var separators = fullLayout.separators;
    if(!texttemplate) {
        var parts = textinfo.split('+');
        var hasFlag = function(flag) { return parts.indexOf(flag) !== -1; };
        var thisText = [];

        if(hasFlag('label') && cdi.label) {
            thisText.push(cdi.label);
        }

        if(cdi.hasOwnProperty('v') && hasFlag('value')) {
            thisText.push(formatPieValue(cdi.v, separators));
        }

        if(hasFlag('text')) {
            var tx = Lib.castOption(trace, cdi.i, 'text');
            if(Lib.isValidTextValue(tx)) thisText.push(tx);
        }

        return thisText.join('<br>');
    }

    var txt = Lib.castOption(trace, cdi.i, 'texttemplate');
    if(!txt) return '';
    var obj = {};
    if(cdi.label) obj.label = cdi.label;
    if(cdi.hasOwnProperty('v')) {
        obj.value = cdi.v;
        obj.valueLabel = formatPieValue(cdi.v, separators);
    }
    if(cdi.hasOwnProperty('color')) {
        obj.color = cdi.color;
    }
    var ptTx = Lib.castOption(trace, cdi.i, 'text');
    if(Lib.isValidTextValue(ptTx)) obj.text = ptTx;
    obj.customdata = Lib.castOption(trace, cdi.i, 'customdata');
    return Lib.texttemplateString(txt, obj, fullLayout._d3locale, obj, trace._meta || {});
}
