# Authentication

Methods for authenticating sessions and processing authentication responses.

## authenticate(pName, pCredentials, fCallback)

Authenticate a named session with the given credentials. Makes the configured authentication request (GET or POST) and processes the response to extract session headers and cookies.

Supports configurable retry logic: if the request fails, it retries up to `AuthenticationRetryCount` times with a `AuthenticationRetryDebounce` delay between attempts.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pName` | `string` | Yes | Session name |
| `pCredentials` | `object` | No | Credentials object (stored on the session configuration) |
| `fCallback` | `function` | No | Callback `(pError, pSessionState)` |

**Behavior:**

1. Looks up the named session
2. Stores `pCredentials` on the session configuration
3. Guards against concurrent authentication (returns error if already in progress)
4. Resolves the `AuthenticationURITemplate` using Pict templates with the credentials as data
5. For `post` method: builds the request body from `AuthenticationRequestBody` template
6. Makes the REST request
7. On success: marks session as authenticated, stores response data, calls `onAuthenticate()`
8. On failure: retries if attempts remain, otherwise returns the error

**Example — GET Authentication:**

```javascript
tmpPict.SessionManager.addSession('MyAPI',
	{
		Type: 'Header',
		AuthenticationMethod: 'get',
		AuthenticationURITemplate: '/api/auth/{~D:Record.UserName~}/{~D:Record.Password~}',
		HeaderName: 'x-session-token',
		HeaderValueTemplate: '{~D:Record.Token~}',
		DomainMatch: 'api.example.com'
	});

tmpPict.SessionManager.authenticate('MyAPI',
	{ UserName: 'alice', Password: 'secret123' },
	(pError, pSessionState) =>
	{
		if (pError)
		{
			console.error('Authentication failed:', pError.message);
			return;
		}

		console.log('Authenticated:', pSessionState.Authenticated);  // true
		console.log('Session data:', pSessionState.SessionData);     // response from server
		console.log('Headers:', pSessionState.Headers);              // { 'x-session-token': '...' }
	});
```

**Example — POST Authentication:**

```javascript
tmpPict.SessionManager.addSession('WebApp',
	{
		Type: 'Cookie',
		AuthenticationMethod: 'post',
		AuthenticationURITemplate: '/login',
		AuthenticationRequestBody:
			{
				username: '{~D:Record.UserName~}',
				password: '{~D:Record.Password~}'
			},
		CookieName: 'session_id',
		CookieValueAddress: 'SessionID',
		DomainMatch: 'webapp.example.com'
	});

tmpPict.SessionManager.authenticate('WebApp',
	{ UserName: 'bob', Password: 'pass456' },
	(pError, pSessionState) =>
	{
		if (pError)
		{
			console.error('Login failed:', pError.message);
			return;
		}

		console.log('Cookies:', pSessionState.Cookies);
		// { 'session_id': 'abc123...' }
	});
```

**Example — With Retry:**

```javascript
tmpPict.SessionManager.addSession('UnstableAPI',
	{
		Type: 'Header',
		AuthenticationURITemplate: '/auth/{~D:Record.Key~}',
		HeaderName: 'x-api-key',
		HeaderValueTemplate: '{~D:Record.Token~}',
		AuthenticationRetryCount: 3,
		AuthenticationRetryDebounce: 500
	});

// Will retry up to 3 times with 500ms between attempts
tmpPict.SessionManager.authenticate('UnstableAPI',
	{ Key: 'my-api-key' },
	(pError, pSessionState) =>
	{
		if (pError)
		{
			console.error('Failed after retries:', pError.message);
		}
	});
```

---

## onAuthenticate(pSessionState, pResponse, pData)

Overridable method that processes the authentication response. The default implementation extracts header and cookie values from `SessionData` based on the session configuration.

Called automatically after a successful authentication request. Override this in a subclass to add custom post-authentication logic.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pSessionState` | `object` | The session state object |
| `pResponse` | `object\|null` | The HTTP response (may be null) |
| `pData` | `*` | The parsed response data |

**Default Behavior:**

1. If `HeaderName` and `HeaderValueTemplate` are configured: parses the template against `SessionData` and stores the result in `pSessionState.Headers`
2. If `HeaderName` is configured without a template: looks up `HeaderName` as an address in `SessionData` and stores the resolved value
3. If `CookieName` and `CookieValueAddress` are configured: resolves the address in `SessionData` and stores the cookie value

**Example — Custom Override:**

```javascript
const libPictSessionManager = require('pict-sessionmanager');

class MySessionManager extends libPictSessionManager
{
	onAuthenticate(pSessionState, pResponse, pData)
	{
		// Call the default behavior first
		super.onAuthenticate(pSessionState, pResponse, pData);

		// Store a refresh token for later use
		if (pData && pData.RefreshToken)
		{
			pSessionState.SessionData.RefreshToken = pData.RefreshToken;
		}

		// Log custom information
		this.log.info(`Custom post-auth for [${pSessionState.Name}]: user=${pData.UserID}`);
	}
}
```
