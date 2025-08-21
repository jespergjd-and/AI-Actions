// AskCody Navigation Script
// Version: 1.5.0
// Last updated: 2025-01-21

const NAVIGATION_SCRIPT_VERSION = '1.5.0';

// Make version accessible in console
if (typeof window !== 'undefined') {
  window.AskCodyNavigation = {
    version: NAVIGATION_SCRIPT_VERSION,
    info: () => {
      console.log(`%cAskCody Navigation Script v${NAVIGATION_SCRIPT_VERSION}`, 'color: #0f6cbd; font-weight: bold; font-size: 14px;');
      console.log('Features: Smart cross-domain navigation, access checking, test domain support');
      console.log('Usage: AskCodyNavigation.version or AskCodyNavigation.info()');
    }
  };
}

const AGENT_ACTIONS = {
  navigate_to_page: {
    execute: async (params) => {
      console.log(params.page);
      const page = params?.page;
      
      if (!page || typeof page !== 'string') {
        return {
          status: "FAILED",
          responseMessage: "Hmm, I didn't understand which page you want to visit. Try saying something like 'take me to dashboard' or 'open settings'.",
        };
      }

      // Get current hostname with fallback
      const currentHostname = window?.location?.hostname || 'app.onaskcody.com';
      
      try {
        const pageMapping = getPageMapping(currentHostname);
        const baseUrl = pageMapping[page.toLowerCase()];

        if (!baseUrl) {
          const availablePages = Object.keys(pageMapping);
          const suggestions = availablePages
            .filter(p => p.toLowerCase().includes(page.toLowerCase().substring(0, 3)) || 
                        page.toLowerCase().includes(p.toLowerCase().substring(0, 3)))
            .slice(0, 3);
          
          let helpMessage = `I couldn't find a page called "${page}". `;
          
          if (suggestions.length > 0) {
            helpMessage += `Did you mean: ${suggestions.join(', ')}? `;
          }
          
          helpMessage += `\n\nHere are all the pages I can take you to:\n`;
          helpMessage += `• **Dashboard** - Your main workspace\n`;
          helpMessage += `• **Settings** - Account and system settings\n`;
          helpMessage += `• **Central** - Event management\n`;
          helpMessage += `• **Maps** - Location and floor plans\n`;
          helpMessage += `• **Bookings** - Meeting room reservations\n`;
          helpMessage += `• **Services** - Meeting delivery services\n`;
          helpMessage += `• **Visitors** - Guest management\n`;
          helpMessage += `• **Insights** - Analytics and reports\n\n`;
          helpMessage += `Just say something like "take me to dashboard" or "open settings".`;
          
          return {
            status: "FAILED",
            responseMessage: helpMessage,
          };
        }

        // Validate URL
        if (!isValidUrl(baseUrl)) {
          return {
            status: "FAILED",
            responseMessage: `Oops! Something went wrong trying to find the ${page} page. Please try again or ask for a different page.`,
          };
        }

        // Check if navigation is cross-domain
        const targetUrl = new URL(baseUrl);
        const isCrossDomain = targetUrl.hostname !== currentHostname;

        // Prevent cross-region navigation
        const isCurrentUS = currentHostname.includes('goaskcody.com');
        const isTargetUS = targetUrl.hostname.includes('goaskcody.com');
        
        if (isCurrentUS !== isTargetUS) {
          return {
            status: "FAILED",
            responseMessage: `Sorry, I can't take you from the ${isCurrentUS ? 'US' : 'EU'} region to the ${isTargetUS ? 'US' : 'EU'} region. Please access ${page} from the correct regional site.`,
          };
        }

        if (isCrossDomain) {
          // Return data for cross-domain confirmation rendering
          return {
            status: "PENDING_CONFIRMATION",
            responseMessage: `I can take you to ${page}, but you might need to sign in again. Would you like me to continue?`,
            data: {
              page,
              targetUrl: baseUrl,
              targetHostname: targetUrl.hostname,
              currentHostname,
              requiresConfirmation: true
            }
          };
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
              responseMessage: `I can't take you to ${page} right now. It looks like you don't have permission to access this area. You might need to contact your administrator or check if you're signed in with the right account.`,
            };
          }

          if (response.status === 403) {
            return {
              status: "FAILED",
              responseMessage: `Sorry, I can't take you to ${page}. Your account doesn't have access to this area. Please contact your administrator if you think this is a mistake.`,
            };
          }

          // For any other status (including 400), just navigate
          window.location.href = baseUrl;
          return {
            status: "SUCCESS",
            responseMessage: `Taking you to ${page} now!`,
          };

        } catch (error) {
          console.warn('Prefetch failed:', error.message);
          
          // Always attempt navigation for same-domain
          window.location.href = baseUrl;
          return {
            status: "SUCCESS",
            responseMessage: `Taking you to ${page}!`,
          };
        }

      } catch (error) {
        console.error('Navigation error:', error);
        return {
          status: "FAILED",
          responseMessage: `Sorry, I couldn't take you to ${page} right now. Something went wrong on my end. Please try again in a moment.`,
        };
      }
    },
    
    awaitUserInput: false,
    render: (data, host, header, callback, cancel, isUpdateState) => {
      try {
        // Only render if we have cross-domain confirmation data
        if (!data?.data?.requiresConfirmation) {
          return;
        }

        if (!host) return;
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

        const { page, targetUrl, targetHostname, currentHostname } = data.data;
        
        // Sanitize data
        const safePage = sanitizeHTML(page);
        const safeTargetHostname = sanitizeHTML(targetHostname);
        const safeCurrentHostname = sanitizeHTML(currentHostname);

        container.innerHTML = `
          <div class="ac-shell">
            <div class="ac-header">
              <img src="https://app.onaskcody.com/assets/images/outlook-logos/askcody-bookings/askcody-bookings-64w.png" 
                   alt="AskCody" class="ac-logo" />
              <div class="ac-title">Sign-In May Be Required</div>
            </div>
            <div class="ac-body">
              <div class="ac-info-section">
                <div class="ac-info-header">
                  <span class="ac-info-icon">🔐</span>
                  You might need to sign in again
                </div>
                <p class="ac-warning-text">
                  To access <strong>${safePage}</strong>, I'll take you to a different part of AskCody. You might need to sign in again with your work account depending on your current session.
                </p>
              </div>
              
              <div style="background: #f8f9fa; border-radius: 4px; padding: 12px; margin-bottom: 16px; font-size: 12px; color: #605e5c;">
                <div style="margin-bottom: 8px;"><strong>Where you're going:</strong></div>
                <div style="font-family: 'Courier New', monospace; background: white; padding: 8px; border-radius: 3px; word-break: break-all;">
                  ${sanitizeHTML(targetUrl)}
                </div>
              </div>

              <div style="background: #e8f4fd; border-radius: 4px; padding: 12px; margin-bottom: 16px;">
                <div style="font-size: 13px; color: #0f6cbd; margin-bottom: 6px;"><strong>What might happen:</strong></div>
                <ul style="margin: 0; padding-left: 16px; font-size: 13px; color: #323130; line-height: 1.4;">
                  <li>I'll redirect you to the ${safePage} page</li>
                  <li>You might see a sign-in screen (use your work credentials)</li>
                  <li>You might get an error if your account doesn't have access to this area</li>
                </ul>
              </div>

              <div style="background: #fff4ce; border-radius: 4px; padding: 12px; margin-bottom: 16px; border-left: 4px solid #ffb900;">
                <div style="font-size: 12px; color: #8a6914; line-height: 1.4;">
                  <strong>Note:</strong> I don't have access to check your account permissions, so there's a chance you might not have access to this feature. If you get an access error, please contact your administrator.
                </div>
              </div>

              <div class="ac-button-container">
                <button id="ac-cancel" class="ac-button ac-btn-primary" type="button">
                  Stay Here
                </button>
                <button id="ac-continue" class="ac-button ac-btn-add" type="button">
                  Take Me to ${safePage}
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
        announceToScreenReader(`Sign-in required to access ${safePage}. Please confirm if you'd like to continue.`);

        // Add event listeners with error handling
        const handleContinue = () => {
          try {
            continueBtn.disabled = true;
            cancelBtn.disabled = true;
            continueBtn.textContent = 'Taking you there...';
            announceToScreenReader('Redirecting to the requested page.');
            
            // Navigate immediately
            window.location.href = targetUrl;
            
          } catch (error) {
            console.error('Navigation error:', error);
            continueBtn.disabled = false;
            cancelBtn.disabled = false;
            continueBtn.textContent = `Take Me to ${safePage}`;
          }
        };

        const handleCancel = () => {
          try {
            announceToScreenReader('Staying on current page.');
            // Show a friendly cancellation message
            host.innerHTML = `
              <div style="padding: 20px; text-align: center; color: #605e5c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <div style="margin-bottom: 12px; font-size: 16px;">👍</div>
                <p style="margin: 0; font-size: 14px;">No problem! You're staying right where you are.</p>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #8a8886;">Ask me to take you somewhere else anytime.</p>
              </div>
            `;
          } catch (error) {
            console.error('Cancel error:', error);
          }
        };

        continueBtn.addEventListener('click', handleContinue);
        cancelBtn.addEventListener('click', handleCancel);

      } catch (error) {
        console.error('Render error:', error);
        
        const errorMessage = `Error rendering confirmation dialog: ${error.message}`;
        host.innerHTML = `
          <div style="color: #d13438; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border: 1px solid #f5c6cb; border-radius: 4px; background: #f8d7da;">
            <h4 style="margin: 0 0 8px 0;">Error</h4>
            <p style="margin: 0 0 12px 0; font-size: 14px;">${sanitizeHTML(errorMessage)}</p>
          </div>
        `;
      }
    }
  }
};

