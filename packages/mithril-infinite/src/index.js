import m from "mithril";
import { classes } from "./classes";
import { getElementSize, isElementInViewport } from "./util";
import { page } from "./page";
import { placeholder } from "./placeholder";
import "./css";

const SCROLLING_UPDATE_DELAY = 200;
const WATCH_IS_SCROLLING_DELAY = 60;
const SEL_PADDING = "000000";

const numToId = pageNum =>
  SEL_PADDING.substring(0, SEL_PADDING.length - ("" + pageNum).length) + pageNum;

const calculateCurrentPageNum = (scrollAmount, state) => {
  const pageNumKeys = state.sortedKeys;
  if (pageNumKeys.length === 0) {
    return 1;
  }
  let acc = state.beforeSize || 0;
  let currentPageNum = 1;
  for (let i = 0; i < pageNumKeys.length; i = i + 1) {
    let pageKey = pageNumKeys[i];
    if (scrollAmount > acc) {
      currentPageNum = parseInt(pageKey, 10);
    }
    acc += state.pageSizes[pageKey];
  }
  return currentPageNum;
};

const calculateContentSize = (from, to, state) => {
  const fromIndex = Math.max(0, from - 1);
  if (to < fromIndex) {
    return 0;
  }
  const toIndex = to;
  const pageNumKeys = state.sortedKeys.slice(fromIndex, toIndex);
  let size = state.beforeSize || 0;
  size = pageNumKeys.reduce((total, pageKey) => (
    total += state.pageSizes[pageKey] || 0
  ), size);
  size += state.afterSize || 0;
  return size;
};

const isPageInViewport = (page, axis, state, scrollView) => {
  if (!scrollView) {
    return false;
  }
  const id = numToId(page);
  const el = scrollView.querySelector(`[data-page="${id}"]`);
  return isElementInViewport({ el, axis });
};

const updatePageSize = state => (pageId, size) => (
  state.pageSizes[pageId] = parseInt(size, 10),
  state.sortedKeys = Object.keys(state.pageSizes).sort(),
  calculatePreloadSlots(state)
);

const updatePart = (dom, whichSize, state, axis) => {
  const size = getElementSize(dom, axis);
  if (size) {
    state[whichSize] = size;
  }
};

const calculatePreloadSlots = state => {
  if (!state.scrollView) return;
  const boundingClientRect = state.scrollView.getBoundingClientRect();
  state.boundingClientRect = state.boundingClientRect || boundingClientRect;
  if (boundingClientRect.width !== state.boundingClientRect.width
    || boundingClientRect.height !== state.boundingClientRect.height
  ) {
    state.preloadSlots = state.attrsPreloadSlots || 1;
  }
  state.boundingClientRect = boundingClientRect;

  // calculate if we have room on the screen to show more slots
  if (state.contentSize
    && (state.preloadSlots < state.pageCount)
    && (state.preloadSlots <= state.attrsMaxPreloadSlots)
    && (state.contentSize < boundingClientRect.height)
  ) {
    state.preloadSlots++;
    setTimeout(m.redraw, 0);
  }
};

const getPageList = (currentPageNum, fromPage, toPage, currentPage, preloadSlots, maxPages) => {
  const minPageNum = fromPage
    ? parseInt(fromPage, 10)
    : currentPage
      ? currentPage
      : 1;
  const maxPageNum = toPage
    ? parseInt(toPage, 10)
    : currentPage
      ? currentPage
      : maxPages;
  const pages = [];
  const prePages = [];
  for (let i = -preloadSlots; i <= preloadSlots; i = i + 1) {
    const pageNum = currentPageNum + i;
    if (pageNum >= minPageNum && pageNum <= maxPageNum) {
      pages.push(pageNum);
    }
  }
  for (let pageNum = 1; pageNum < pages[0]; pageNum = pageNum + 1) {
    prePages.push(pageNum);
  }
  return {pages, prePages, maxPageNum};
};

const oninit = vnode => {
  const attrs = vnode.attrs;
  // Memoize some properties that do not change
  const axis = attrs.axis || "y";
  const whichScroll = axis === "x" ? "scrollLeft" : "scrollTop";
  const autoSize = (attrs.autoSize !== undefined && attrs.autoSize === false) ? false : true;
  const pageSize = attrs.pageSize;
  const scrollThrottle = attrs.throttle !== undefined ? attrs.throttle * 1000 : SCROLLING_UPDATE_DELAY;
  const contentTag = attrs.contentTag || "div";
  const classList = [
    classes.scrollView,
    axis === "x"
      ? classes.scrollViewX
      : classes.scrollViewY,
    attrs.class
  ].join(" ");

  const scroll = () => {
    const state = vnode.state;
    state.isScrolling = true;
    // throttle updates while scrolling
    if (!state.scrollWatchUpdateStateId) {
      state.scrollWatchUpdateStateId = setTimeout(() => {
        // update pages
        m.redraw();
        state.scrollWatchUpdateStateId = null;
        state.isScrolling = false;
        setTimeout(() => {
          if (state.isScrolling === false) {
            m.redraw();
          }
        }, WATCH_IS_SCROLLING_DELAY);
      }, state.scrollThrottle);
    }
  };

  vnode.state = {
    afterSize: null,
    beforeSize: null,
    boundingClientRect: {},
    currentPageNum: 0,
    isScrolling: false,
    pageSizes: {},
    preloadSlots: attrs.preloadPages || 1,
    scrollView: null,
    scrollWatchUpdateStateId: null,
    sortedKeys: [],

    // Memoized
    attrsMaxPreloadSlots: attrs.maxPreloadPages || Number.MAX_VALUE,
    attrsPreloadSlots: attrs.preloadPages || 1,
    autoSize,
    axis,
    classList,
    contentTag,
    pageSize,
    scroll,
    scrollThrottle,
    whichScroll,
  };
};

