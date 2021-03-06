/*global ux */
exports.datagrid.events.ON_SCROLL_START = "datagrid:scrollStart";
exports.datagrid.events.ON_SCROLL_STOP = "datagrid:scrollStop";
exports.datagrid.events.ON_TOUCH_DOWN = "datagrid:touchDown";
exports.datagrid.events.ON_TOUCH_UP = "datagrid:touchUp";
exports.datagrid.coreAddons.scrollModel = function scrollModel(inst) {

    var result = exports.logWrapper('scrollModel', {}, 'orange', inst.dispatch),
        setup = false,
        unwatchSetup,
        waitForStopIntv,
        hasScrollListener = false,
        lastScroll,
        lastRenderTime;

    /**
     * Listen for scrollingEvents.
     */
    function setupScrolling() {
        unwatchSetup();
        if (!inst.element.css('overflow')) {
            inst.element.css({overflow: 'auto'});
        }
        result.log('addScrollListener');
        addScrollListener();
        inst.unwatchers.push(inst.scope.$on(exports.datagrid.events.SCROLL_TO_INDEX, function (event, index) {
            inst.scrollModel.scrollToIndex(index, true);
        }));
        inst.unwatchers.push(inst.scope.$on(exports.datagrid.events.SCROLL_TO_ITEM, function (event, item) {
            inst.scrollModel.scrollToItem(item, true);
        }));
        inst.unwatchers.push(inst.scope.$on(exports.datagrid.events.SCROLL_INTO_VIEW, function (event, itemOrIndex) {
            inst.scrollModel.scrollIntoView(itemOrIndex, true);
        }));
        addTouchEvents();
        setup = true;
    }

    function addScrollListener() {
        hasScrollListener = true;
        inst.element[0].addEventListener('scroll', onUpdateScrollHandler);
    }

    function onBeforeReset() {
        if (hasScrollListener) {
            result.removeScrollListener();
            hasScrollListener = true;
        }
        result.removeTouchEvents();
    }

    function onAfterReset() {
        if (hasScrollListener) {
            addScrollListener();
        }
        addTouchEvents();
    }

    function addTouchEvents() {
        result.log('addTouchEvents');
        var content = inst.getContent();
        content.bind('touchstart', result.onTouchStart);
        content.bind('touchend', result.onTouchEnd);
        content.bind('touchcancel', result.onTouchEnd);
    }

    result.fireOnScroll = function fireOnScroll() {
        if (inst.values.scroll !== lastScroll) {
            lastScroll = inst.values.scroll;
            inst.dispatch(exports.datagrid.events.ON_SCROLL, inst.values);
        }
    };

    result.removeScrollListener = function removeScrollListener() {
        result.log('removeScrollListener');
        inst.element[0].removeEventListener('scroll', onUpdateScrollHandler);
    };

    result.removeTouchEvents = function removeTouchEvents() {
        if (setup) {
            result.log('removeTouchEvents');
            inst.getContent().unbind('touchstart', result.onTouchStart);
            inst.getContent().unbind('touchend', result.onTouchEnd);
            inst.getContent().unbind('touchcancel', result.onTouchEnd);
        }
    };

    result.onTouchStart = function onTouchStart(event) {
        inst.values.touchDown = true;
        inst.dispatch(exports.datagrid.events.ON_TOUCH_DOWN, event);
    };

    result.onTouchEnd = function onTouchEnd(event) {
        inst.values.touchDown = false;
        inst.dispatch(exports.datagrid.events.ON_TOUCH_UP, event);
    };

    result.getScroll = function getScroll(el) {
        return (el || inst.element[0]).scrollTop;
    };

    result.setScroll = function setScroll(value) {
        var unwatch, chunkList = inst.chunkModel.getChunkList();
        if (!chunkList || !chunkList.height) {
            // wait until that height is ready then scroll.
            unwatch = inst.scope.$on(exports.datagrid.events.ON_AFTER_RENDER, function () {
                unwatch();
                result.setScroll(value);
            });
        } else if (inst.element[0].scrollHeight >= value) {
            inst.element[0].scrollTop = value;
        }
        inst.values.scroll = value;
    };

    function onUpdateScrollHandler(event) {
        inst.scrollModel.onUpdateScroll(event);
    }

    /**
     * When a scrollEvent is fired, recalculate the values.
     * @param event
     */
    result.onUpdateScroll = function onUpdateScroll(event) {
        var val = inst.scrollModel.getScroll(event.target || event.srcElement);
        if (inst.values.scroll !== val) {
            inst.dispatch(exports.datagrid.events.ON_SCROLL_START, val);
            inst.values.speed = val - inst.values.scroll;
            inst.values.absSpeed = Math.abs(inst.values.speed);
            inst.values.scroll = val;
            inst.values.scrollPercent = ((inst.values.scroll / inst.getContentHeight()) * 100).toFixed(2);
        }
        inst.scrollModel.waitForStop();
        result.fireOnScroll();
    };

    result.capScrollValue = function (value) {
        if (inst.getContentHeight() < inst.getViewportHeight()) {
            value = 0;// couldn't make it. just scroll to the bottom.
        } else if (inst.getContentHeight() - value < inst.getViewportHeight()) { // don't allow to scroll past the bottom.
            value = inst.getContentHeight() - inst.getViewportHeight(); // this will be the bottom scroll.
        }
        return value;
    };

    /**
     * Scroll to the numeric value.
     * @param value
     * @param {Boolean=} immediately
     */
    result.scrollTo = function scrollTo(value, immediately) {
        value = result.capScrollValue(value);
        inst.scrollModel.setScroll(value);
        if (immediately) {
            inst.scrollModel.onScrollingStop();
        } else {
            inst.scrollModel.waitForStop();
        }
    };

    result.clearOnScrollingStop = function clearOnScrollingStop() {
        result.onScrollingStop();
    };

    function flowWaitForStop() {
        lastRenderTime = Date.now();
        inst.scrollModel.onScrollingStop();
    }

    /**
     * Wait for the datagrid to slow down enough to render.
     */
    result.waitForStop = function waitForStop() {
        var forceRender = false;
        clearTimeout(waitForStopIntv);
        if (inst.options.renderWhileScrolling) {
            if (Date.now() - (inst.options.renderWhileScrolling > 0 || 0) > lastRenderTime) {
                forceRender = true;
            }
        }
        if (!forceRender && (inst.flow.async || inst.values.touchDown)) {
            waitForStopIntv = setTimeout(flowWaitForStop, inst.options.updateDelay);
        } else {
            flowWaitForStop();
        }
    };

    /**
     * When it stops render.
     */
    result.onScrollingStop = function onScrollingStop() {
        inst.values.speed = 0;
        inst.values.absSpeed = 0;
        inst.render();
        result.fireOnScroll();
        inst.dispatch(exports.datagrid.events.ON_SCROLL_STOP, inst.values);
    };

    /**
     * Scroll to the normalized index.
     * @param index
     * @param {Boolean=} immediately
     */
    result.scrollToIndex = function scrollToIndex(index, immediately) {
        result.log('scrollToIndex');
        var offset = inst.getRowOffset(index);
        inst.scrollModel.scrollTo(offset, immediately);
        return offset;
    };

    /**
     * Scroll to an item by finding it's normalized index.
     * @param item
     * @param {Boolean=} immediately
     */
    result.scrollToItem = function scrollToItem(item, immediately) {
        result.log('scrollToItem');
        var index = inst.getNormalizedIndex(item);
        if (index !== -1) {
            return inst.scrollModel.scrollToIndex(index, immediately);
        }
        return inst.values.scroll;
    };

    /**
     * If the item is above or below the viewable area, scroll till it is in view.
     * @param itemOrIndex
     * @param immediately
     */
    result.scrollIntoView = function scrollIntoView(itemOrIndex, immediately) {
        result.log('scrollIntoView');
        var index = typeof itemOrIndex === 'number' ? itemOrIndex : inst.getNormalizedIndex(itemOrIndex),
            offset = inst.getRowOffset(index), rowHeight, viewHeight, absCushion = Math.abs(inst.options.cushion);
        compileRowSiblings(index);
        if (offset < inst.values.scroll) { // it is above the view.
            inst.scrollModel.scrollTo(offset, immediately);
            return;
        }
        inst.updateViewportHeight();// always update the height before calculating. onResize is not reliable
        viewHeight = inst.getViewportHeight();
        rowHeight = inst.templateModel.getTemplateHeight(inst.getData()[index]);
        if (offset >= inst.values.scroll + viewHeight - rowHeight) { // it is below the view.
            inst.scrollModel.scrollTo(offset - viewHeight + rowHeight, immediately);
        }
        // otherwise it is in view so do nothing.
    };

    function compileRowSiblings(index) {
        if (inst.data[index - 1] && !inst.isCompiled(index - 1)) {
            inst.forceRenderScope(index - 1);
        }
        if (inst.data[index + 1] && !inst.isCompiled(index + 1)) {
            inst.forceRenderScope(index + 1);
        }
    }

    /**
     * Scroll to top.
     * @param immediately
     */
    result.scrollToTop = function (immediately) {
        result.log('scrollToTop');
        inst.scrollModel.scrollTo(0, immediately);
    };

    /**
     * Scroll to bottom.
     * @param immediately
     */
    result.scrollToBottom = function (immediately) {
        result.log('scrollToBottom');
        var value = inst.getContentHeight() - inst.getViewportHeight();
        inst.scrollModel.scrollTo(value >= 0 ? value : 0, immediately);
    };

    function destroy() {
        clearTimeout(waitForStopIntv);
        result.destroyLogger();
        unwatchSetup();
        if (setup) {
            result.removeScrollListener();
            result.removeTouchEvents();
        }
        result = null;
        inst = null;
    }

    /**
     * Wait till the grid is ready before we setup our listeners.
     */
    unwatchSetup = inst.scope.$on(exports.datagrid.events.ON_READY, setupScrolling);
    inst.unwatchers.push(inst.scope.$on(exports.datagrid.events.ON_BEFORE_RESET, onBeforeReset));
    inst.unwatchers.push(inst.scope.$on(exports.datagrid.events.ON_AFTER_RESET, onAfterReset));

    result.destroy = destroy;

    inst.scrollModel = result;// all models should try not to pollute the main model to keep it clean.

    return inst;
};
exports.datagrid.coreAddons.push(exports.datagrid.coreAddons.scrollModel);