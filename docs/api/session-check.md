# Session Checking

Methods for verifying that an existing session is still valid.

## checkSession(pName, fCallback)

Check whether a named session is currently authenticated by making the configured session check request and evaluating the response.

Supports debouncing: if `CheckSessionDebounce` is set, repeated calls within the debounce window return the cached authentication state without making a new request.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pName` | `string` | Yes | Session name |
| `fCallback` | `function` | No | Callback `(pError, pAuthenticated, pSessionData)` |

**Behavior:**

1. Looks up the named session
2. Checks the debounce timer — if within the debounce window, returns cached state
3. Resolves the `CheckSessionURITemplate` using Pict templates
4. Prepares request options with current session credentials
5. Makes a GET or POST request (based on `CheckSessionMethod`)
6. Calls `onCheckSession()` to evaluate the response
7. Updates the session authentication state and returns the result

**Example — Basic Check:**

```javascript
tmpPict.SessionManager.addSession('MyAPI',
	{
		Type: 'Header',
		CheckSessionURITemplate: '/api/session/check',
		CheckSessionLoginMarkerType: 'boolean',
		CheckSessionLoginMarker: 'LoggedIn',
		HeaderName: 'x-session-token',
		HeaderValueTemplate: '{~D:Record.Token~}'
	});

// After authentication...
tmpPict.SessionManager.checkSession('MyAPI',
	(pError, pAuthenticated, pSessionData) =>
	{
		if (pError)
		{
			console.error('Check failed:', pError.message);
			return;
		}

		console.log('Is authenticated:', pAuthenticated);  // true or false
		console.log('Session data:', pSessionData);        // response from server
	});
```

**Example — With Debounce:**

```javascript
tmpPict.SessionManager.addSession('FrequentAPI',
	{
		Type: 'Header',
		CheckSessionURITemplate: '/api/session/check',
		CheckSessionLoginMarkerType: 'boolean',
		CheckSessionLoginMarker: 'LoggedIn',
		CheckSessionDebounce: 5000  // Only check once every 5 seconds
	});

// First call makes the actual request
tmpPict.SessionManager.checkSession('FrequentAPI', (pError, pAuth) =>
	{
		console.log('First check (real request):', pAuth);

		// Second call within 5 seconds returns cached state
		tmpPict.SessionManager.checkSession('FrequentAPI', (pError2, pAuth2) =>
			{
				console.log('Second check (cached):', pAuth2);
			});
	});
```

---

## onCheckSession(pSessionState, pResponse, pData)

Overridable method that evaluates the session check response and determines whether the session is authenticated.

Called automatically by `checkSession()` after receiving the response. Override this in a subclass to add custom session validation logic.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pSessionState` | `object` | The session state object |
| `pResponse` | `object` | The HTTP response |
| `pData` | `*` | The parsed response data |

**Returns:** `boolean` — Whether the session is authenticated.

**Default Behavior:**

The default implementation evaluates the response based on `CheckSessionLoginMarkerType`:

### `boolean` (default)

Resolves `CheckSessionLoginMarker` as a dot-notation address in the response data and checks its truthiness.

```javascript
// Configuration
{
	CheckSessionLoginMarkerType: 'boolean',
	CheckSessionLoginMarker: 'LoggedIn'
}

// Response: { LoggedIn: true } => returns true
// Response: { LoggedIn: false } => returns false
// Response: { LoggedIn: 0 } => returns false
```

### `existence`

Resolves the address and checks that the value is not `undefined` or `null`.

```javascript
// Configuration
{
	CheckSessionLoginMarkerType: 'existence',
	CheckSessionLoginMarker: 'SessionToken'
}

// Response: { SessionToken: 'abc123' } => returns true
// Response: { SessionToken: '' } => returns true (empty string exists)
// Response: {} => returns false (undefined)
// Response: { SessionToken: null } => returns false
```

### `solver`

Evaluates the marker as a Pict ExpressionParser expression against the response data.

```javascript
// Configuration
{
	CheckSessionLoginMarkerType: 'solver',
	CheckSessionLoginMarker: 'ActiveSessions + 1'
}

// Response: { ActiveSessions: 5 } => returns true (6 is truthy)
```

**Example — Custom Override:**

```javascript
const libPictSessionManager = require('pict-sessionmanager');

class MySessionManager extends libPictSessionManager
{
	onCheckSession(pSessionState, pResponse, pData)
	{
		// Custom validation: check both a marker AND a timestamp
		if (!pData || !pData.LoggedIn)
		{
			return false;
		}

		// Reject sessions older than 24 hours
		if (pData.SessionCreated)
		{
			let tmpAge = Date.now() - new Date(pData.SessionCreated).getTime();
			if (tmpAge > 24 * 60 * 60 * 1000)
			{
				this.log.warn('Session expired by age');
				return false;
			}
		}

		return true;
	}
}
```
