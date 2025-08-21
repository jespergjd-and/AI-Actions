const AGENT_ACTIONS = {
  navigate_to_page: {
    execute: async (params) => {
      console.log(params.page);
      const page = params?.page;
      
      if (!page || typeof page !== 'string') {
        return {
          status: "FAILED",
          responseMessage: "Invalid page parameter provided.",
        };
      }

      // Get current hostname with fallback
      const currentHostname = window?.location?.hostname || 'app.onaskcody.com';
      
      try {
        const pageMapping = getPageMapping(currentHostname);
        const baseUrl = pageMapping[page.toLowerCase()];

        if (!baseUrl) {
          return {
            status: "FAILED",
            responseMessage: `Page "${page}" not found. Available pages: ${Object.keys(pageMapping).join(', ')}.`,
          };
        }

        // Validate URL
        if (!isValidUrl(baseUrl)) {
          return {
            status: "FAILED",
            responseMessage: `Invalid URL generated for page "${page}".`,
          };
        }

        // Check if navigation is cross-domain
        const targetUrl = new URL(baseUrl);
        const isCrossDomain = targetUrl.hostname !== currentHostname;

        if (isCrossDomain) {
          return await showCrossDomainConfirmation(page, baseUrl, targetUrl.hostname, currentHostname);
        }

        // Same domain - prefetch with timeout
        try {
          const response = await fetchWithTimeout(baseUrl, {
            method: 'HEAD',
            credentials: 'include',
          }, 5000);

          if (response.status === 401) {
            return {
              status: "FAILED",
              responseMessage: `Access denied to "${page}". You might not have the correct role or permissions to access this page.`,
            };
          }

          if (response.status === 403) {
            return {
              status: "FAILED",
              responseMessage: `Forbidden access to "${page}". Please contact your administrator.`,
            };
          }

          if (!response.ok) {
            return {
              status: "WARNING",
              responseMessage: `Server returned status ${response.status} for "${page}". Attempting navigation anyway.`,
              action: () => window.location.href = baseUrl
            };
          }

          // Successful prefetch
          window.location.href = baseUrl;
          return {
            status: "SUCCESS",
            responseMessage: `Successfully navigated to "${page}".`,
          };

        } catch (error) {
          console.warn('Prefetch failed:', error.message);
          
          // Attempt navigation anyway (might be CORS issue)
          window.location.href = baseUrl;
          return {
            status: "WARNING",
            responseMessage: `Navigated to "${page}", but could not verify accessibility: ${error.message}`,
          };
        }

      } catch (error) {
        console.error('Navigation error:', error);
        return {
          status: "FAILED",
          responseMessage: `Failed to navigate to "${page}": ${error.message}`,
        };
      }
    },
  }
};

// Utility functions
function getPageMapping(hostname) {
  const isUSDomain = hostname === 'app.goaskcody.com';
  const appDomain = isUSDomain ? 'app.goaskcody.com' : 'app.onaskcody.com';
  const euDomain = isUSDomain ? 'us.goaskcody.com' : 'eu.onaskcody.com';
  
  return {
    dashboard: `https://${appDomain}/manager/dashboard/`,
    home: `https://${appDomain}/manager/dashboard/`,
    settings: `https://${appDomain}/manager/admin_center/`,
    central: `https://${euDomain}/central/events`,
    maps: `https://${euDomain}/maps/personal`,
    bookings: `https://${euDomain}/all-bookings`,
    services: `https://${appDomain}/manager/meeting/deliveries/`,
    visitors: `https://${appDomain}/manager/welcome/guests/`,
    insights: `https://${appDomain}/manager/insights/`,
  };
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function fetchWithTimeout(url, options, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timeoutId);
  });
}

function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleTabKey = (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  };

  element.addEventListener('keydown', handleTabKey);
  return () => element.removeEventListener('keydown', handleTabKey);
}

