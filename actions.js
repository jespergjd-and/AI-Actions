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
          // Return render object for cross-domain confirmation
          return showCrossDomainConfirmation(page, baseUrl, targetUrl.hostname, currentHostname);
        }

        // Same domain - try prefetch but don't fail on errors
        try {
          const response = await fetchWithTimeout(baseUrl, {
            method: 'HEAD',
            credentials: 'include',
          }, 3000);

          // Only check for auth errors, ignore other 4xx errors
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

          // For any other status (including 400), just navigate
          window.location.href = baseUrl;
          return {
            status: "SUCCESS",
            responseMessage: `Successfully navigated to "${page}".`,
          };

        } catch (error) {
          console.warn('Prefetch failed:', error.message);
          
          // Always attempt navigation for same-domain
          window.location.href = baseUrl;
          return {
            status: "SUCCESS",
            responseMessage: `Navigated to "${page}".`,
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
  // Check for test domains first
  const isTestDomain = hostname.includes('testaskcody.com');
  const isUSDomain = hostname === 'app.goaskcody.com' || hostname === 'app.testaskcody.com';
  
  let appDomain, euDomain;
  
  if (isTestDomain) {
    appDomain = isUSDomain ? 'app.testaskcody.com' : 'app.testaskcody.com';
    euDomain = isUSDomain ? 'us.testaskcody.com' : 'eu.testaskcody.com';
  } else if (isUSDomain && !isTestDomain) {
    appDomain = 'app.goaskcody.com';
    euDomain = 'us.goaskcody.com';
  } else {
    appDomain = 'app.onaskcody.com';
    euDomain = 'eu.onaskcody.com';
  }
  
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

// Cross-domain confirmation component that renders in chat
const CrossDomainConfirmation = {
  awaitUserInput: true,
  render: (data, host, header, callback, cancel) => {
    try {
      if (!host || !data) {
        throw new Error('Missing required parameters');
      }
      
      host.innerHTML = "";
      host.style.minHeight = "300px";
      host.style.width = "100%";

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
          --ac-focus-color: #0f6cbd;
        }
        .ac-shell {
          font-family: var(--ac-font-family);
          color: var(--ac-text-color);
          background-color: #fff;
          padding: 0 4px;
          border-radius: 8px;
          border: 1px solid #e1e1e1;
        }
        .ac-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 0 12px 0;
          border-bottom: 1px solid #f3f2f1;
          margin-bottom: 16px;
        }
        .ac-logo { width: 28px; height: 28px; }
        .ac-title { font-size: 16px; font-weight: 600; }
        .ac-body {
          padding-bottom: 16px;
        }
        .ac-info-section {
          background: #f8f9fa;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 16px;
          border-left: 4px solid #0f6cbd;
        }
        .ac-info-header {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          font-weight: 600;
          color: #323130;
          font-size: 14px;
        }
        .ac-info-icon {
          color: #0f6cbd;
          font-size: 16px;
          margin-right: 8px;
          flex-shrink: 0;
        }
        .ac-domain-info {
          background: #f3f2f1;
          border-radius: 4px;
          padding: 12px;
          margin: 12px 0;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          word-break: break-all;
        }
        .ac-button {
          padding: 8px 16px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 14px;
          min-height: 32px;
          cursor: pointer;
          border: 1px solid transparent;
          margin-right: 8px;
          transition: all 0.2s ease;
        }
        .ac-button:focus {
          outline: 2px solid var(--ac-focus-color);
          outline-offset: 1px;
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
          gap: 8px;
          margin-top: 16px;
          justify-content: flex-end;
        }
        .ac-warning-text {
          color: #605e5c;
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 12px;
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
            <div class="ac-title">Cross-Domain Navigation</div>
          </div>
          <div class="ac-body">
            <div class="ac-info-section">
              <div class="ac-info-header">
                <span class="ac-info-icon">🔄</span>
                Domain Switch Required
              </div>
              <p class="ac-warning-text">
                You're navigating from <strong>${safeCurrentHostname}</strong> to <strong>${safeTargetHostname}</strong>. 
                This may require signing in with Microsoft again.
              </p>
            </div>
            
            <div class="ac-domain-info">
              <div style="margin-bottom: 6px;"><strong>From:</strong> ${safeCurrentHostname}</div>
              <div style="margin-bottom: 6px;"><strong>To:</strong> ${safeTargetHostname}</div>
              <div><strong>Page:</strong> ${safePage}</div>
            </div>

            <div style="background: #e8f4fd; border-radius: 4px; padding: 12px; margin-bottom: 16px;">
              <div style="font-size: 13px; color: #0f6cbd; margin-bottom: 6px;"><strong>What happens next:</strong></div>
              <ul style="margin: 0; padding-left: 16px; font-size: 13px; color: #323130; line-height: 1.4;">
                <li>Redirect to ${safeTargetHostname}</li>
                <li>Possible Microsoft authentication</li>
                <li>Access to ${safePage} page</li>
              </ul>
            </div>

            <div class="ac-button-container">
              <button id="ac-cancel" class="ac-button ac-btn-primary" type="button">
                Cancel
              </button>
              <button id="ac-continue" class="ac-button ac-btn-add" type="button">
                Continue to ${safePage}
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

      // Focus the primary action (continue button)
      setTimeout(() => continueBtn.focus(), 100);

      // Announce to screen readers
      announceToScreenReader(`Cross-domain navigation required. Navigate from ${safeCurrentHostname} to ${safeTargetHostname} for ${safePage} page.`);

      // Add event listeners with error handling
      const handleContinue = () => {
        try {
          continueBtn.disabled = true;
          cancelBtn.disabled = true;
          continueBtn.textContent = 'Navigating...';
          announceToScreenReader('Navigating to new domain. Please wait.');
          
          // Navigate immediately
          window.location.href = targetUrl;
          
          if (callback) {
            callback({
              status: "SUCCESS",
              responseMessage: `Navigating to "${page}" on ${targetHostname}. You may need to sign in again.`,
            });
          }
        } catch (error) {
          console.error('Navigation error:', error);
          continueBtn.disabled = false;
          cancelBtn.disabled = false;
          continueBtn.textContent = `Continue to ${safePage}`;
          
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
        continueBtn.removeEventListener('click', handleContinue);
        cancelBtn.removeEventListener('click', handleCancel);
      };

    } catch (error) {
      console.error('Render error:', error);
      
      const errorMessage = `Error rendering confirmation dialog: ${error.message}`;
      host.innerHTML = `
        <div style="color: #d13438; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border: 1px solid #f5c6cb; border-radius: 4px; background: #f8d7da;">
          <h4 style="margin: 0 0 8px 0;">Error</h4>
          <p style="margin: 0 0 12px 0; font-size: 14px;">${sanitizeHTML(errorMessage)}</p>
          <button onclick="this.parentElement.parentElement.style.display='none'" 
                  style="padding: 6px 12px; background: #d13438; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
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

// Function to show cross-domain confirmation using render functionality
function showCrossDomainConfirmation(page, targetUrl, targetHostname, currentHostname) {
  // Return the component data for rendering in chat
  const componentData = {
    page,
    targetUrl,
    targetHostname,
    currentHostname
  };

  // Return a result object that will trigger the render
  return {
    status: "AWAITING_CONFIRMATION",
    responseMessage: `Cross-domain navigation detected. Please confirm to navigate to "${page}".`,
    data: componentData,
    awaitUserInput: true,
    render: CrossDomainConfirmation.render
  };
}

// Add the action handlers to the global object
if (typeof window !== 'undefined') {
  window.AGENT_ACTIONS = AGENT_ACTIONS;
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
// Version 9