/**
 * Pict Session Manager
 *
 * Manages authenticated REST requests across multiple security contexts.
 * Injects session credentials (headers, cookies) into the fable REST client.
 *
 * Uses Pict's template engine for URI/body template resolution,
 * Manyfest for address resolution, and the expression parser for solves.
 *
 * @author Steven Velozo <steven@velozo.com>
 */
const libFableServiceProviderBase = require('fable-serviceproviderbase');

const libPackage = require('../package.json');

const defaultSessionConfiguration = (
	{
		Name: 'Default',
		Type: 'Header',                    // 'Header', 'Cookie', 'Both'

		// Session check
		CheckSessionURITemplate: false,
		CheckSessionMethod: 'get',
		CheckSessionLoginMarkerType: 'boolean',  // 'boolean', 'existence', 'solver'
		CheckSessionLoginMarker: 'LoggedIn',
		CheckSessionDebounce: 0,           // ms - 0 means check every time

		// Authentication
		AuthenticationMethod: 'get',       // 'get' or 'post'
		AuthenticationURITemplate: false,
		AuthenticationRequestBody: false,   // Template object for POST body
		AuthenticationRetryCount: 2,
		AuthenticationRetryDebounce: 100,

		// Credential injection
		DomainMatch: false,                // String - which URLs get credentials injected
		HeaderName: false,                 // e.g. 'Authorization', 'x-session-token'
		HeaderValueTemplate: false,        // e.g. '{~D:Record.Token~}'
		CookieName: false,                 // Cookie name to inject
		CookieValueAddress: false,         // Manyfest address in SessionData to get cookie value

		// Credentials (set at runtime via authenticate())
		Credentials: {}
	});