function announceToScreenReader(message) {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.style.cssText = `
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  `;
  announcement.textContent = message;
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    if (announcement.parentNode) {
      document.body.removeChild(announcement);
    }
  }, 1000);
}

// Cross-domain confirmation component
const CrossDomainConfirmation = {
  awaitUserInput: true,
  render: (data, host, header, callback, cancel) => {
    let focusTrap = null;
    
    try {
      if (!host || !data) {
        throw new Error('Missing required parameters');
      }
      
      host.innerHTML = "";
      host.style.minHeight = "400px";
      host.style.width = "100%";
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-modal', 'true');
      host.setAttribute('aria-labelledby', 'modal-title');
      host.setAttribute('aria-describedby', 'modal-description');

      const container = document.createElement("div");
      container.style.width = "100%";

      const style = document.createElement("style");
      style.textContent = `
        :root {
          --ac-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          --ac-text-color: #323130;
          --ac-border-color: #8A8886;
          --ac-border-hover-color: #0f6cbd;
          --ac-button-primary-text: #0f6cbd;
          --ac-button-primary-bg: #fff;
          --ac-button-primary-bg-hover: #eff6fc;
          --ac-button-add-bg: #0f6cbd;
          --ac-button-add-text: #fff;
          --ac-button-disabled-bg: #f3f2f1;
          --ac-button-disabled-text: #a19f9d;
          --ac-focus-color: #0f6cbd;
        }
        .ac-shell {
          font-family: var(--ac-font-family);
          color: var(--ac-text-color);
          background-color: #fff;
          padding: 0 4px;
        }
        .ac-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
        }
        .ac-logo { width: 32px; height: 32px; }
        .ac-title { font-size: 18px; font-weight: 600; }
        .ac-body {
          max-height: 520px;
          overflow-y: auto;
          padding-right: 4px;
          -webkit-overflow-scrolling: touch;
        }
        .ac-warning-content {
          background: #fff4ce;
          border: 1px solid #ffb900;
          border-radius: 4px;
          padding: 16px;
          margin-bottom: 20px;
        }
        .ac-warning-icon {
          color: #ffb900;
          font-size: 20px;
          margin-right: 8px;
          flex-shrink: 0;
        }
        .ac-warning-header {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
          font-weight: 600;
          color: #323130;
        }
        .ac-domain-info {
          background: #f3f2f1;
          border-radius: 4px;
          padding: 12px;
          margin: 16px 0;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          word-break: break-all;
        }
        .ac-button {
          padding: 8px 16px;
          border-radius: 2px;
          font-weight: 600;
          font-size: 14px;
          min-height: 32px;
          cursor: pointer;
          border: 1px solid transparent;
          margin-right: 12px;
          transition: all 0.2s ease;
        }
        .ac-button:focus {
          outline: 2px solid var(--ac-focus-color);
          outline-offset: 2px;
        }
        .ac-btn-primary {
          color: var(--ac-button-primary-text);
          background-color: var(--ac-button-primary-bg);
          border-color: var(--ac-button-primary-text);
        }
        .ac-btn-primary:hover:not(:disabled) { 
          background-color: var(--ac-button-primary-bg-hover); 
        }
        .ac-btn-add {
          color: var(--ac-button-add-text);
          background-color: var(--ac-button-add-bg);
        }
        .ac-btn-add:hover:not(:disabled) { 
          background-color: #106ebe; 
        }
        .ac-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ac-button-container {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }
        .ac-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `;
      host.appendChild(style);

      const { page, targetUrl, targetHostname, currentHostname } = data;
      
      // Sanitize data
      const safePage = sanitizeHTML(page);
      const safeTargetHostname = sanitizeHTML(targetHostname);
      const safeCurrentHostname = sanitizeHTML(currentHostname);

      container.innerHTML = `
        <div class="ac-shell">
          <div class="ac-header">
            <img src="https://app.onaskcody.com/assets/images/outlook-logos/askcody-bookings/askcody-bookings-64w.png" 
                 alt="AskCody" class="ac-logo" />
            <div class="ac-title" id="modal-title">Cross-Domain Navigation</div>
          </div>
          <div class="ac-body">
            <div class="ac-warning-content">
              <div class="ac-warning-header">
                <span class="ac-warning-icon" aria-hidden="true">⚠️</span>
                Authentication Required
              </div>
              <p id="modal-description" style="margin: 0 0 12px 0; line-height: 1.5;">
                You're about to navigate between different domains, which may require you to sign in again with Microsoft.
              </p>
            </div>
            
            <div style="margin-bottom: 20px;">
              <h4 style="margin: 0 0 8px 0; color: #323130;">Navigation Details:</h4>
              <div class="ac-domain-info">
                <div style="margin-bottom: 8px;"><strong>From:</strong> ${safeCurrentHostname}</div>
                <div style="margin-bottom: 8px;"><strong>To:</strong> ${safeTargetHostname}</div>
                <div><strong>Page:</strong> ${safePage}</div>
              </div>
            </div>

            <div style="background: #e1eaf5; border-radius: 4px; padding: 16px; margin-bottom: 20px;">
              <h4 style="margin: 0 0 8px 0; color: #0f6cbd;">What happens next?</h4>
              <ul style="margin: 0; padding-left: 20px; line-height: 1.5;">
                <li>You'll be redirected to ${safeTargetHostname}</li>
                <li>You may need to authenticate with Microsoft again</li>
                <li>Once authenticated, you'll access the ${safePage} page</li>
              </ul>
            </div>

            <div class="ac-button-container">
              <button id="ac-continue" class="ac-button ac-btn-add" type="button"
                      aria-describedby="continue-description">
                Continue to ${safePage}
                <span id="continue-description" class="ac-sr-only">
                  Navigate to ${safePage} on ${safeTargetHostname}. You may need to sign in again.
                </span>
              </button>
              <button id="ac-cancel" class="ac-button ac-btn-primary" type="button"
                      aria-describedby="cancel-description">
                Cancel
                <span id="cancel-description" class="ac-sr-only">
                  Cancel navigation and stay on current page
                </span>
              </button>
            </div>
          </div>
        </div>
      `;

      host.appendChild(container);

      // Get button references
      const continueBtn = container.querySelector('#ac-continue');
      const cancelBtn = container.querySelector('#ac-cancel');

      if (!continueBtn || !cancelBtn) {
        throw new Error('Failed to create dialog buttons');
      }

      // Set up focus trap
      focusTrap = trapFocus(host);
      
      // Focus the primary action (continue button)
      setTimeout(() => continueBtn.focus(), 100);

      // Announce to screen readers
      announceToScreenReader(`Cross-domain navigation dialog opened. Navigate from ${safeCurrentHostname} to ${safeTargetHostname} for ${safePage} page.`);

      // Add event listeners with error handling
      const handleContinue = () => {
        try {
          continueBtn.disabled = true;
          cancelBtn.disabled = true;
          announceToScreenReader('Navigating to new domain. Please wait.');
          
          window.location.href = targetUrl;
          
          if (callback) {
            callback({
              status: "SUCCESS",
              responseMessage: `Navigating to "${page}" on ${targetHostname}. You may need to sign in again.`,
            });
          }
        } catch (error) {
          console.error('Navigation error:', error);
          if (callback) {
            callback({
              status: "FAILED",
              responseMessage: `Failed to navigate: ${error.message}`,
            });
          }
        }
      };

      const handleCancel = () => {
        try {
          announceToScreenReader('Navigation cancelled.');
          if (cancel) {
            cancel({
              status: "CANCELLED",
              responseMessage: `Navigation to "${page}" was cancelled by the user.`,
            });
          }
        } catch (error) {
          console.error('Cancel error:', error);
        }
      };

      continueBtn.addEventListener('click', handleContinue);
      cancelBtn.addEventListener('click', handleCancel);

      // Return cleanup function
      return () => {
        if (focusTrap) focusTrap();
        continueBtn.removeEventListener('click', handleContinue);
        cancelBtn.removeEventListener('click', handleCancel);
      };

    } catch (error) {
      console.error('Render error:', error);
      if (focusTrap) focusTrap();
      
      const errorMessage = `Error rendering confirmation dialog: ${error.message}`;
      host.innerHTML = `
        <div style="color: #d13438; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h3>Error</h3>
          <p>${sanitizeHTML(errorMessage)}</p>
          <button onclick="this.parentElement.parentElement.style.display='none'" 
                  style="padding: 8px 16px; background: #d13438; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Close
          </button>
        </div>
      `;
      
      if (cancel) {
        cancel({
          status: "FAILED",
          responseMessage: errorMessage,
        });
      }
    }
  }
};

