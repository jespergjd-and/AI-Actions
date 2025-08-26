// AskCody Navigation Script
// Version: 3.1.0
// Last updated: 2025-01-21

const NAVIGATION_SCRIPT_VERSION = '3.1.0';

// Make version accessible in console
if (typeof window !== 'undefined') {
  window.AskCodyNavigation = {
    version: NAVIGATION_SCRIPT_VERSION,
    info: () => {
      console.log(`%cAskCody Navigation Script v${NAVIGATION_SCRIPT_VERSION}`, 'color: #0f6cbd; font-weight: bold; font-size: 14px;');
      console.log('Features: Smart cross-domain navigation, access checking, environment detection');
      console.log('Environments: EU Production, US Production, Test');
      console.log('Usage: AskCodyNavigation.version or AskCodyNavigation.info()');
      console.log('Pages: Use AskCodyNavigation.pages() to see all available pages');
    },
    pages: () => {
      const hostname = window?.location?.hostname || 'app.onaskcody.com';
      const pages = getPageMapping(hostname);
      console.table(Object.entries(pages).map(([key, info]) => ({
        Page: key,
        Description: info.description,
        Category: info.category,
        URL: info.url
      })));
    }
  };
}

const AGENT_ACTIONS = {
  navigate_to_page: {
    execute: async (params) => {
      const rawPage = params?.page;

      if (!rawPage || typeof rawPage !== 'string') {
        return {
          status: "FAILED",
          responseMessage: "Hmm, I didn't understand which page you want to visit. Try saying something like 'take me to dashboard' or 'open settings'.",
        };
      }

      // Sanitize and validate input
      const page = sanitizePageName(rawPage);
      if (!page) {
        return {
          status: "FAILED",
          responseMessage: `The page name "${rawPage}" contains invalid characters. Please use only letters, numbers, and hyphens.`,
        };
      }

      // Get current hostname with validation
      const rawHostname = window?.location?.hostname;
      if (!validateHostname(rawHostname)) {
        return {
          status: "FAILED",
          responseMessage: "Unable to determine current location. Please refresh the page and try again.",
        };
      }
      const currentHostname = rawHostname;

      try {
        const pages = getPageMapping(currentHostname);
        const pageInfo = pages[page];

        if (!pageInfo) {
          const availablePages = Object.keys(pages);
          const suggestions = availablePages
            .filter(p => p.includes(page.substring(0, 3)) || page.includes(p.substring(0, 3)))
            .slice(0, 3);

          let helpMessage = `I couldn't find a page called "${rawPage}". `;

          if (suggestions.length > 0) {
            helpMessage += `Did you mean: ${suggestions.join(', ')}? `;
          }

          helpMessage += `\n\n${getAvailablePagesDescription()}\n\n`;
          helpMessage += `Just say something like "take me to dashboard" or "open settings".`;

          return {
            status: "FAILED",
            responseMessage: helpMessage,
          };
        }

        const baseUrl = pageInfo.url;

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
        const currentEnv = getEnvironmentFromHostname(currentHostname);
        const targetEnv = getEnvironmentFromHostname(targetUrl.hostname);

        if (currentEnv.type !== targetEnv.type) {
          return {
            status: "FAILED",
            responseMessage: `Sorry, I can't take you from ${currentEnv.type.replace('_', ' ').toLowerCase()} to ${targetEnv.type.replace('_', ' ').toLowerCase()}. Please access ${page} from the correct environment.`,
          };
        }

        if (isCrossDomain) {
          // Return data for cross-domain confirmation with awaitUserInput
          return {
            status: "PENDING_CONFIRMATION",
            responseMessage: `I can take you to ${rawPage} (${pageInfo.description.toLowerCase()}), but you might need to sign in again. Would you like me to continue?`,
            data: {
              page: rawPage, // Use original for display
              pageDescription: pageInfo.description,
              targetUrl: baseUrl,
              targetHostname: targetUrl.hostname,
              currentHostname,
              requiresConfirmation: true
            }
          };
        }

        // Same domain - try prefetch with retry mechanism
        try {
          const response = await fetchWithRetry(baseUrl, {
            method: 'HEAD',
            credentials: 'include',
          }, 2, 2000); // 2 retries, starting with 2s timeout

          // Check for auth errors and render permission error UI
          if (response.status === 401 || response.status === 403) {
            return {
              status: "PERMISSION_DENIED",
              responseMessage: `I can't take you to ${rawPage} right now. You don't have permission to access this area.`,
              data: {
                page: rawPage,
                pageDescription: pageInfo.description,
                targetUrl: baseUrl,
                errorCode: response.status,
                requiresPermissionError: true
              }
            };
          }

          // For any other status (including 400), just navigate
          window.location.href = baseUrl;
          return {
            status: "SUCCESS",
            responseMessage: `Taking you to ${rawPage} now!`,
          };

        } catch (error) {
          // Enhanced error handling with more specific messages
          let errorMessage = `Taking you to ${rawPage}!`;

          if (error.message.includes('Failed after')) {
            console.warn(`Navigation prefetch failed after retries for ${rawPage}:`, error.message);
            errorMessage = `Taking you to ${rawPage} (connection was slow, but proceeding anyway)!`;
          } else if (error.name === 'AbortError') {
            console.warn(`Navigation prefetch timed out for ${rawPage}`);
            errorMessage = `Taking you to ${rawPage} (page is loading slowly, but proceeding anyway)!`;
          } else {
            console.warn(`Navigation prefetch failed for ${rawPage}:`, error.message);
          }

          // Always attempt navigation for same-domain
          window.location.href = baseUrl;
          return {
            status: "SUCCESS",
            responseMessage: errorMessage,
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

    awaitUserInput: true, // Enable awaiting user input for cross-domain confirmation
    render: (data, host, header, callback, cancel, isUpdateState) => {
      try {
        // Check what type of rendering is needed
        const needsConfirmation = data?.data?.requiresConfirmation;
        const needsPermissionError = data?.data?.requiresPermissionError;

        if (!needsConfirmation && !needsPermissionError) {
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
          .ac-error-section {
            background: #f8d7da;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 16px;
            border-left: 4px solid #dc3545;
          }
          .ac-info-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            font-weight: 600;
            color: #323130;
            font-size: 14px;
          }
          .ac-error-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            font-weight: 600;
            color: #721c24;
            font-size: 14px;
          }
          .ac-info-icon {
            color: #0f6cbd;
            font-size: 16px;
            margin-right: 8px;
            flex-shrink: 0;
          }
          .ac-error-icon {
            color: #dc3545;
            font-size: 16px;
            margin-right: 8px;
            flex-shrink: 0;
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
          .ac-error-text {
            color: #721c24;
            font-size: 13px;
            line-height: 1.4;
            margin-bottom: 12px;
          }
        `;
        host.appendChild(style);

        if (needsPermissionError) {
          // Render permission error UI
          const { page, pageDescription, errorCode } = data.data;
          const safePage = sanitizeHTML(page || '');
          const safePageDescription = sanitizeHTML(pageDescription || '');

          container.innerHTML = `
            <div class="ac-shell">
              <div class="ac-header">
                <img src="https://app.onaskcody.com/assets/images/outlook-logos/askcody-bookings/askcody-bookings-64w.png" 
                     alt="AskCody" class="ac-logo" />
                <div class="ac-title">Access Denied</div>
              </div>
              <div class="ac-body">
                <div class="ac-error-section">
                  <div class="ac-error-header">
                    <span class="ac-error-icon">🚫</span>
                    You don't have permission
                  </div>
                  <p class="ac-error-text">
                    I can't take you to <strong>${safePage}</strong> (${safePageDescription}) because your account doesn't have access to this area.
                  </p>
                </div>
                
                <div style="background: #fff3cd; border-radius: 4px; padding: 12px; margin-bottom: 16px; border-left: 4px solid #ffc107;">
                  <div style="font-size: 13px; color: #856404; line-height: 1.4;">
                    <strong>What you can do:</strong><br>
                    • Contact your administrator to request access<br>
                    • Check if you're signed in with the correct account<br>
                    • Try accessing a different page that you have permissions for
                  </div>
                </div>

                <div style="background: #f8f9fa; border-radius: 4px; padding: 12px; margin-bottom: 16px; font-size: 12px; color: #605e5c;">
                  <strong>Technical details:</strong> Server returned ${errorCode === 401 ? 'authentication required (401)' : 'access forbidden (403)'} error.
                </div>

                <div class="ac-button-container">
                  <button id="ac-close" class="ac-button ac-btn-primary" type="button">
                    Got It
                  </button>
                </div>
              </div>
            </div>
          `;

          host.appendChild(container);

          // Handle close button
          const closeBtn = container.querySelector('#ac-close');
          if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 100);
            closeBtn.addEventListener('click', () => {
              if (callback) {
                callback({
                  status: "ACKNOWLEDGED",
                  responseMessage: `I understand you don't have access to ${safePage}. Is there another page I can help you navigate to?`,
                });
              }
            });
          }

          return;
        }

        if (needsConfirmation) {
          // Render cross-domain confirmation UI
          const { page, pageDescription, targetUrl, targetHostname, currentHostname } = data.data;

          const safePage = sanitizeHTML(page || '');
          const safePageDescription = sanitizeHTML(pageDescription || '');
          const safeTargetUrl = sanitizeHTML(targetUrl || '');

          if (!safePage || !safeTargetUrl) {
            throw new Error('Missing required navigation data');
          }

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
                    To access <strong>${safePage}</strong> (${safePageDescription}), I'll take you to a different part of AskCody. You might need to sign in again with your work account depending on your current session.
                  </p>
                </div>

                <div style="background: #f8f9fa; border-radius: 4px; padding: 12px; margin-bottom: 16px; font-size: 12px; color: #605e5c;">
                  <div style="margin-bottom: 8px;"><strong>Where you're going:</strong></div>
                  <div style="font-family: 'Courier New', monospace; background: white; padding: 8px; border-radius: 3px; word-break: break-all;">
                    ${safeTargetUrl}
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

          setTimeout(() => continueBtn.focus(), 100);
          announceToScreenReader(`Sign-in may be required to access ${safePage}. Please confirm if you'd like to continue.`);

          const handleContinue = () => {
            try {
              if (!targetUrl || !isValidUrl(targetUrl)) {
                throw new Error('Invalid navigation URL');
              }

              continueBtn.disabled = true;
              cancelBtn.disabled = true;
              continueBtn.textContent = 'Taking you there...';
              announceToScreenReader('Redirecting to the requested page.');

              window.location.href = targetUrl;

              if (callback) {
                callback({
                  status: "SUCCESS",
                  responseMessage: `Taking you to ${safePage} now! You are now being taken to the ${safePage} section of AskCody. If you need guidance on how to use any features within ${safePage} or have specific tasks in mind, please let me know how I can assist further!`,
                });
              }

            } catch (error) {
              console.error('Navigation error:', error);
              continueBtn.disabled = false;
              cancelBtn.disabled = false;
              continueBtn.textContent = `Take Me to ${safePage}`;

              const errorDiv = document.createElement('div');
              errorDiv.style.cssText = `
                background: #f8d7da; 
                border: 1px solid #f5c6cb; 
                color: #721c24; 
                padding: 8px 12px; 
                border-radius: 4px; 
                margin-top: 12px; 
                font-size: 13px;
              `;
              errorDiv.textContent = 'Sorry, there was an error with the navigation. Please try again.';

              const buttonContainer = container.querySelector('.ac-button-container');
              if (buttonContainer && !buttonContainer.querySelector('[data-error]')) {
                errorDiv.setAttribute('data-error', 'true');
                buttonContainer.appendChild(errorDiv);

                setTimeout(() => {
                  if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                  }
                }, 5000);
              }

              if (callback) {
                callback({
                  status: "FAILED",
                  responseMessage: `Sorry, there was an error navigating to ${safePage}. Please try again.`,
                });
              }
            }
          };

          const handleCancel = () => {
            try {
              announceToScreenReader('Staying on current page.');

              if (cancel) {
                cancel({
                  status: "CANCELLED",
                  responseMessage: `No problem! You're staying right where you are. Ask me to take you somewhere else anytime.`,
                });
              }

            } catch (error) {
              console.error('Cancel error:', error);

              host.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #605e5c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                  <div style="margin-bottom: 12px; font-size: 16px;">👍</div>
                  <p style="margin: 0; font-size: 14px;">No problem! You're staying right where you are.</p>
                  <p style="margin: 8px 0 0 0; font-size: 13px; color: #8a8886;">Ask me to take you somewhere else anytime.</p>
                </div>
              `;
            }
          };

          continueBtn.addEventListener('click', handleContinue);
          cancelBtn.addEventListener('click', handleCancel);

        }

      } catch (error) {
        console.error('Render error:', error);

        const errorMessage = `Error rendering confirmation dialog: ${sanitizeHTML(error.message || 'Unknown error')}`;

        host.innerHTML = `
          <div style="color: #d13438; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; border: 1px solid #f5c6cb; border-radius: 4px; background: #f8d7da;">
            <h4 style="margin: 0 0 8px 0;">Error</h4>
            <p style="margin: 0 0 12px 0; font-size: 14px;">${errorMessage}</p>
            <button onclick="this.parentElement.style.display='none'" 
                     style="padding: 6px 12px; background: #d13438; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
              Close
            </button>
          </div>
        `;

        if (cancel) {
          cancel({
            status: "FAILED",
            responseMessage: "Sorry, there was an error showing the navigation confirmation. Please try again.",
          });
        }
      }
    }
  }
};

// Utility functions
function getEnvironmentFromHostname(hostname) {
  if (hostname.includes('goaskcody.com')) {
    return {
      type: 'US_PRODUCTION',
      appDomain: 'app.goaskcody.com',
      userDomain: 'us.goaskcody.com'
    };
  } else if (hostname.includes('testaskcody.com')) {
    return {
      type: 'TEST',
      appDomain: 'app.testaskcody.com',
      userDomain: 'eu.testaskcody.com'
    };
  } else {
    return {
      type: 'EU_PRODUCTION',
      appDomain: 'app.onaskcody.com',
      userDomain: 'eu.onaskcody.com'
    };
  }
}

function getPageMapping(hostname) {
  const env = getEnvironmentFromHostname(hostname);

  // Page definitions with context for AI
  const pages = {
    // Management/Admin pages (app domain)
    dashboard: {
      url: `https://${env.appDomain}/manager/dashboard/`,
      description: "Main workspace and overview",
      category: "management"
    },
    home: {
      url: `https://${env.appDomain}/manager/dashboard/`,
      description: "Same as dashboard - main workspace",
      category: "management"
    },
    settings: {
      url: `https://${env.appDomain}/manager/admin_center/`,
      description: "Account settings and system configuration",
      category: "management"
    },
    'admin-center': {
      url: `https://${env.appDomain}/manager/admin_center/`,
      description: "Administrative controls and settings",
      category: "management"
    },
    services: {
      url: `https://${env.appDomain}/manager/meeting/deliveries/`,
      description: "Meeting delivery services and catering",
      category: "management"
    },
    visitors: {
      url: `https://${env.appDomain}/manager/welcome/guests/`,
      description: "Guest management and visitor registration",
      category: "management"
    },
    guests: {
      url: `https://${env.appDomain}/manager/welcome/guests/`,
      description: "Same as visitors - guest management",
      category: "management"
    },
    insights: {
      url: `https://${env.appDomain}/manager/insights/`,
      description: "Analytics, reports and usage data",
      category: "management"
    },
    analytics: {
      url: `https://${env.appDomain}/manager/insights/`,
      description: "Same as insights - analytics and reports",
      category: "management"
    },
    reports: {
      url: `https://${env.appDomain}/manager/insights/`,
      description: "Same as insights - reporting dashboard",
      category: "management"
    },

    // User features (user domain)
    central: {
      url: `https://${env.userDomain}/central/events`,
      description: "Event management and scheduling central hub",
      category: "user"
    },
    events: {
      url: `https://${env.userDomain}/central/events`,
      description: "Same as central - event management",
      category: "user"
    },
    maps: {
      url: `https://${env.userDomain}/maps/personal`,
      description: "Interactive floor plans and location maps",
      category: "user"
    },
    'floor-plans': {
      url: `https://${env.userDomain}/maps/personal`,
      description: "Same as maps - floor plans and layouts",
      category: "user"
    },
    bookings: {
      url: `https://${env.userDomain}/all-bookings`,
      description: "Meeting room reservations and booking management",
      category: "user"
    },
    reservations: {
      url: `https://${env.userDomain}/all-bookings`,
      description: "Same as bookings - room reservations",
      category: "user"
    },
    'meeting-rooms': {
      url: `https://${env.userDomain}/all-bookings`,
      description: "Same as bookings - meeting room management",
      category: "user"
    }
  };

  return pages;
}