class PictSessionManager extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'SessionManager';

		/** @type {Object} */
		this._Package = libPackage;

		// Convenience alias (per pict-provider pattern)
		this.pict = this.fable;

		// Map of session name -> session state
		this.sessions = {};

		// Whether this environment can manage cookies directly
		this.cookieCapability = true;
		this.detectCookieCapability();
	}

	// ---- Cookie Capability Detection ----

	detectCookieCapability()
	{
		if (typeof window !== 'undefined')
		{
			// In browser, cookie management is typically restricted
			this.cookieCapability = false;
		}
		else
		{
			this.cookieCapability = true;
		}
		return this.cookieCapability;
	}

	// ---- Template Helpers (using Pict) ----

	/**
	 * Parse a template string using Pict's template engine.
	 * Data is passed as the Record in template context.
	 *
	 * Uses {~D:Record.Key~} syntax for data lookups.
	 *
	 * @param {string} pTemplate - Template string with Pict directives
	 * @param {object} pData - Data object (accessible as Record in template)
	 * @returns {string} The resolved template string
	 */
	parseTemplateString(pTemplate, pData)
	{
		if (!pTemplate || typeof(pTemplate) !== 'string')
		{
			return '';
		}
		if (!pData || typeof(pData) !== 'object')
		{
			return pTemplate;
		}

		return this.pict.parseTemplate(pTemplate, pData);
	}

	/**
	 * Build a request body object from a template object.
	 * String values are parsed through Pict's template engine.
	 *
	 * @param {object} pTemplate - Body template object
	 * @param {object} pData - Data object for template resolution
	 * @returns {object} The resolved body object
	 */
	buildRequestBody(pTemplate, pData)
	{
		if (!pTemplate || typeof(pTemplate) !== 'object')
		{
			return {};
		}
		if (!pData || typeof(pData) !== 'object')
		{
			return JSON.parse(JSON.stringify(pTemplate));
		}

		let tmpBody = {};
		let tmpKeys = Object.keys(pTemplate);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];
			let tmpValue = pTemplate[tmpKey];
			if (typeof(tmpValue) === 'string')
			{
				tmpBody[tmpKey] = this.parseTemplateString(tmpValue, pData);
			}
			else
			{
				tmpBody[tmpKey] = tmpValue;
			}
		}
		return tmpBody;
	}

	/**
	 * Resolve a dot-notation address in an object using Manyfest.
	 *
	 * @param {object} pObject - The object to traverse
	 * @param {string} pAddress - Dot-notation address (e.g. 'Record.LoggedIn')
	 * @returns {*} The resolved value
	 */
	resolveAddress(pObject, pAddress)
	{
		if (!pObject || !pAddress)
		{
			return undefined;
		}

		return this.pict.manifest.getValueByHash(pObject, pAddress);
	}

	// ---- Session CRUD ----

	/**
	 * Create a new session state object from a configuration.
	 *
	 * @param {object} pConfiguration - Session configuration
	 * @returns {object} A session state object
	 */
	newSessionState(pConfiguration)
	{
		let tmpConfiguration = Object.assign({}, JSON.parse(JSON.stringify(defaultSessionConfiguration)), pConfiguration);

		return (
			{
				Name: tmpConfiguration.Name,
				Configuration: tmpConfiguration,
				Authenticated: false,
				SessionData: {},
				Cookies: {},
				Headers: {},
				AuthenticateInProgress: false,
				LastCheckTime: 0
			});
	}

	/**
	 * Add a named session with the given configuration.
	 *
	 * @param {string} pName - Session name
	 * @param {object} pConfiguration - Session configuration
	 * @returns {object} The session state
	 */
	addSession(pName, pConfiguration)
	{
		if (!pName || typeof(pName) !== 'string')
		{
			this.log.error('SessionManager.addSession: No valid session name provided.');
			return false;
		}

		let tmpConfig = pConfiguration || {};
		tmpConfig.Name = pName;

		let tmpSessionState = this.newSessionState(tmpConfig);
		this.sessions[pName] = tmpSessionState;

		this.log.info(`SessionManager: Added session [${pName}] with type [${tmpSessionState.Configuration.Type}].`);
		return tmpSessionState;
	}

	/**
	 * Remove a named session.
	 *
	 * @param {string} pName - Session name
	 * @returns {boolean} True if removed
	 */
	removeSession(pName)
	{
		if (!pName || !(pName in this.sessions))
		{
			return false;
		}
		delete this.sessions[pName];
		this.log.info(`SessionManager: Removed session [${pName}].`);
		return true;
	}

	/**
	 * Get a named session state.
	 *
	 * @param {string} pName - Session name
	 * @returns {object|false} The session state or false
	 */
	getSession(pName)
	{
		if (!pName || !(pName in this.sessions))
		{
			return false;
		}
		return this.sessions[pName];
	}

	/**
	 * Get a summary of all sessions.
	 *
	 * @returns {object} Map of session name -> { Name, Type, Authenticated, DomainMatch }
	 */
	getSessions()
	{
		let tmpSummary = {};
		let tmpKeys = Object.keys(this.sessions);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpSession = this.sessions[tmpKeys[i]];
			tmpSummary[tmpKeys[i]] = (
				{
					Name: tmpSession.Name,
					Type: tmpSession.Configuration.Type,
					Authenticated: tmpSession.Authenticated,
					DomainMatch: tmpSession.Configuration.DomainMatch
				});
		}
		return tmpSummary;
	}

	// ---- Session Check ----

	/**
	 * Check if a named session is currently authenticated.
	 * Makes the configured CheckSession request and parses the response.
	 *
	 * @param {string} pName - Session name
	 * @param {function} fCallback - Callback (pError, pAuthenticated, pSessionData)
	 */
	checkSession(pName, fCallback)
	{
		let tmpCallback = (typeof(fCallback) === 'function') ? fCallback : () => {};
		let tmpSessionState = this.getSession(pName);

		if (!tmpSessionState)
		{
			return tmpCallback(new Error(`Session [${pName}] not found.`));
		}

		let tmpConfig = tmpSessionState.Configuration;

		if (!tmpConfig.CheckSessionURITemplate)
		{
			return tmpCallback(new Error(`Session [${pName}] has no CheckSessionURITemplate configured.`));
		}

		// Debounce check
		if (tmpConfig.CheckSessionDebounce > 0)
		{
			let tmpNow = Date.now();
			if ((tmpNow - tmpSessionState.LastCheckTime) < tmpConfig.CheckSessionDebounce)
			{
				return tmpCallback(null, tmpSessionState.Authenticated, tmpSessionState.SessionData);
			}
		}

		let tmpURI = this.parseTemplateString(tmpConfig.CheckSessionURITemplate, tmpSessionState.Configuration.Credentials);

		// Build request options with current session headers/cookies
		let tmpRequestOptions = { url: tmpURI };
		tmpRequestOptions = this.prepareRequestOptions(pName, tmpRequestOptions);

		let tmpMethod = (tmpConfig.CheckSessionMethod || 'get').toLowerCase();

		this.pict.instantiateServiceProviderIfNotExists('RestClient');
		let tmpRestClient = this.pict.RestClient;

		if (!tmpRestClient)
		{
			return tmpCallback(new Error('No RestClient available on pict.'));
		}

		let tmpRequestFunction;
		if (tmpMethod === 'post')
		{
			tmpRequestOptions.body = {};
			tmpRequestFunction = tmpRestClient.postJSON.bind(tmpRestClient);
		}
		else
		{
			tmpRequestFunction = tmpRestClient.getJSON.bind(tmpRestClient);
		}

		tmpRequestFunction(tmpRequestOptions,
			(pError, pResponse, pData) =>
			{
				if (pError)
				{
					tmpSessionState.Authenticated = false;
					return tmpCallback(pError, false, null);
				}

				tmpSessionState.LastCheckTime = Date.now();

				// Allow overridable check processing
				let tmpCheckResult = this.onCheckSession(tmpSessionState, pResponse, pData);

				tmpSessionState.Authenticated = tmpCheckResult;
				if (tmpCheckResult && pData)
				{
					tmpSessionState.SessionData = pData;
				}

				return tmpCallback(null, tmpCheckResult, pData);
			});
	}

	/**
	 * Overridable: Process the CheckSession response and determine authentication state.
	 *
	 * @param {object} pSessionState - The session state object
	 * @param {object} pResponse - The HTTP response
	 * @param {*} pData - The parsed response data
	 * @returns {boolean} Whether the session is authenticated
	 */
	onCheckSession(pSessionState, pResponse, pData)
	{
		let tmpConfig = pSessionState.Configuration;

		if (!pData)
		{
			return false;
		}

		let tmpMarkerValue = this.resolveAddress(pData, tmpConfig.CheckSessionLoginMarker);

		switch (tmpConfig.CheckSessionLoginMarkerType)
		{
			case 'existence':
				return (tmpMarkerValue !== undefined && tmpMarkerValue !== null);

			case 'solver':
				// Use Pict's ExpressionParser for solver evaluations
				this.pict.instantiateServiceProviderIfNotExists('ExpressionParser');
				try
				{
					return !!this.pict.ExpressionParser.solve(tmpConfig.CheckSessionLoginMarker, pData);
				}
				catch (pError)
				{
					this.log.warn(`SessionManager: Solver error for session [${pSessionState.Name}]: ${pError.message}`);
					return false;
				}

			case 'boolean':
			default:
				return !!tmpMarkerValue;
		}
	}

	// ---- Authentication ----

	/**
	 * Authenticate a named session with the given credentials.
	 *
	 * @param {string} pName - Session name
	 * @param {object} pCredentials - Credentials object (e.g. { LoginID, LoginPassword })
	 * @param {function} fCallback - Callback (pError, pSessionState)
	 */
	authenticate(pName, pCredentials, fCallback)
	{
		let tmpCallback = (typeof(fCallback) === 'function') ? fCallback : () => {};
		let tmpSessionState = this.getSession(pName);

		if (!tmpSessionState)
		{
			return tmpCallback(new Error(`Session [${pName}] not found.`));
		}

		let tmpConfig = tmpSessionState.Configuration;

		if (!tmpConfig.AuthenticationURITemplate)
		{
			return tmpCallback(new Error(`Session [${pName}] has no AuthenticationURITemplate configured.`));
		}

		// Store credentials on the session
		if (pCredentials && typeof(pCredentials) === 'object')
		{
			tmpConfig.Credentials = pCredentials;
		}

		if (tmpSessionState.AuthenticateInProgress)
		{
			return tmpCallback(new Error(`Session [${pName}] authentication already in progress.`));
		}

		tmpSessionState.AuthenticateInProgress = true;

		let tmpRetryCount = tmpConfig.AuthenticationRetryCount || 0;
		let tmpRetryDebounce = tmpConfig.AuthenticationRetryDebounce || 100;
		let tmpAttempt = 0;

		let fAttemptAuthenticate = () =>
		{
			tmpAttempt++;
			this.log.info(`SessionManager: Authenticating session [${pName}] (attempt ${tmpAttempt})...`);

			this._executeAuthentication(tmpSessionState,
				(pError, pSessionData) =>
				{
					if (pError)
					{
						if (tmpAttempt <= tmpRetryCount)
						{
							this.log.warn(`SessionManager: Authentication attempt ${tmpAttempt} failed for [${pName}]: ${pError.message}. Retrying in ${tmpRetryDebounce}ms...`);
							setTimeout(fAttemptAuthenticate, tmpRetryDebounce);
							return;
						}
						else
						{
							tmpSessionState.AuthenticateInProgress = false;
							tmpSessionState.Authenticated = false;
							this.log.error(`SessionManager: Authentication failed for [${pName}] after ${tmpAttempt} attempt(s).`);
							return tmpCallback(pError, tmpSessionState);
						}
					}

					tmpSessionState.AuthenticateInProgress = false;
					tmpSessionState.Authenticated = true;
					tmpSessionState.SessionData = pSessionData || {};
					tmpSessionState.LastCheckTime = Date.now();

					// Allow overridable post-auth processing
					this.onAuthenticate(tmpSessionState, null, pSessionData);

					this.log.info(`SessionManager: Session [${pName}] authenticated successfully.`);
					return tmpCallback(null, tmpSessionState);
				});
		};

		fAttemptAuthenticate();
	}

	/**
	 * Execute the actual authentication request.
	 *
	 * @param {object} pSessionState - Session state object
	 * @param {function} fCallback - Callback (pError, pResponseData)
	 */
	_executeAuthentication(pSessionState, fCallback)
	{
		let tmpConfig = pSessionState.Configuration;
		let tmpCredentials = tmpConfig.Credentials || {};

		let tmpURI = this.parseTemplateString(tmpConfig.AuthenticationURITemplate, tmpCredentials);

		this.pict.instantiateServiceProviderIfNotExists('RestClient');
		let tmpRestClient = this.pict.RestClient;
		if (!tmpRestClient)
		{
			return fCallback(new Error('No RestClient available on pict.'));
		}

		let tmpMethod = (tmpConfig.AuthenticationMethod || 'get').toLowerCase();

		if (tmpMethod === 'post')
		{
			let tmpBody = {};
			if (tmpConfig.AuthenticationRequestBody)
			{
				tmpBody = this.buildRequestBody(tmpConfig.AuthenticationRequestBody, tmpCredentials);
			}

			tmpRestClient.postJSON({ url: tmpURI, body: tmpBody },
				(pError, pResponse, pData) =>
				{
					if (pError)
					{
						return fCallback(pError);
					}
					if (pResponse && pResponse.statusCode >= 400)
					{
						return fCallback(new Error(`Authentication returned status ${pResponse.statusCode}`));
					}
					return fCallback(null, pData);
				});
		}
		else
		{
			tmpRestClient.getJSON(tmpURI,
				(pError, pResponse, pData) =>
				{
					if (pError)
					{
						return fCallback(pError);
					}
					if (pResponse && pResponse.statusCode >= 400)
					{
						return fCallback(new Error(`Authentication returned status ${pResponse.statusCode}`));
					}
					return fCallback(null, pData);
				});
		}
	}

	/**
	 * Overridable: Process the authentication response.
	 * Default implementation extracts headers and cookies from SessionData based on configuration.
	 *
	 * @param {object} pSessionState - The session state object
	 * @param {object} pResponse - The HTTP response (may be null)
	 * @param {*} pData - The parsed response data
	 */
	onAuthenticate(pSessionState, pResponse, pData)
	{
		let tmpConfig = pSessionState.Configuration;

		// Extract header value if configured
		if (tmpConfig.HeaderName && tmpConfig.HeaderValueTemplate)
		{
			let tmpHeaderValue = this.parseTemplateString(tmpConfig.HeaderValueTemplate, pSessionState.SessionData);
			pSessionState.Headers[tmpConfig.HeaderName] = tmpHeaderValue;
		}
		else if (tmpConfig.HeaderName)
		{
			// If no template, look for the header name as an address in SessionData
			let tmpValue = this.resolveAddress(pSessionState.SessionData, tmpConfig.HeaderName);
			if (tmpValue)
			{
				pSessionState.Headers[tmpConfig.HeaderName] = String(tmpValue);
			}
		}

		// Extract cookie value if configured
		if (tmpConfig.CookieName && tmpConfig.CookieValueAddress)
		{
			let tmpCookieValue = this.resolveAddress(pSessionState.SessionData, tmpConfig.CookieValueAddress);
			if (tmpCookieValue !== undefined && tmpCookieValue !== null)
			{
				pSessionState.Cookies[tmpConfig.CookieName] = String(tmpCookieValue);
			}
		}
	}

	/**
	 * Deauthenticate a named session. Clears all session data, headers, cookies.
	 *
	 * @param {string} pName - Session name
	 * @returns {boolean} True if the session was found and deauthenticated
	 */
	deauthenticate(pName)
	{
		let tmpSessionState = this.getSession(pName);
		if (!tmpSessionState)
		{
			return false;
		}

		tmpSessionState.Authenticated = false;
		tmpSessionState.SessionData = {};
		tmpSessionState.Cookies = {};
		tmpSessionState.Headers = {};
		tmpSessionState.AuthenticateInProgress = false;
		tmpSessionState.LastCheckTime = 0;
		tmpSessionState.Configuration.Credentials = {};

		this.log.info(`SessionManager: Session [${pName}] deauthenticated.`);
		return true;
	}

	// ---- Request Options Injection ----

	/**
	 * Prepare request options for a specific named session.
	 * Injects headers and/or cookies based on session configuration and state.
	 *
	 * @param {string} pName - Session name
	 * @param {object} pOptions - Request options object (must have .url at minimum)
	 * @returns {object} The modified request options
	 */
	prepareRequestOptions(pName, pOptions)
	{
		let tmpSessionState = this.getSession(pName);
		if (!tmpSessionState || !tmpSessionState.Authenticated)
		{
			return pOptions;
		}

		let tmpConfig = tmpSessionState.Configuration;
		let tmpType = tmpConfig.Type || 'Header';

		if (!pOptions.headers)
		{
			pOptions.headers = {};
		}

		// Inject headers
		if (tmpType === 'Header' || tmpType === 'Both')
		{
			pOptions = this.onPrepareHeaders(tmpSessionState, pOptions);
		}

		// Inject cookies
		if (tmpType === 'Cookie' || tmpType === 'Both')
		{
			if (this.cookieCapability)
			{
				pOptions = this.onPrepareCookies(tmpSessionState, pOptions);
			}
			else
			{
				this.log.warn(`SessionManager: Cookie management not available for session [${pName}]. Skipping cookie injection.`);
			}
		}

		return pOptions;
	}

	/**
	 * Auto-detect which session matches the URL and inject credentials.
	 * This is the function that gets wired into the REST client.
	 *
	 * @param {object} pOptions - Request options object
	 * @returns {object} The modified request options
	 */
	prepareRequestOptionsAuto(pOptions)
	{
		if (!pOptions || !pOptions.url)
		{
			return pOptions;
		}

		let tmpSessionKeys = Object.keys(this.sessions);
		for (let i = 0; i < tmpSessionKeys.length; i++)
		{
			let tmpSession = this.sessions[tmpSessionKeys[i]];
			let tmpDomainMatch = tmpSession.Configuration.DomainMatch;

			if (tmpDomainMatch && tmpSession.Authenticated)
			{
				if (pOptions.url.indexOf(tmpDomainMatch) >= 0)
				{
					pOptions = this.prepareRequestOptions(tmpSessionKeys[i], pOptions);
				}
			}
		}

		return pOptions;
	}

	/**
	 * Overridable: Inject headers from a session into request options.
	 *
	 * @param {object} pSessionState - The session state
	 * @param {object} pOptions - The request options
	 * @returns {object} The modified request options
	 */
	onPrepareHeaders(pSessionState, pOptions)
	{
		let tmpHeaderKeys = Object.keys(pSessionState.Headers);
		for (let i = 0; i < tmpHeaderKeys.length; i++)
		{
			pOptions.headers[tmpHeaderKeys[i]] = pSessionState.Headers[tmpHeaderKeys[i]];
		}
		return pOptions;
	}

	/**
	 * Overridable: Inject cookies from a session into request options.
	 *
	 * @param {object} pSessionState - The session state
	 * @param {object} pOptions - The request options
	 * @returns {object} The modified request options
	 */
	onPrepareCookies(pSessionState, pOptions)
	{
		let tmpCookieKeys = Object.keys(pSessionState.Cookies);
		if (tmpCookieKeys.length > 0)
		{
			let tmpCookieParts = [];

			// Preserve any existing cookies on the request
			if (pOptions.headers.cookie)
			{
				tmpCookieParts.push(pOptions.headers.cookie);
			}

			for (let i = 0; i < tmpCookieKeys.length; i++)
			{
				tmpCookieParts.push(`${tmpCookieKeys[i]}=${pSessionState.Cookies[tmpCookieKeys[i]]}`);
			}

			pOptions.headers.cookie = tmpCookieParts.join('; ');
		}
		return pOptions;
	}

	// ---- REST Client Connection ----

	/**
	 * Connect this session manager to a fable RestClient instance.
	 * Overrides prepareRequestOptions to inject session credentials automatically.
	 *
	 * @param {object} pRestClient - A fable RestClient service instance
	 */
	connectToRestClient(pRestClient)
	{
		if (!pRestClient)
		{
			this.pict.instantiateServiceProviderIfNotExists('RestClient');
			if (this.pict.RestClient)
			{
				pRestClient = this.pict.RestClient;
			}
			else
			{
				this.log.error('SessionManager.connectToRestClient: No RestClient provided or available on pict.');
				return;
			}
		}

		// Stash the original so disconnectRestClient can restore it
		let tmpOriginalPrepare = pRestClient.prepareRequestOptions.bind(pRestClient);
		let tmpSessionManager = this;

		pRestClient.prepareRequestOptions = (pOptions) =>
		{
			let tmpOptions = tmpOriginalPrepare(pOptions);
			return tmpSessionManager.prepareRequestOptionsAuto(tmpOptions);
		};

		this._connectedRestClient = pRestClient;
		this._originalPrepareRequestOptions = tmpOriginalPrepare;

		this.log.info('SessionManager: Connected to RestClient.');
	}

	/**
	 * Disconnect this session manager from a previously connected RestClient.
	 * Restores the original prepareRequestOptions function.
	 *
	 * @param {object} pRestClient - Optional; if not provided, disconnects the previously connected RestClient
	 * @returns {boolean} True if successfully disconnected
	 */
	disconnectRestClient(pRestClient)
	{
		let tmpRestClient = pRestClient || this._connectedRestClient;

		if (!tmpRestClient || !this._originalPrepareRequestOptions)
		{
			this.log.warn('SessionManager.disconnectRestClient: No connected RestClient to disconnect.');
			return false;
		}

		tmpRestClient.prepareRequestOptions = this._originalPrepareRequestOptions;

		this._connectedRestClient = null;
		this._originalPrepareRequestOptions = null;

		this.log.info('SessionManager: Disconnected from RestClient.');
		return true;
	}
}

// Backwards compatibility factory
function autoConstruct(pSettings)
{
	return new PictSessionManager(pSettings);
}

module.exports = PictSessionManager;
module.exports.new = autoConstruct;
