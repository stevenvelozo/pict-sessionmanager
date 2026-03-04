# Session Configuration

Complete reference for all session configuration options. Configuration is passed as the second argument to `addSession()` and is merged with sensible defaults.

## Default Configuration

```javascript
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
}
```

## Configuration Options

### Identity

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `Name` | `string` | `'Default'` | Session name (set automatically by `addSession`) |
| `Type` | `string` | `'Header'` | Credential injection type: `'Header'`, `'Cookie'`, or `'Both'` |

### Session Checking

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `CheckSessionURITemplate` | `string\|false` | `false` | Pict template for the session check endpoint URL |
| `CheckSessionMethod` | `string` | `'get'` | HTTP method for session check: `'get'` or `'post'` |
| `CheckSessionLoginMarkerType` | `string` | `'boolean'` | How to evaluate the response: `'boolean'`, `'existence'`, or `'solver'` |
| `CheckSessionLoginMarker` | `string` | `'LoggedIn'` | Dot-notation address or expression to evaluate in the response |
| `CheckSessionDebounce` | `number` | `0` | Milliseconds between actual session checks. `0` means check every time. |

### Authentication

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `AuthenticationMethod` | `string` | `'get'` | HTTP method for authentication: `'get'` or `'post'` |
| `AuthenticationURITemplate` | `string\|false` | `false` | Pict template for the authentication endpoint URL |
| `AuthenticationRequestBody` | `object\|false` | `false` | Template object for POST request body. String values are parsed through the template engine. |
| `AuthenticationRetryCount` | `number` | `2` | Maximum number of retry attempts on authentication failure |
| `AuthenticationRetryDebounce` | `number` | `100` | Milliseconds to wait between retry attempts |

### Credential Injection

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `DomainMatch` | `string\|false` | `false` | Substring to match against request URLs for auto-injection |
| `HeaderName` | `string\|false` | `false` | HTTP header name to inject (e.g. `'Authorization'`, `'x-session-token'`) |
| `HeaderValueTemplate` | `string\|false` | `false` | Pict template for the header value (e.g. `'Bearer {~D:Record.Token~}'`) |
| `CookieName` | `string\|false` | `false` | Cookie name to inject |
| `CookieValueAddress` | `string\|false` | `false` | Dot-notation address in `SessionData` to get the cookie value |

### Runtime

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `Credentials` | `object` | `{}` | Credentials object (set by `authenticate()` at runtime) |

## Template Syntax

All template strings use Pict's `{~D:Record.Key~}` syntax:

- `{~D:Record.UserName~}` — resolves `UserName` from the data object
- `{~D:Record.Auth.Token~}` — resolves nested `Auth.Token` from the data object
- Any Pict template expression can be used

The data object varies by context:

| Context | Data Source |
|---------|-------------|
| `AuthenticationURITemplate` | The credentials passed to `authenticate()` |
| `AuthenticationRequestBody` values | The credentials passed to `authenticate()` |
| `CheckSessionURITemplate` | The stored `Credentials` on the session |
| `HeaderValueTemplate` | The `SessionData` on the session (after authentication) |

## Example Configurations

### Token-Based REST API (Header)

```javascript
{
	Type: 'Header',
	AuthenticationMethod: 'get',
	AuthenticationURITemplate: '/api/v1/auth/{~D:Record.ApiKey~}',
	CheckSessionURITemplate: '/api/v1/session',
	CheckSessionLoginMarkerType: 'boolean',
	CheckSessionLoginMarker: 'Active',
	HeaderName: 'Authorization',
	HeaderValueTemplate: 'Bearer {~D:Record.Token~}',
	DomainMatch: 'api.example.com',
	AuthenticationRetryCount: 3,
	AuthenticationRetryDebounce: 500
}
```

### POST Login with Cookies

```javascript
{
	Type: 'Cookie',
	AuthenticationMethod: 'post',
	AuthenticationURITemplate: '/login',
	AuthenticationRequestBody:
		{
			username: '{~D:Record.UserName~}',
			password: '{~D:Record.Password~}',
			remember: true
		},
	CheckSessionURITemplate: '/session/check',
	CheckSessionLoginMarkerType: 'existence',
	CheckSessionLoginMarker: 'SessionToken',
	CookieName: 'session_id',
	CookieValueAddress: 'SessionID',
	DomainMatch: 'webapp.example.com'
}
```

### Hybrid (Headers and Cookies)

```javascript
{
	Type: 'Both',
	AuthenticationMethod: 'post',
	AuthenticationURITemplate: '/auth/login',
	AuthenticationRequestBody:
		{
			email: '{~D:Record.Email~}',
			password: '{~D:Record.Password~}'
		},
	CheckSessionURITemplate: '/auth/verify',
	CheckSessionLoginMarkerType: 'boolean',
	CheckSessionLoginMarker: 'Verified',
	HeaderName: 'x-api-token',
	HeaderValueTemplate: '{~D:Record.APIToken~}',
	CookieName: 'refresh_token',
	CookieValueAddress: 'RefreshToken',
	DomainMatch: 'secure.example.com'
}
```

### Expression-Based Session Check

```javascript
{
	Type: 'Header',
	AuthenticationURITemplate: '/auth/{~D:Record.Key~}',
	CheckSessionURITemplate: '/session/status',
	CheckSessionLoginMarkerType: 'solver',
	CheckSessionLoginMarker: 'RemainingCredits + 1',
	CheckSessionDebounce: 10000,
	HeaderName: 'x-api-key',
	HeaderValueTemplate: '{~D:Record.Token~}',
	DomainMatch: 'credits-api.example.com'
}
```