// Utility functions
function getPageMapping(hostname) {
  // Debug logging to help troubleshoot
  console.log(`[Navigation Debug] Current hostname: ${hostname}`);
  
  let appDomain, euDomain;
  
  if (hostname === 'app.goaskcody.com') {
    // US production - NO cross-region navigation allowed
    appDomain = 'app.goaskcody.com';
    euDomain = 'us.goaskcody.com';
    console.log(`[Navigation Debug] Using US production domains`);
  } else if (hostname === 'app.testaskcody.com') {
    // Test environment - uses EU production domains for central/maps/bookings
    appDomain = 'app.testaskcody.com';
    euDomain = 'eu.onaskcody.com';  // Test uses EU production for these features
    console.log(`[Navigation Debug] Using test domains with EU production for user features`);
  } else {
    // EU production (default - app.onaskcody.com)
    appDomain = 'app.onaskcody.com';
    euDomain = 'eu.onaskcody.com';
    console.log(`[Navigation Debug] Using EU production domains`);
  }
  
  const mapping = {
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
  
  console.log(`[Navigation Debug] Page mapping:`, mapping);
  return mapping;
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

// Add the action handlers to the global object
if (typeof window !== 'undefined') {
  window.AGENT_ACTIONS = AGENT_ACTIONS;
  
  // Log version on load
  console.log(`%cAskCody Navigation Script v${NAVIGATION_SCRIPT_VERSION} loaded`, 'color: #0f6cbd; font-weight: bold;');
  console.log('Type AskCodyNavigation.info() for more details');
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