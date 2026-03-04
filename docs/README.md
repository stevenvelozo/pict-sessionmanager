# Pict Session Manager

> Authenticated REST session management for the Pict ecosystem

Pict Session Manager handles authenticated REST requests across multiple security contexts. It manages session lifecycle — authentication, session checking, credential injection — and automatically wires session headers and cookies into outgoing REST client requests based on domain matching.

Built on Pict's template engine for URI and body template resolution, Manyfest for dot-notation address resolution, and the expression parser for solver-based session checks.

## Features

- **Multi-Session Management** - Maintain multiple named sessions with independent authentication state, credentials, and configuration
- **Automatic Credential Injection** - Headers and cookies are injected into outgoing REST requests by matching the request URL against configured domain patterns
- **Template-Driven Configuration** - URI templates, header value templates, and POST body templates use Pict's `{~D:Record.Key~}` syntax
- **Flexible Session Checks** - Verify session validity using boolean markers, existence checks, or expression-based solves via the Pict ExpressionParser
- **Authentication Retry** - Configurable retry count and debounce interval for failed authentication attempts
- **GET and POST Authentication** - Support for both GET-based (credentials in URL) and POST-based (credentials in request body) authentication flows
- **Header and Cookie Injection** - Inject credentials as HTTP headers, cookies, or both
- **REST Client Integration** - Connect to a Fable RestClient and transparently inject credentials on every request
- **Overridable Hooks** - Customize session check processing, authentication response handling, and credential injection by overriding methods in a subclass

## Quick Start

```bash
npm install pict-sessionmanager
```

### Basic Usage

```javascript
const libPict = require('pict');
const libPictSessionManager = require('pict-sessionmanager');

// Create a Pict instance and register SessionManager
let tmpPict = new libPict();
tmpPict.serviceManager.addServiceType('SessionManager', libPictSessionManager);
tmpPict.serviceManager.instantiateServiceProvider('SessionManager');

// Add a session with header-based authentication
tmpPict.SessionManager.addSession('MyAPI',
	{
		Type: 'Header',
		AuthenticationURITemplate: '/api/login/{~D:Record.UserName~}/{~D:Record.Password~}',
		CheckSessionURITemplate: '/api/session/check',
		CheckSessionLoginMarkerType: 'boolean',
		CheckSessionLoginMarker: 'LoggedIn',
		HeaderName: 'Authorization',
		HeaderValueTemplate: 'Bearer {~D:Record.Token~}',
		DomainMatch: 'api.example.com'
	});

// Authenticate
tmpPict.SessionManager.authenticate('MyAPI',
	{ UserName: 'alice', Password: 'secret' },
	(pError, pSessionState) =>
	{
		if (pError) return console.error('Auth failed:', pError.message);
		console.log('Authenticated!', pSessionState.Authenticated);
	});
```

### Automatic Credential Injection

Once authenticated, connect the session manager to the REST client so credentials are injected automatically:

```javascript
// Wire session manager into the REST client
tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);

// All subsequent requests to matching domains get session headers injected
tmpPict.RestClient.getJSON({ url: 'https://api.example.com/data' },
	(pError, pResponse, pData) =>
	{
		// The Authorization header was automatically added
		console.log('Data:', pData);
	});
```

## Installation

```bash
npm install pict-sessionmanager
```

**Runtime dependency:**

- `fable-serviceproviderbase` (^3.0.x)

**Peer dependency:**

- `pict` (^1.0.x) — provides the template engine, Manyfest, ExpressionParser, and RestClient

## Session Types

Pict Session Manager supports three credential injection types:

| Type | Injects | Use Case |
|------|---------|----------|
| `Header` | HTTP headers (e.g. `Authorization`, `x-session-token`) | Token-based REST APIs |
| `Cookie` | HTTP cookies on the request | Cookie-based web applications |
| `Both` | Both headers and cookies | Hybrid authentication systems |

## Session Check Marker Types

When checking if a session is still valid, the response can be evaluated in three ways:

| Marker Type | Description | Example |
|-------------|-------------|---------|
| `boolean` | Resolve an address in the response and check truthiness | `CheckSessionLoginMarker: 'LoggedIn'` |
| `existence` | Check that the resolved value is not `undefined` or `null` | `CheckSessionLoginMarker: 'SessionToken'` |
| `solver` | Evaluate a Pict ExpressionParser expression against the response | `CheckSessionLoginMarker: 'ActiveUsers + 1'` |

## Documentation

- [Architecture](architecture.md) - System design and data flow
- [Session Configuration](api/configuration.md) - Complete configuration reference
- [API Reference](api/README.md) - All public methods with examples

## Related Packages

- [pict](https://github.com/stevenvelozo/pict) - MVC application framework
- [fable](https://github.com/stevenvelozo/fable) - Service dependency injection framework
- [fable-serviceproviderbase](https://github.com/stevenvelozo/fable-serviceproviderbase) - Service provider base class
- [pict-provider](https://github.com/stevenvelozo/pict-provider) - Pict data provider base class
