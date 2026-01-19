/**
 * Mastodon OAuth and API functions for FediThready
 * Client-side only implementation using PKCE
 */

const MastodonAPI = (function() {
    // localStorage keys
    const STORAGE_KEYS = {
        instance: 'mastodon_instance',
        clientId: 'mastodon_client_id',
        clientSecret: 'mastodon_client_secret',
        accessToken: 'mastodon_access_token'
    };

    // sessionStorage keys (temporary during OAuth)
    const SESSION_KEYS = {
        codeVerifier: 'mastodon_code_verifier',
        pendingInstance: 'mastodon_pending_instance'
    };

    // PKCE helpers
    function generateCodeVerifier() {
        const array = new Uint8Array(28);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
        // Convert to base64url
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // Normalize instance URL (remove protocol, trailing slashes)
    function normalizeInstance(instance) {
        return instance
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/+$/, '');
    }

    function getInstanceURL(instance) {
        return `https://${normalizeInstance(instance)}`;
    }

    // Storage helpers
    function saveCredentials(instance, clientId, clientSecret, accessToken) {
        localStorage.setItem(STORAGE_KEYS.instance, normalizeInstance(instance));
        localStorage.setItem(STORAGE_KEYS.clientId, clientId);
        localStorage.setItem(STORAGE_KEYS.clientSecret, clientSecret);
        localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
    }

    function getCredentials() {
        const instance = localStorage.getItem(STORAGE_KEYS.instance);
        const clientId = localStorage.getItem(STORAGE_KEYS.clientId);
        const clientSecret = localStorage.getItem(STORAGE_KEYS.clientSecret);
        const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);

        if (instance && clientId && accessToken) {
            return { instance, clientId, clientSecret, accessToken };
        }
        return null;
    }

    function clearCredentials() {
        localStorage.removeItem(STORAGE_KEYS.instance);
        localStorage.removeItem(STORAGE_KEYS.clientId);
        localStorage.removeItem(STORAGE_KEYS.clientSecret);
        localStorage.removeItem(STORAGE_KEYS.accessToken);
    }

    // Session storage helpers (for OAuth flow)
    function savePendingAuth(instance, codeVerifier) {
        sessionStorage.setItem(SESSION_KEYS.pendingInstance, normalizeInstance(instance));
        sessionStorage.setItem(SESSION_KEYS.codeVerifier, codeVerifier);
    }

    function getPendingAuth() {
        const instance = sessionStorage.getItem(SESSION_KEYS.pendingInstance);
        const codeVerifier = sessionStorage.getItem(SESSION_KEYS.codeVerifier);
        if (instance && codeVerifier) {
            return { instance, codeVerifier };
        }
        return null;
    }

    function clearPendingAuth() {
        sessionStorage.removeItem(SESSION_KEYS.pendingInstance);
        sessionStorage.removeItem(SESSION_KEYS.codeVerifier);
    }

    // Check if running from a file:// URL
    function isFileProtocol() {
        return window.location.protocol === 'file:';
    }

    // Get redirect URI (current page without query params)
    function getRedirectURI() {
        return window.location.origin + window.location.pathname;
    }

    // App Registration
    async function registerApp(instance) {
        const instanceURL = getInstanceURL(instance);
        const redirectURI = getRedirectURI();

        const params = new URLSearchParams();
        params.append('client_name', 'FediThready');
        params.append('redirect_uris', redirectURI);
        params.append('scopes', 'read write');
        params.append('website', 'https://fedithready.app');

        const response = await fetch(`${instanceURL}/api/v1/apps`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to register app: ${error}`);
        }

        return await response.json();
    }

    // Get authorization URL
    function getAuthorizationURL(instance, clientId, codeChallenge) {
        const instanceURL = getInstanceURL(instance);
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: getRedirectURI(),
            response_type: 'code',
            scope: 'read write',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });
        return `${instanceURL}/oauth/authorize?${params.toString()}`;
    }

    // Exchange code for token
    async function exchangeCodeForToken(instance, clientId, clientSecret, code, codeVerifier) {
        const instanceURL = getInstanceURL(instance);

        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('redirect_uri', getRedirectURI());
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('code_verifier', codeVerifier);

        const response = await fetch(`${instanceURL}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to exchange code for token: ${error}`);
        }

        return await response.json();
    }

    // Start OAuth flow - redirects to Mastodon for authorization
    async function startOAuthFlow(instance) {
        const normalizedInstance = normalizeInstance(instance);

        // Register app
        const appData = await registerApp(normalizedInstance);
        const { client_id, client_secret } = appData;

        // Generate PKCE values
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Save pending auth data and client credentials
        savePendingAuth(normalizedInstance, codeVerifier);
        localStorage.setItem(STORAGE_KEYS.clientId, client_id);
        localStorage.setItem(STORAGE_KEYS.clientSecret, client_secret);
        localStorage.setItem(STORAGE_KEYS.instance, normalizedInstance);

        // Redirect to authorization
        const authURL = getAuthorizationURL(normalizedInstance, client_id, codeChallenge);
        window.location.href = authURL;
    }

    // Handle OAuth callback
    async function handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            clearPendingAuth();
            throw new Error(`OAuth error: ${error}`);
        }

        if (!code) {
            return null; // No callback to handle
        }

        const pendingAuth = getPendingAuth();
        if (!pendingAuth) {
            throw new Error('No pending authentication found');
        }

        const clientId = localStorage.getItem(STORAGE_KEYS.clientId);
        const clientSecret = localStorage.getItem(STORAGE_KEYS.clientSecret);
        const instance = localStorage.getItem(STORAGE_KEYS.instance);

        if (!clientId || !instance) {
            clearPendingAuth();
            throw new Error('Missing client credentials');
        }

        // Exchange code for token
        const tokenData = await exchangeCodeForToken(
            instance,
            clientId,
            clientSecret,
            code,
            pendingAuth.codeVerifier
        );

        // Save credentials
        saveCredentials(instance, clientId, clientSecret, tokenData.access_token);

        // Clear pending auth
        clearPendingAuth();

        // Clear URL parameters
        window.history.replaceState({}, document.title, getRedirectURI());

        return getCredentials();
    }

    // Post a single status
    async function postStatus(instance, accessToken, params) {
        const instanceURL = getInstanceURL(instance);
        const response = await fetch(`${instanceURL}/api/v1/statuses`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to post status: ${error}`);
        }

        return await response.json();
    }

    // Post a thread (array of chunks)
    async function postThread(instance, accessToken, chunks, visibility) {
        let previousId = null;
        const postedStatuses = [];

        for (let i = 0; i < chunks.length; i++) {
            try {
                const params = {
                    status: chunks[i],
                    visibility: visibility
                };

                if (previousId) {
                    params.in_reply_to_id = previousId;
                }

                const status = await postStatus(instance, accessToken, params);
                postedStatuses.push(status);
                previousId = status.id;
            } catch (error) {
                return {
                    success: false,
                    failedIndex: i,
                    error: error.message,
                    postedStatuses: postedStatuses
                };
            }
        }

        return {
            success: true,
            postedStatuses: postedStatuses
        };
    }

    // Get custom emojis (for future use)
    async function getCustomEmojis(instance, accessToken) {
        const instanceURL = getInstanceURL(instance);
        const response = await fetch(`${instanceURL}/api/v1/custom_emojis`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch custom emojis');
        }

        return await response.json();
    }

    // Public API
    return {
        getCredentials,
        clearCredentials,
        startOAuthFlow,
        handleOAuthCallback,
        isFileProtocol,
        postStatus,
        postThread,
        getCustomEmojis,
        normalizeInstance
    };
})();
