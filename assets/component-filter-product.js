(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, (global.themegoal = global.themegoal || {}, global.themegoal.components_business = global.themegoal.components_business || {}, global.themegoal.components_business.filter_products = factory()));
  })(this, (function () { 'use strict';

  class FilterProducts {
    constructor(element) {
      this.element = element;
      this.delegateElement = new themegoal.libs.Delegate(this.element);
      //replace conent, layout switch srcoll
      this.filterProductsElement = this.element.querySelector('.FilterProducts');
      this.filterProductsContentElement = this.element.querySelector('.FilterProducts__Content');
  
      this.settings = JSON.parse(this.element.getAttribute('data-section-settings'));
      this.currentSortBy = this.settings['sortBy'];
      this.filterRequestPromise = null;
  
      new TG_ProductCardColorSwatch();
  
      this.options = JSON.parse(this.element.getAttribute('data-section-settings'));
        
      if (this.options['animationType'] === 'staggering') {
        this._setupAnimation();
      }
  
      this._initPriceRangeAsideSlider();
      this._initPriceRangeDrawerSlider();
  
      this._bindEventsListeners();
      this._setupLoadMoreObserver();
    }
  
    _debounce(fn, wait) {
      let t;
      let lastArgs;
      let debounced = (...args) => {
        clearTimeout(t);
        lastArgs = args;
        t = setTimeout(() => {
          t = null;
          fn.apply(this, lastArgs);
        }, wait);
      };
      debounced.flush = () => {
        if (!t) return null;
        clearTimeout(t);
        t = null;
        return fn.apply(this, lastArgs);
      };
      return debounced;
    }
  
    _bindEventsListeners() {
      this._onInputListener = this._debounce(this._toggleFilter.bind(this), 500);
  
      this.delegateElement.on('click', '[data-tg-action="change-sort"]', this._sortByChanged.bind(this));
  
      this.delegateElement.on('click', '.FilterProducts__Form .ProductFilters__Item', this._onInputListener);

      this.delegateElement.on('click', '[data-tg-action="apply-price"]', this._onInputListener);

      // Active filter tags + "Clear all": intercept and route through AJAX.
      this.delegateElement.on('click', '[data-filter-tag]', this._onTagClick.bind(this));
      this.delegateElement.on('click', '[data-filter-clear]', this._onTagClick.bind(this));

      // Apply the latest debounced filter update before closing the mobile drawer.
      this.delegateElement.on('click', '[data-filter-apply]', this._onDrawerApply.bind(this));

      // The toolbar can be replaced while the drawer is open. Always resolve the
      // current trigger after closing, including Close/Escape paths.
      let filterDrawer = this.element.querySelector('#FilterProductsDrawer');
      if (filterDrawer) {
        filterDrawer.addEventListener('hidden.tg.Drawer', this._restoreFilterTriggerFocus.bind(this));
      }

      // Load more: fetch the next page and append products (keeps current filters).
      this.delegateElement.on('click', '[data-load-more]', this._onLoadMore.bind(this));

      // Grid / list view toggle. The class lives on the persistent section element
      // so it survives AJAX re-renders; the active-button state is derived in CSS.
      this.delegateElement.on('click', '[data-view]', this._onViewToggle.bind(this));

      // Brand search: client-side filter of the brand checkboxes. Delegated on the
      // section so it keeps working after the filter form is replaced by AJAX.
      let _this = this;
      this.element.addEventListener('input', function (event) {
        if (event.target && event.target.matches && event.target.matches('[data-filter-search]')) {
          _this._onBrandSearch(event.target);
        }
      });

      window.addEventListener('popstate', function () {
        // popstate can have a null state (for example, when returning to the page's
        // first history entry). The address bar is the source of truth in both cases.
        _this._fetchAndRender(window.location.href, {
          updateHistory: false,
          scroll: false,
          preserveSort: false,
          fallbackToNavigation: true
        });
      });
    }
  
    _setupAnimation() {
      var _this = this;
  
      //_setupAnimation(true),ajax 
      var forceLoadFromTop = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
  
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
      }
  
      if (forceLoadFromTop) {
        themegoal.libs.anime({
          targets: this.filterProductsContentElement.querySelectorAll('.ProductCard'),
          opacity: [0, 1],
          translateY: [30,0],
          duration: 500,
          easing: 'cubicBezier(.5, .05, .1, .3)',
          delay: themegoal.libs.anime.stagger(300)
        });
        
      } else {
        
        this.intersectionObserver = new IntersectionObserver(this._reveal.bind(this), {
          threshold: 0.3
        });
  
        themegoal.helpers.Dom.nodeListToArray(this.filterProductsContentElement.querySelectorAll('.ProductCard')).forEach(function (item) {
          _this.intersectionObserver.observe(item);
        });
  
      }
    }
  
    _reveal(results) {
      var _this = this;
  
      var toReveal = [];
  
      results.forEach(function (result) {
        if (result.isIntersecting || result.intersectionRatio > 0) {
          toReveal.push(result.target);
          _this.intersectionObserver.unobserve(result.target);
        }
      });
  
      if (toReveal.length === 0) {
        return;
      }
  
      themegoal.libs.anime({
        targets: toReveal,
        opacity: [0, 1],
        translateY: [30,0],
        duration: 500,
        easing: 'cubicBezier(.5, .05, .1, .3)',
        delay: themegoal.libs.anime.stagger(300)
      });
    }
  
    _sortByChanged(event, target) {
      if (event && event.preventDefault) event.preventDefault();
      let sortBy = target.getAttribute("data-value");
      if (this.currentSortBy === sortBy) {
        return;
      }

      let previousSortBy = this.currentSortBy;
      this.currentSortBy = sortBy;

      // Keep the toolbar and mobile drawer aligned immediately. If the request
      // fails, restore both controls to the last accepted sort.
      this._syncSortControls(sortBy);

      let _this = this;
      return Promise.resolve(this._reloadFromCurrentForm(target)).then(function (success) {
        if (success === false && _this.currentSortBy === sortBy) {
          _this.currentSortBy = previousSortBy;
          _this._syncSortControls(previousSortBy);
        }
        return success;
      });
    }

    _syncSortControls(sortBy) {
      if (!sortBy) return;

      let selectedLabel = '';
      let controls = this.element.querySelectorAll('[data-tg-action="change-sort"]');
      controls.forEach(function (item) {
        let isSelected = item.getAttribute('data-value') === sortBy;
        item.classList.toggle('Active', isSelected);
        item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        if (isSelected && !selectedLabel) selectedLabel = item.textContent.trim();
      });

      if (selectedLabel) {
        let currentLabels = this.element.querySelectorAll('.CollectionSort__Current');
        currentLabels.forEach(function (label) {
          label.textContent = selectedLabel;
        });
      }
    }
  
    _toggleFilter(event, target){
      if(target.classList.contains("Active")){
        target.classList.remove("Active");
      }else{
        target.classList.add("Active");
      }

      return this._reloadFromCurrentForm(target);
    }

    _reloadFromCurrentForm(target) {
      let filterFrom = target.getAttribute("data-filter-from");

      if(this.element.querySelector('.FilterProducts__Form--aside') || this.element.querySelector('.FilterProducts__Form--drawer') ){
        let formData;
        if(filterFrom != undefined && filterFrom == 'aside'){
          formData = new FormData(this.element.querySelector('.FilterProducts__Form--aside'));
        }else{
          formData = new FormData(this.element.querySelector('.FilterProducts__Form--drawer'));
        }

        const searchParams = new URLSearchParams(formData).toString();
        return this._reloadProducts(searchParams, filterFrom);
      }else{
        //disable filtering
        return this._reloadProducts("", filterFrom);
      }
    }
  
  
    // Remove a single active filter (or clear all) via its href, using the same
    // fetch+render path as the checkboxes so the grid + tags + forms stay in sync.
    _onTagClick(event, target) {
      if (event && event.preventDefault) event.preventDefault();
      let url = target.getAttribute('href');
      if (!url) return;
      this._fetchAndRender(url);
    }

    _onDrawerApply(event, target) {
      if (event && event.preventDefault) event.preventDefault();

      let drawer = target.closest('.Drawer');
      if (!drawer) return;

      target.disabled = true;
      target.setAttribute('aria-busy', 'true');

      // A checkbox update is debounced. Flush it so "See results" always waits
      // for the latest selection rather than closing on stale results.
      let pendingRequest = this._onInputListener.flush();
      if (!pendingRequest) pendingRequest = this.filterRequestPromise || Promise.resolve();

      Promise.resolve(pendingRequest).finally(function () {
        target.disabled = false;
        target.removeAttribute('aria-busy');
        themegoal.components.Drawer.getOrCreateInstance(drawer).hide();
      });
    }

    _restoreFilterTriggerFocus() {
      // The original trigger may have been detached by the AJAX grid update.
      let trigger = this.element.querySelector('[data-tg-target="#FilterProductsDrawer"]');
      if (trigger && trigger.focus) {
        window.requestAnimationFrame(function () { trigger.focus(); });
      }
    }

    _onViewToggle(event, target) {
      if (event && event.preventDefault) event.preventDefault();
      let view = target.getAttribute('data-view');
      this.element.classList.toggle('Collection--view-list', view === 'list');
    }

    // Show/hide brand checkboxes whose label doesn't match the typed query.
    _onBrandSearch(input) {
      let query = (input.value || '').trim().toLowerCase();
      let scope = input.closest('.Accordion__Collapse') || input.parentElement;
      if (!scope) return;
      let items = scope.querySelectorAll('.ProductFilters__Item');
      Array.prototype.forEach.call(items, function (item) {
        let labelEl = item.querySelector('.ProductFilters__ItemLabel');
        let text = labelEl ? labelEl.textContent.toLowerCase() : '';
        if (query === '' || text.indexOf(query) !== -1) {
          item.classList.remove('ProductFilters__Item--hiddenBySearch');
        } else {
          item.classList.add('ProductFilters__Item--hiddenBySearch');
        }
      });
    }

    _setupLoadMoreObserver() {
      if (this.loadMoreObserver) {
        this.loadMoreObserver.disconnect();
      }

      let target = this.element.querySelector('[data-load-more]');
      if (!target || !('IntersectionObserver' in window)) return;

      this.loadMoreObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || target.hasAttribute('data-loading')) return;
          observer.unobserve(target);
          target.click();
        });
      }, { rootMargin: '500px 0px', threshold: 0 });

      this.loadMoreObserver.observe(target);
    }

    // Fetch the next page and append its products to the current grid, then
    // update (or remove) the load-more button. Current filters/sort are already
    // baked into paginate.next.url, so they carry over automatically.
    _onLoadMore(event, target) {
      if (event && event.preventDefault) event.preventDefault();
      let url = target.getAttribute('href');
      try {
        url = this._prepareAjaxUrl(url);
      } catch (error) {
        return;
      }
      if (!url || target.hasAttribute('data-loading')) return;

      let _this = this;
      let progress = this.element.querySelector('[data-load-more-progress]');
      let status = this.element.querySelector('[data-load-more-status]');
      let remaining = progress ? progress.getAttribute('data-remaining') : '';
      target.setAttribute('data-loading', '');
      target.setAttribute('aria-busy', 'true');
      target.classList.add('is-loading');
      if (status) {
        status.hidden = false;
        status.textContent = 'Loading more products' + (remaining ? ' · ' + remaining + ' remaining' : '') + '…';
      }

      fetch(url, { credentials: 'same-origin', method: 'GET' })
        .then(function (response) { return response.text(); })
        .then(function (content) {
          let temp = document.createElement('div');
          temp.innerHTML = content;

          let currentGrid = _this.element.querySelector('[data-product-grid]');
          let newGrid = temp.querySelector('[data-product-grid]');

          if (currentGrid && newGrid) {
            let appended = [];
            Array.prototype.slice.call(newGrid.children).forEach(function (item) {
              currentGrid.appendChild(item);
              appended.push(item);
            });

            if (_this.options['animationType'] === 'staggering' && themegoal.libs && themegoal.libs.anime) {
              themegoal.libs.anime({
                targets: appended.map(function (i) { return i.querySelector('.ProductCard'); }).filter(Boolean),
                opacity: [0, 1],
                translateY: [30, 0],
                duration: 500,
                easing: 'cubicBezier(.5, .05, .1, .3)',
                delay: themegoal.libs.anime.stagger(120)
              });
            }
          }

          // Point the button at the following page, or remove it on the last page.
          let nextButton = temp.querySelector('[data-load-more]');
          let nextProgress = temp.querySelector('[data-load-more-progress]');
          if (progress && nextProgress) {
            progress.textContent = nextProgress.textContent.trim();
            progress.setAttribute('data-loaded', nextProgress.getAttribute('data-loaded'));
            progress.setAttribute('data-remaining', nextProgress.getAttribute('data-remaining'));
          }

          if (status) {
            status.hidden = true;
            status.textContent = '';
          }

          if (nextButton) {
            target.setAttribute('href', nextButton.getAttribute('href'));
            target.removeAttribute('data-loading');
            target.removeAttribute('aria-busy');
            target.classList.remove('is-loading');
            _this._setupLoadMoreObserver();
          } else {
            target.remove();
            if (_this.loadMoreObserver) _this.loadMoreObserver.disconnect();
          }
        })
        .catch(function () {
          target.removeAttribute('data-loading');
          target.removeAttribute('aria-busy');
          target.classList.remove('is-loading');
          if (status) {
            status.hidden = false;
            status.textContent = 'Products could not be loaded. Please use the button to try again.';
          }
        });
    }

    _prepareAjaxUrl(rawUrl, options) {
      let requestOptions = options || {};
      let currentUrl = new URL(window.location.href);
      let nextUrl = new URL(rawUrl, window.location.origin);

      // Filter removal URLs can omit page context. Preserve it only while staying
      // on the same collection/search route, so a clear action cannot switch from
      // the product view or drop the search term/type.
      if (nextUrl.pathname === currentUrl.pathname) {
        ['view', 'options[prefix]', 'q', 'type'].forEach(function (param) {
          if (!nextUrl.searchParams.has(param) && currentUrl.searchParams.has(param)) {
            nextUrl.searchParams.set(param, currentUrl.searchParams.get(param));
          }
        });
      }

      if (requestOptions.preserveSort !== false && !nextUrl.searchParams.has('sort_by') && this.currentSortBy) {
        nextUrl.searchParams.set('sort_by', this.currentSortBy);
      }

      return nextUrl.toString();
    }

    _reloadProducts(searchParams, filterFrom) {
      let newUrl = new URL(this.settings['url'], window.location.origin);
      newUrl.searchParams.set('sort_by', this.currentSortBy);
      newUrl.searchParams.set('options[prefix]', 'last');

      if (searchParams !== '') {
        new URLSearchParams(searchParams).forEach(function (value, key) {
          newUrl.searchParams.append(key, value);
        });
      }

      return this._fetchAndRender(newUrl.toString());
    }

    _fetchAndRender(rawUrl, options) {
      let _this = this;
      let requestOptions = options || {};
      let newUrl;

      try {
        newUrl = this._prepareAjaxUrl(rawUrl, {
          preserveSort: requestOptions.preserveSort !== false
        });
      } catch (error) {
        return Promise.resolve(false);
      }

      if (this.filterRequestController) {
        this.filterRequestController.abort();
      }

      let requestController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      this.filterRequestController = requestController;

      document.dispatchEvent(new CustomEvent('theme:loading:start'));

      let request = fetch(newUrl, {
        credentials: 'same-origin',
        method: 'GET',
        signal: requestController ? requestController.signal : undefined
      }).then(function (response) {
        if (!response.ok) {
          throw new Error('Filter request failed with status ' + response.status);
        }
        return response.text();
      }).then(function (content) {
          var tempElement = document.createElement('div');
          tempElement.innerHTML = content;

          var newContent = tempElement.querySelector('.FilterProducts__Content');
          if (!newContent) {
            throw new Error('Filter response did not contain product-grid content');
          }

          // When history returns to a URL without an explicit sort, accept the
          // server-rendered collection default instead of reusing stale memory.
          let acceptedSortBy = new URL(newUrl).searchParams.get('sort_by');
          if (!acceptedSortBy) {
            let responseSortControl = tempElement.querySelector('[data-tg-action="change-sort"].Active, [data-tg-action="change-sort"][aria-pressed="true"]');
            acceptedSortBy = responseSortControl
              ? responseSortControl.getAttribute('data-value')
              : _this.settings['sortBy'];
          }

          // Do not mutate the page or browser history until the response is known to
          // be a valid filterable page. A landing-page or error response leaves the
          // current products and URL untouched.
          _this.filterProductsContentElement.innerHTML = newContent.innerHTML;
  
          let itemsCountElement = tempElement.querySelector('.CollectionToolBar__ResultCount');
  
          if(itemsCountElement){
            let itemsCountNumber = itemsCountElement.getAttribute("data-items-count");
            let resultCountText = itemsCountElement.textContent.trim();
  
            let targetCountEle = _this.element.querySelector(".CollectionAside__ProductCount");
            if(targetCountEle && itemsCountNumber){
              targetCountEle.innerHTML = itemsCountNumber;
            }

            let drawerResultCount = _this.element.querySelector('[data-filter-result-count]');
            if (drawerResultCount && resultCountText) {
              drawerResultCount.textContent = resultCountText;
            }
          }

          let filterProductsFormAside = tempElement.querySelector('.FilterProducts__Form--aside');
          let targetFilterProductsFormAside = _this.element.querySelector(".FilterProducts__Form--aside");

          let filterProductsFormDrawer = tempElement.querySelector('.FilterProducts__Form--drawer');
          let targetFilterProductsFormDrawer = _this.element.querySelector(".FilterProducts__Form--drawer");

          let accordionHeaders = tempElement.querySelectorAll(".FilterProducts__Form .Accordion__Button");
          let accordionBodys = tempElement.querySelectorAll(".FilterProducts__Form .Accordion__Collapse");
  
          accordionHeaders.forEach(function (item) {
            let itemId = item.getAttribute("id");

            if(itemId){
              let preItem =  _this.element.querySelector("#"+itemId);
              if(preItem){
                item.setAttribute("class",  preItem.getAttribute("class"));
                item.setAttribute("aria-expanded", preItem.getAttribute("aria-expanded"));
              }
            }

          });
          accordionBodys.forEach(function (item) {
            let itemId = item.getAttribute("id");

            if(itemId){
              let preItem =  _this.element.querySelector("#"+itemId);
              if(preItem){
                item.setAttribute("class",  preItem.getAttribute("class"));
              }
            }
          });

          if(filterProductsFormAside && targetFilterProductsFormAside){
            targetFilterProductsFormAside.innerHTML = filterProductsFormAside.innerHTML; 
          }

          if(filterProductsFormDrawer && targetFilterProductsFormDrawer){
            targetFilterProductsFormDrawer.innerHTML = filterProductsFormDrawer.innerHTML; 
          }

          _this.currentSortBy = acceptedSortBy;
          _this._syncSortControls(acceptedSortBy);

          _this._initPriceRangeAsideSlider();
          _this._initPriceRangeDrawerSlider();
          
          if (_this.options['animationType'] === 'staggering') {
            _this._setupAnimation(true);
          }

          _this._setupLoadMoreObserver();

          if (requestOptions.updateHistory !== false && history.pushState) {
            window.history.pushState({ path: newUrl }, '', newUrl);
          }
  
          var elementOffset = _this.filterProductsElement.getBoundingClientRect().top - parseInt(document.documentElement.style.getPropertyValue('--tg-header-height'))  - parseInt(document.documentElement.style.getPropertyValue('--tg-announcement-bar-height'));
  
          if (requestOptions.scroll !== false && elementOffset < 0) {
            window.scrollBy({ top: elementOffset, behavior: 'smooth' });
          }
          return true;
      }).catch(function (error) {
        if (!error || error.name !== 'AbortError') {
          console.warn('Unable to update product filters.', error);
          if (requestOptions.fallbackToNavigation) {
            window.location.assign(newUrl);
          }
        }
        return false;
      }).finally(function () {
        if (_this.filterRequestController === requestController) {
          _this.filterRequestController = null;
          document.dispatchEvent(new CustomEvent('theme:loading:end'));
        }
        if (_this.filterRequestPromise === request) {
          _this.filterRequestPromise = null;
        }
      });

      this.filterRequestPromise = request;
      return request;
    }
  
    _initPriceRangeAsideSlider(){
      let asidePriceSlider = document.getElementById('Aside-Price-Slider');
  
      if(!(window.noUiSlider && asidePriceSlider)){
        return;
      }
  
      let maxRangeValue = asidePriceSlider.getAttribute("data-tg-max-price");
  
      let drawerPriceMin = document.getElementById('Filter-Aside-Min-Price');
      let drawerPriceMax = document.getElementById('Filter-Aside-Max-Price');
  
      drawerPriceMin.setAttribute("readonly", "true");
      drawerPriceMax.setAttribute("readonly", "true");
  
      let handleMin = 0;
      let handleMax = parseFloat(maxRangeValue);
  
      if(drawerPriceMin.value != ""){
        handleMin = parseFloat(drawerPriceMin.value);
      }
  
      if(drawerPriceMax.value != ""){
        handleMax = parseFloat(drawerPriceMax.value);
      }
  
      noUiSlider.create(asidePriceSlider, {
          start: [handleMin, handleMax],
          tooltips: [
            true, 
            true 
          ],
          connect: true,
          range: {
              'min': 0,
              'max': parseFloat(maxRangeValue)
          }
      });
  
      asidePriceSlider.noUiSlider.on('update', function (values, handle) {
          if(handle == 0){
              drawerPriceMin.value = values[handle];
          }
          if(handle == 1){
              drawerPriceMax.value = values[handle];
          }
      });
    
    }
  
    _initPriceRangeDrawerSlider(){
      let drawerPriceSlider = document.getElementById('Drawer-Price-Slider');
  
      if(!(window.noUiSlider && drawerPriceSlider)){
        return;
      }
  
      let maxRangeValue = drawerPriceSlider.getAttribute("data-tg-max-price");
  
      let drawerPriceMin = document.getElementById('Filter-Drawer-Min-Price');
      let drawerPriceMax = document.getElementById('Filter-Drawer-Max-Price');
  
      drawerPriceMin.setAttribute("readonly", "true");
      drawerPriceMax.setAttribute("readonly", "true");
  
      let handleMin = 0;
      let handleMax = parseFloat(maxRangeValue);
  
      if(drawerPriceMin.value != ""){
        handleMin = parseFloat(drawerPriceMin.value);
      }
  
      if(drawerPriceMax.value != ""){
        handleMax = parseFloat(drawerPriceMax.value);
      }
  
      noUiSlider.create(drawerPriceSlider, {
          start: [handleMin, handleMax],
          tooltips: [
            true, 
            true 
          ],
          connect: true,
          range: {
              'min': 0,
              'max': parseFloat(maxRangeValue)
          }
      });
  
      drawerPriceSlider.noUiSlider.on('update', function (values, handle) {
          if(handle == 0){
              drawerPriceMin.value = values[handle];
          }
          if(handle == 1){
              drawerPriceMax.value = values[handle];
          }
      });
    }
  
  }

  const components_business = {
    FilterProducts
  };

  return components_business;

}));