function getAvailablePagesDescription() {
  return `**Management & Admin:**
• **Dashboard** - Your main workspace and overview
• **Settings** - Account settings and system configuration
• **Services** - Meeting delivery services and catering
• **Visitors/Guests** - Guest management and visitor registration
• **Insights/Analytics/Reports** - Analytics, reports and usage data

**User Features:**
• **Central/Events** - Event management and scheduling central hub
• **Maps/Floor-Plans** - Interactive floor plans and location maps
• **Bookings/Reservations/Meeting-Rooms** - Meeting room reservations and booking management`;
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeHTML(str) {
  if (!str || typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function sanitizePageName(page) {
  if (!page || typeof page !== 'string') return '';
  // Remove any characters that aren't letters, numbers, hyphens, or underscores
  return page.toLowerCase().replace(/[^a-z0-9\-_]/g, '').substring(0, 50);
}

function validateHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  // Basic hostname validation
  const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]$/;
  return hostnameRegex.test(hostname) && hostname.length < 255;
}

function fetchWithRetry(url, options = {}, maxRetries = 2, baseTimeout = 3000) {
  return new Promise(async (resolve, reject) => {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = baseTimeout + (attempt * 1000); // Progressive timeout

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // If successful or permanent error, return immediately
        if (response.ok || response.status === 401 || response.status === 403) {
          resolve(response);
          return;
        }

        // For temporary errors, continue to retry
        if (attempt === maxRetries) {
          resolve(response); // Return the last response even if not ok
          return;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }

      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;

        // Don't retry on abort (timeout) for the last attempt
        if (attempt === maxRetries || (error.name === 'AbortError' && attempt >= 1)) {
          reject(new Error(`Failed after ${maxRetries + 1} attempts. Last error: ${error.message}`));
          return;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
      }
    }
  });
}

function fetchWithTimeout(url, options, timeout = 3000) {
  // Legacy function for backward compatibility - now uses the retry mechanism
  return fetchWithRetry(url, options, 1, timeout);
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
}
// Eucera integration script

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