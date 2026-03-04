# Session Management

Methods for creating, retrieving, removing, and resetting named sessions.

## addSession(pName, pConfiguration)

Add a named session to the session manager with the given configuration.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pName` | `string` | Yes | Unique session name |
| `pConfiguration` | `object` | No | Session configuration (merged with defaults) |

**Returns:** `object|false` — The session state object, or `false` if the name is invalid.

**Example:**

```javascript
// Add a header-based session for a REST API
let tmpSession = tmpPict.SessionManager.addSession('MyAPI',
	{
		Type: 'Header',
		AuthenticationURITemplate: '/api/auth/{~D:Record.UserName~}/{~D:Record.Password~}',
		CheckSessionURITemplate: '/api/session/check',
		CheckSessionLoginMarkerType: 'boolean',
		CheckSessionLoginMarker: 'LoggedIn',
		HeaderName: 'Authorization',
		HeaderValueTemplate: 'Bearer {~D:Record.Token~}',
		DomainMatch: 'api.example.com',
		AuthenticationRetryCount: 3,
		AuthenticationRetryDebounce: 200
	});

console.log(tmpSession.Name);            // 'MyAPI'
console.log(tmpSession.Authenticated);    // false
console.log(tmpSession.Configuration);    // merged config with defaults
```

```javascript
// Add a cookie-based session
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
		CheckSessionURITemplate: '/session/status',
		CookieName: 'session_id',
		CookieValueAddress: 'SessionID',
		DomainMatch: 'webapp.example.com'
	});
```

```javascript
// Invalid name returns false
let tmpResult = tmpPict.SessionManager.addSession('', {});
console.log(tmpResult); // false
```

---

## removeSession(pName)

Remove a named session from the session manager.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pName` | `string` | Yes | Session name to remove |

**Returns:** `boolean` — `true` if the session was found and removed, `false` otherwise.

**Example:**

```javascript
tmpPict.SessionManager.addSession('Temporary', { Type: 'Header' });

let tmpRemoved = tmpPict.SessionManager.removeSession('Temporary');
console.log(tmpRemoved); // true

let tmpAgain = tmpPict.SessionManager.removeSession('Temporary');
console.log(tmpAgain); // false (already removed)
```

---

## getSession(pName)

Retrieve the session state object for a named session.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pName` | `string` | Yes | Session name |

**Returns:** `object|false` — The session state object, or `false` if not found.

**Example:**

```javascript
tmpPict.SessionManager.addSession('MyAPI', { Type: 'Header' });

let tmpSession = tmpPict.SessionManager.getSession('MyAPI');
console.log(tmpSession.Name);           // 'MyAPI'
console.log(tmpSession.Authenticated);   // false
console.log(tmpSession.SessionData);     // {}
console.log(tmpSession.Headers);         // {}
console.log(tmpSession.Cookies);         // {}

// Non-existent session returns false
let tmpMissing = tmpPict.SessionManager.getSession('DoesNotExist');
console.log(tmpMissing); // false
```

---

## getSessions()

Get a summary of all registered sessions.

**Returns:** `object` — A map of session name to summary object containing `Name`, `Type`, `Authenticated`, and `DomainMatch`.

**Example:**

```javascript
tmpPict.SessionManager.addSession('API_A', { Type: 'Header', DomainMatch: 'a.example.com' });
tmpPict.SessionManager.addSession('API_B', { Type: 'Cookie', DomainMatch: 'b.example.com' });

let tmpSummary = tmpPict.SessionManager.getSessions();
console.log(tmpSummary);
// {
//   API_A: { Name: 'API_A', Type: 'Header', Authenticated: false, DomainMatch: 'a.example.com' },
//   API_B: { Name: 'API_B', Type: 'Cookie', Authenticated: false, DomainMatch: 'b.example.com' }
// }
```

---

## newSessionState(pConfiguration)

Create a new session state object from a configuration without adding it to the session manager. Useful for inspecting the merged configuration defaults or for testing.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pConfiguration` | `object` | No | Session configuration (merged with defaults) |

**Returns:** `object` — A session state object.

**Example:**

```javascript
let tmpState = tmpPict.SessionManager.newSessionState(
	{
		Name: 'Preview',
		Type: 'Both',
		HeaderName: 'x-token'
	});

console.log(tmpState.Name);                          // 'Preview'
console.log(tmpState.Configuration.Type);             // 'Both'
console.log(tmpState.Configuration.HeaderName);       // 'x-token'
console.log(tmpState.Configuration.CheckSessionMethod); // 'get' (default)
console.log(tmpState.Authenticated);                  // false
```

---

## deauthenticate(pName)

Clear all authentication state for a named session. Resets the session to its pre-authenticated state: clears session data, headers, cookies, credentials, and resets the debounce timer.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pName` | `string` | Yes | Session name |

**Returns:** `boolean` — `true` if the session was found and deauthenticated, `false` if not found.

**Example:**

```javascript
// After successful authentication...
tmpPict.SessionManager.deauthenticate('MyAPI');

let tmpSession = tmpPict.SessionManager.getSession('MyAPI');
console.log(tmpSession.Authenticated);     // false
console.log(tmpSession.SessionData);       // {}
console.log(tmpSession.Headers);           // {}
console.log(tmpSession.Cookies);           // {}
console.log(tmpSession.LastCheckTime);     // 0
```