const view = ({ state, attrs }) => {
  const scrollAmount = state.scrollView ? state.scrollView[state.whichScroll] : 0;
  const axis = state.axis;
  const maxPages = attrs.maxPages !== undefined ? attrs.maxPages : Number.MAX_VALUE;
  
  const currentPageNum = attrs.currentPage
    ? parseInt(attrs.currentPage, 10)
    : calculateCurrentPageNum(scrollAmount, state);

  if (attrs.pageChange && currentPageNum !== state.currentPageNum) {
    attrs.pageChange(currentPageNum);
  }
  state.currentPageNum = currentPageNum;

  if (state.scrollView && attrs.getDimensions) {
    attrs.getDimensions({
      scrolled: scrollAmount,
      size: state.contentSize
    });
  }

  const { pages, prePages, maxPageNum } = getPageList(currentPageNum, attrs.from, attrs.to, attrs.currentPage, state.preloadSlots, maxPages);
  state.contentSize = calculateContentSize(1, maxPageNum, state);
  state.pageCount = pages.length;

  const isLastPageVisible = maxPageNum
    ? isPageInViewport(maxPageNum, axis, state, state.scrollView)
    : true;

  return m("div",
    {
      oncreate: ({ dom }) => {
        state.scrollView = attrs.scrollView
          ? document.querySelector(attrs.scrollView)
          : dom;
        state.scrollView.className += " " + state.classList;

        if (attrs.setDimensions) {
          const dimensions = attrs.setDimensions();
          if (dimensions.size > 0) {
            const whichSize = axis === "x"
              ? "width"
              : "height";
            dom.style[whichSize] = dimensions.size + "px";
          }
          state.scrollView[state.whichScroll] = dimensions.scrolled;
        }
        state.scrollView.addEventListener("scroll", state.scroll);
      },
      onremove: () => state.scrollView.removeEventListener("scroll", state.scroll)
    },
    m("div",
      {
        class: classes.scrollContent,
        style: !state.autoSize
          ? null
          : Object.assign(
            {},
            axis === "x"
              ? { width: state.contentSize + "px" }
              : { height: state.contentSize + "px" },
            attrs.contentSize
              ? axis === "x"
                ? { "min-width": attrs.contentSize + "px" }
                : { "min-height": attrs.contentSize + "px" }
              : {}
        )
      },
      [
        m(state.contentTag, { class: classes.content }, [
          attrs.before
            ? m("div", {
              class: classes.before,
              oncreate: ({ dom }) => updatePart(dom, "before", state, axis),
              onupdate: ({ dom }) => updatePart(dom, "before", state, axis)
            }, attrs.before)
            : null,
          m("div", { class: classes.pages }, [
            prePages.map(pageNum => 
              m(placeholder, {
                axis,
                key: numToId(pageNum),
                pageId: numToId(pageNum),
                pageNum,
                pageSizes: state.pageSizes
              })
            ),
            pages.map(pageNum =>
              m(page, {
                autoSize: state.autoSize,
                axis,
                isScrolling: state.isScrolling,
                item: attrs.item,
                key: numToId(pageNum),
                pageData: attrs.pageData,
                pageId: numToId(pageNum),
                pageNum,
                pageSize: state.pageSize,
                pageSizes: state.pageSizes,
                pageTag: attrs.pageTag,
                pageUrl: attrs.pageUrl,
                updatePageSize: updatePageSize(state)
              })
            )
          ]),
          // only show "after" when content is available
          attrs.after && state.contentSize
            ? m("div", {
              class: classes.after,
              style: {
                // visually hide this element until the last page is into view
                // to prevent flashes of after content when scrolling fast
                visibility: isLastPageVisible ? "visible" : "hidden"
              },
              oncreate: ({ dom }) => updatePart(dom, "after", state, axis),
              onupdate: ({ dom }) => updatePart(dom, "after", state, axis),
            }, attrs.after)
            : null
        ])
      ]
    )
  );
};

export const infinite = {
  oninit,
  view,
  isElementInViewport
};