// Main function to show cross-domain confirmation
async function showCrossDomainConfirmation(page, targetUrl, targetHostname, currentHostname) {
  return new Promise((resolve) => {
    let host = null;
    let backdrop = null;
    let cleanupRender = null;

    const cleanup = () => {
      try {
        if (cleanupRender) cleanupRender();
        if (backdrop?.parentNode) document.body.removeChild(backdrop);
        if (host?.parentNode) document.body.removeChild(host);
        document.removeEventListener('keydown', handleEscape);
      } catch (error) {
        console.warn('Cleanup error:', error);
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve({
          status: "CANCELLED",
          responseMessage: `Navigation to "${page}" was cancelled by the user.`,
        });
      }
    };

    try {
      // Create backdrop
      backdrop = document.createElement('div');
      backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999;
      `;
      backdrop.setAttribute('aria-hidden', 'true');

      // Create host element
      host = document.createElement('div');
      host.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        max-width: 600px;
        width: 90%;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-height: 90vh;
        overflow: hidden;
      `;

      document.body.appendChild(backdrop);
      document.body.appendChild(host);

      // Store original focused element
      const originallyFocused = document.activeElement;

      // Use the render functionality
      cleanupRender = CrossDomainConfirmation.render(
        { page, targetUrl, targetHostname, currentHostname },
        host,
        null,
        (result) => {
          cleanup();
          if (originallyFocused && originallyFocused.focus) {
            originallyFocused.focus();
          }
          resolve(result);
        },
        (result) => {
          cleanup();
          if (originallyFocused && originallyFocused.focus) {
            originallyFocused.focus();
          }
          resolve(result);
        }
      );

      // Handle backdrop click
      backdrop.addEventListener('click', () => {
        cleanup();
        resolve({
          status: "CANCELLED",
          responseMessage: `Navigation to "${page}" was cancelled by the user.`,
        });
      });

      // Handle ESC key
      document.addEventListener('keydown', handleEscape);

    } catch (error) {
      console.error('Modal creation error:', error);
      cleanup();
      resolve({
        status: "FAILED",
        responseMessage: `Failed to show confirmation dialog: ${error.message}`,
      });
    }
  });
}

(function (w, d, u, n, k, c) {
  w[n] =
    w[n] ||
    function () {
      (w[n].q = w[n].q || []).push(arguments);
    };
  w[n].k = k;
  w[n].c = c;
  var s = d.createElement("script");
  s.async = true;
  s.src = u + "?k=" + k;
  var h = d.getElementsByTagName("script")[0];
  h.parentNode.insertBefore(s, h);
})(
  window,
  document,
  "https://script.eucerahive.io/web/sdk/eucera.js",
  "eucera",
  "EU-PBONW5DXQ3H1-1-1"
);

eucera("when", "ready", () => {
  eucera.agent("askcody").addActionHandlers(AGENT_ACTIONS);
  eucera.agent("askcody").show();
});

window.eucera("when", "error", (error) => {
  console.error("Eucera error:", error);
});
