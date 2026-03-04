# Credential Injection

Methods for injecting session credentials into outgoing REST request options.

## prepareRequestOptions(pName, pOptions)

Inject credentials from a specific named session into request options. Adds headers and/or cookies based on the session's `Type` configuration.

Only injects credentials if the session exists and is authenticated.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pName` | `string` | Yes | Session name |
| `pOptions` | `object` | Yes | Request options object (must have `.url` at minimum) |

**Returns:** `object` — The modified request options with injected credentials.

**Example:**

```javascript
// After authenticating 'MyAPI'...
let tmpOptions = { url: 'https://api.example.com/data' };
tmpOptions = tmpPict.SessionManager.prepareRequestOptions('MyAPI', tmpOptions);

console.log(tmpOptions.headers);
// { 'x-session-token': 'abc123...' }
```

```javascript
// For a 'Both' type session, both headers and cookies are injected
tmpPict.SessionManager.addSession('HybridAPI',
	{
		Type: 'Both',
		HeaderName: 'Authorization',
		HeaderValueTemplate: 'Bearer {~D:Record.Token~}',
		CookieName: 'session_id',
		CookieValueAddress: 'SessionID'
	});

// After authentication...
let tmpOptions = { url: 'https://hybrid.example.com/api' };
tmpOptions = tmpPict.SessionManager.prepareRequestOptions('HybridAPI', tmpOptions);

console.log(tmpOptions.headers['Authorization']);  // 'Bearer abc123...'
console.log(tmpOptions.headers['cookie']);          // 'session_id=xyz789...'
```

---

## prepareRequestOptionsAuto(pOptions)

Automatically detect which sessions match the request URL and inject their credentials. This is the method that gets wired into the REST client when you call `connectToRestClient()`.

Iterates all registered sessions and checks each one's `DomainMatch` against `pOptions.url`. For every match, that session's credentials are injected.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pOptions` | `object` | Yes | Request options object with `.url` |

**Returns:** `object` — The modified request options.

**Example:**

```javascript
// Two sessions with different domain matches
tmpPict.SessionManager.addSession('API_A',
	{
		Type: 'Header',
		HeaderName: 'x-token-a',
		DomainMatch: 'api-a.example.com'
	});

tmpPict.SessionManager.addSession('API_B',
	{
		Type: 'Header',
		HeaderName: 'x-token-b',
		DomainMatch: 'api-b.example.com'
	});

// After authenticating both sessions...

// Only API_A credentials injected
let tmpOptionsA = tmpPict.SessionManager.prepareRequestOptionsAuto(
	{ url: 'https://api-a.example.com/data' });

// Only API_B credentials injected
let tmpOptionsB = tmpPict.SessionManager.prepareRequestOptionsAuto(
	{ url: 'https://api-b.example.com/data' });
```

---

## onPrepareHeaders(pSessionState, pOptions)

Overridable method that injects headers from a session into request options. The default implementation copies all key-value pairs from `pSessionState.Headers` into `pOptions.headers`.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pSessionState` | `object` | The session state object |
| `pOptions` | `object` | The request options |

**Returns:** `object` — The modified request options.

**Example — Default Behavior:**

```javascript
// If pSessionState.Headers = { 'Authorization': 'Bearer abc123' }
// Then pOptions.headers['Authorization'] = 'Bearer abc123' after injection
```

**Example — Custom Override:**

```javascript
class MySessionManager extends libPictSessionManager
{
	onPrepareHeaders(pSessionState, pOptions)
	{
		// Call default to inject configured headers
		pOptions = super.onPrepareHeaders(pSessionState, pOptions);

		// Add a custom correlation ID header
		pOptions.headers['x-correlation-id'] = this.fable.getUUID();

		return pOptions;
	}
}
```

---

## onPrepareCookies(pSessionState, pOptions)

Overridable method that injects cookies from a session into request options. The default implementation builds a cookie header string from `pSessionState.Cookies`, preserving any existing cookies on the request.

Only called when `cookieCapability` is `true` (Node.js environment). In browser environments, cookie injection is skipped and a warning is logged.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pSessionState` | `object` | The session state object |
| `pOptions` | `object` | The request options |

**Returns:** `object` — The modified request options.

**Example — Default Behavior:**

```javascript
// If pSessionState.Cookies = { 'session_id': 'abc123', 'pref': 'dark' }
// And pOptions.headers.cookie = 'existing=value'
// Then pOptions.headers.cookie = 'existing=value; session_id=abc123; pref=dark'
```

**Example — Custom Override:**

```javascript
class MySessionManager extends libPictSessionManager
{
	onPrepareCookies(pSessionState, pOptions)
	{
		// Call default to inject configured cookies
		pOptions = super.onPrepareCookies(pSessionState, pOptions);

		// Add a timestamp cookie
		if (!pOptions.headers.cookie)
		{
			pOptions.headers.cookie = '';
		}
		pOptions.headers.cookie += `; request_time=${Date.now()}`;

		return pOptions;
	}
}
```
