// ==UserScript==
// @name        Reply with FediThready
// @namespace   https://fedithready.app
// @description Adds a "Reply with FediThready" button to Mastodon posts
// @version     1.0.0
// @author      FediThready
// @match       https://mastodon.social/*
// @grant       none
// @run-at      document-idle
// @homepageURL https://github.com/masukomi/fedithready
// @supportURL  https://github.com/masukomi/fedithready/issues
// ==/UserScript==

/*
 * CONFIGURATION:
 * WARNING: this will ONLY work on mastodon instances
 *
 * To use this script on your Mastodon instance, add a @match line above
 * with your instance's URL, e.g.:
 *   @match https://your.instance.tld/*
 *
 * You can add multiple @match lines for multiple instances.
 */

(function() {
    'use strict';

    const FEDITHREADY_URL = 'https://fedithready.app';
    const BUTTON_TITLE = 'Reply with FediThready';

    // SVG icon for the button (thread/reply icon)
    const FEDITHREADY_ICON = `<svg class="icon icon-fedithready" width="100%" height="100%" viewBox="0 0 180 180" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;"><path d="M68.171,174.467c-4.745,-0.949 -10.44,-1.899 -13.287,-2.848c-17.083,-5.694 -32.269,-18.032 -37.014,-31.319c-4.745,-12.338 -7.593,-44.607 -7.593,-75.927c0,-23.726 3.797,-34.166 14.237,-43.657c11.389,-10.44 19.93,-13.287 45.555,-15.185c19.931,-1.899 56.945,-0 66.436,2.847c11.389,2.847 22.778,10.44 27.523,19.93c5.695,8.542 5.695,14.237 5.695,43.658c-0.949,15.185 -0.949,28.472 -1.899,31.32c-1.898,6.643 -5.694,13.287 -9.49,18.032c-11.389,11.389 -25.625,14.236 -60.741,14.236c-19.931,0 -31.315,-0.043 -38.908,-2.89c0,-0 -0.195,3.204 -0.005,4.789c0.972,8.082 11.389,18.981 30.371,18.981c9.491,0 28.472,-1.898 30.37,-3.796l0.95,-0l-0,6.643c-0,3.797 -0,6.644 -0.95,7.593c-2.847,1.898 -18.981,6.644 -26.574,7.593c-10.44,0.949 -14.236,0.949 -24.676,-0Z" style="fill:none;fill-rule:nonzero;stroke:#000;stroke-width:8.5px;"/><g><path d="M45.099,31.491c-0,1.157 0.581,2.241 1.543,2.882l7.113,4.742c1.14,0.759 2.476,1.166 3.845,1.166l54.757,0c1.37,0 2.705,-0.407 3.845,-1.166l7.113,-4.742c0.962,-0.641 1.543,-1.725 1.543,-2.882l0,-5.081l-79.759,0l-0,5.081Z" style="fill-rule:nonzero;"/><path d="M45.099,116.573l79.759,-0l-0,-5.08c-0,-1.158 -0.581,-2.241 -1.543,-2.883l-7.114,-4.742c-1.14,-0.763 -2.479,-1.166 -3.844,-1.166l-55.806,-0c-0.685,-0 -1.352,0.203 -1.924,0.581l-7.985,5.327c-0.962,0.641 -1.543,1.725 -1.543,2.883l-0,5.08Z" style="fill-rule:nonzero;"/><rect x="55.502" y="47.217" width="58.952" height="6.936" style="fill-rule:nonzero;"/><rect x="55.502" y="61.088" width="58.952" height="6.936" style="fill-rule:nonzero;"/><rect x="55.502" y="74.955" width="58.952" height="6.936" style="fill-rule:nonzero;"/><path d="M55.502,95.762l55.394,-0c5.419,-0.005 10.575,-2.163 14.411,-5.995c3.832,-3.832 5.96,-9.672 5.995,-14.452c0.034,-4.779 -3.74,-9.76 -3.74,-14.227c0,-4.467 2.407,-9.226 3.075,-12.573c1.002,-5.024 -3.868,-4.497 -6.936,-0c-1.509,2.212 -3.074,8.106 -3.074,12.573c-0,4.467 3.737,9.832 3.739,14.227c0.002,4.799 -3.541,13.549 -13.512,13.512l-55.353,-0l0.001,6.935Z" style="fill-rule:nonzero;"/></g></svg>`;

    // Get the base URL of the current instance
    function getInstanceBaseUrl() {
        return window.location.origin;
    }

    // Extract post URL from a status element
    function getPostUrl(statusElement) {
        // Method 1:
        // look for a specific datetime element
        var timeLink = statusElement.querySelector('a.detailed-status__datetime')
        if (timeLink && timeLink.href && timeLink.href.includes('/@')) {
            return timeLink.href;
        }

        // Method 1: Look for the timestamp link (most reliable)
        // look for a relative datetime element
        var timeLink = statusElement.querySelector('a.status__relative-time, a[href*="/@"]');
        if (timeLink && timeLink.href && timeLink.href.includes('/@')) {
            return timeLink.href;
        }


        // Method 3: Look for data-id attribute and construct URL
        const dataId = statusElement.getAttribute('data-id');
        if (dataId) {
            // Try to find the account username
            const accountLink = statusElement.querySelector('a.status__display-name, .display-name__account');
            if (accountLink) {
                const accountMatch = accountLink.textContent.match(/@(\w+(?:@\w+)?)/);
                if (accountMatch) {
                    return `${getInstanceBaseUrl()}/@${accountMatch[1]}/${dataId}`;
                }
            }
        }

        // Method 4: Look in detailed-status for single post view
        const detailedStatus = statusElement.closest('.detailed-status__wrapper, .focusable');
        if (detailedStatus) {
            const permalink = detailedStatus.querySelector('a[href*="/@"][href*="/"]');
            if (permalink) {
                return permalink.href;
            }
        }

        // Method 5: Check the current URL if viewing a single post
        if (window.location.pathname.match(/\/@[\w]+(?:@[\w]+)?\/\d+/)) {
            return window.location.href;
        }

        return null;
    }

    // Create the FediThready button
    function createFediThreadyButton(postUrl) {
        const wrapper = document.createElement('div');
        wrapper.className = 'detailed-status__button fedithready-button-wrapper';
        wrapper.style.cssText = 'display: inline-flex; align-items: center;';

        const button = document.createElement('button');
        button.className = 'icon-button';
        button.title = BUTTON_TITLE;
        button.type = 'button'
        button.setAttribute('aria-label', BUTTON_TITLE);
        //button.style.cssText = 'cursor: pointer; background: none; border: none; padding: 0; color: inherit;';
        button.innerHTML = FEDITHREADY_ICON;

        button.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (postUrl) {
                const fedithreadyUrl = `${FEDITHREADY_URL}/?replyToUrl=${encodeURIComponent(postUrl)}`;
                window.open(fedithreadyUrl, '_blank');
            } else {
                console.error('FediThready: Could not determine post URL');
                alert('Could not determine the post URL. Please try copying the link manually.');
            }
        });

        // Add hover effect
        button.addEventListener('mouseenter', function() {
            this.style.color = '#6364FF'; // FediThready-ish purple
        });
        button.addEventListener('mouseleave', function() {
            this.style.color = 'inherit';
        });

        wrapper.appendChild(button);
        return wrapper;
    }

    // Process a single status element
    function processStatus(statusElement) {
        // Skip if already processed
        if (statusElement.querySelector('.fedithready-button-wrapper')) {
            return;
        }

        // Find the action bar
        const actionBar = statusElement.querySelector('.status__action-bar, .detailed-status__action-bar');
        if (!actionBar) {
            return;
        }

        // Skip if action bar already has our button
        if (actionBar.querySelector('.fedithready-button-wrapper')) {
            return;
        }

        // Get the post URL
        const postUrl = getPostUrl(statusElement);

        // Find the button wrapper container (timeline view)
        const buttonWrappers = actionBar.querySelectorAll('.status__action-bar__button-wrapper');
        if (buttonWrappers.length > 0) {
            // Create and insert the button after the last existing button
            const lastWrapper = buttonWrappers[buttonWrappers.length - 1];
            const fedithreadyButton = createFediThreadyButton(postUrl);
            lastWrapper.parentNode.insertBefore(fedithreadyButton, lastWrapper.nextSibling);
            return;
        }

        // For detailed-status view, the action bar has a different structure
        // Just append our button to the action bar
        if (actionBar.classList.contains('detailed-status__action-bar')) {
            const fedithreadyButton = createFediThreadyButton(postUrl);
            actionBar.appendChild(fedithreadyButton);
            return;
        }
    }

    // Process action bars directly (for detailed status view)
    function processActionBar(actionBar) {
        // Skip if already processed
        if (actionBar.querySelector('.fedithready-button-wrapper')) {
            return;
        }

        // Find the parent status element to get the URL
        const statusElement = actionBar.closest('.detailed-status, .status, [data-id], .focusable');

        // Get the post URL
        const postUrl = statusElement ? getPostUrl(statusElement) : window.location.href;

        // Create the button
        const fedithreadyButton = createFediThreadyButton(postUrl);

        // Insert before the dropdown menu (detailed-status__action-bar-dropdown)
        const dropdown = actionBar.querySelector('.detailed-status__action-bar-dropdown');
        if (dropdown) {
            actionBar.insertBefore(fedithreadyButton, dropdown);
        } else {
            actionBar.appendChild(fedithreadyButton);
        }
    }

    // Process all statuses on the page
    function processAllStatuses() {
        // Handle regular timeline posts
        const statuses = document.querySelectorAll('.status, .detailed-status');
        statuses.forEach(processStatus);

        // Also check for status wrappers
        const statusWrappers = document.querySelectorAll('[data-id]');
        statusWrappers.forEach(function(wrapper) {
            if (wrapper.querySelector('.status__action-bar, .detailed-status__action-bar')) {
                processStatus(wrapper);
            }
        });

        // Directly process any detailed-status action bars we find
        const detailedActionBars = document.querySelectorAll('.detailed-status__action-bar');
        detailedActionBars.forEach(processActionBar);

        // Debug: log what we found
        // console.log('FediThready: Found', statuses.length, 'statuses,', detailedActionBars.length, 'detailed action bars');
    }

    // Set up MutationObserver to handle dynamically loaded content
    function setupObserver() {
        const observer = new MutationObserver(function(mutations) {
            let shouldProcess = false;

            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if the added node is a status or contains statuses/action bars
                            if (node.classList &&
                                (node.classList.contains('status') ||
                                 node.classList.contains('detailed-status') ||
                                 node.classList.contains('detailed-status__action-bar') ||
                                 node.classList.contains('status__action-bar') ||
                                 node.querySelector('.status, .detailed-status, .detailed-status__action-bar'))) {
                                shouldProcess = true;
                            }
                        }
                    });
                }
            });

            if (shouldProcess) {
                // Debounce processing
                clearTimeout(window.fedithreadyProcessTimeout);
                window.fedithreadyProcessTimeout = setTimeout(processAllStatuses, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Initialize
    function init() {
        // Process existing statuses
        processAllStatuses();

        // Set up observer for new statuses
        setupObserver();

        console.log('FediThready: Reply button script initialized');
    }

    // Wait for the page to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Small delay to ensure Mastodon's JS has initialized
        setTimeout(init, 500);
    }
})();
