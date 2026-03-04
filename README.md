# Pict Session Manager

Authenticated REST session management for the Pict ecosystem. Manages multiple named sessions with automatic credential injection, configurable authentication flows, and domain-based request matching. Built on Pict's template engine, Manyfest address resolution, and the expression parser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Features

- **Multi-Session Management** - Maintain any number of named sessions with independent authentication state, credentials, and configuration
- **Automatic Credential Injection** - Headers and cookies are injected into outgoing REST requests by matching the request URL against configured domain patterns
- **Template-Driven Configuration** - URI templates, header value templates, and POST body templates use Pict's `{~D:Record.Key~}` syntax for dynamic resolution
- **Flexible Session Checks** - Verify session validity with boolean markers, existence checks, or expression-based solves via the Pict ExpressionParser
- **Authentication Retry** - Configurable retry count and debounce interval for failed authentication attempts
- **GET and POST Authentication** - Support for GET-based (credentials in URL) and POST-based (credentials in request body) authentication flows
- **Header and Cookie Injection** - Inject credentials as HTTP headers, cookies, or both
- **REST Client Integration** - Connect to a Fable RestClient and transparently inject credentials on every request
- **Overridable Hooks** - Customize session check processing, authentication response handling, and credential injection by subclassing

## Documentation

Comprehensive documentation is available in the [docs](./docs) folder:

- [Overview](./docs/README.md) - Introduction and getting started
- [Architecture](./docs/architecture.md) - System design, data flow, and mermaid diagrams
- [Configuration Reference](./docs/api/configuration.md) - All session configuration options
- [API Reference](./docs/api/README.md) - Complete method documentation with examples

## Installation

```bash
npm install pict-sessionmanager
```

## Quick Start

```javascript
const libPict = require('pict');
const libPictSessionManager = require('pict-sessionmanager');

// Create a Pict instance and register the SessionManager service
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
		console.log('Authenticated:', pSessionState.Authenticated);
	});
```

### Automatic Credential Injection

Connect the session manager to the REST client so credentials are injected automatically on every matching request:

```javascript
// Wire session manager into the REST client
tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);

// All requests to matching domains get session credentials injected
tmpPict.RestClient.getJSON({ url: 'https://api.example.com/data' },
	(pError, pResponse, pData) =>
	{
		// The Authorization header was automatically added
		console.log('Data:', pData);
	});

// Disconnect when done
tmpPict.SessionManager.disconnectRestClient();
```

## Session Types

| Type | Injects | Use Case |
|------|---------|----------|
| `Header` | HTTP headers (e.g. `Authorization`) | Token-based REST APIs |
| `Cookie` | HTTP cookies on the request | Cookie-based web applications |
| `Both` | Headers and cookies | Hybrid authentication systems |

## Session Check Markers

| Marker Type | Description |
|-------------|-------------|
| `boolean` | Resolve an address in the response and check truthiness |
| `existence` | Check that the resolved value is not `undefined` or `null` |
| `solver` | Evaluate a Pict ExpressionParser expression against the response |

## Configuration

Sessions are configured with a plain object passed to `addSession()`. All options have sensible defaults:

```javascript
tmpPict.SessionManager.addSession('MyAPI',
	{
		Type: 'Header',                    // 'Header', 'Cookie', 'Both'
		AuthenticationMethod: 'post',      // 'get' or 'post'
		AuthenticationURITemplate: '/login',
		AuthenticationRequestBody:
			{
				username: '{~D:Record.UserName~}',
				password: '{~D:Record.Password~}'
			},
		CheckSessionURITemplate: '/session/check',
		CheckSessionDebounce: 5000,        // ms between checks
		AuthenticationRetryCount: 3,
		AuthenticationRetryDebounce: 500,
		HeaderName: 'Authorization',
		HeaderValueTemplate: 'Bearer {~D:Record.Token~}',
		DomainMatch: 'api.example.com'
	});
```

See the [Configuration Reference](./docs/api/configuration.md) for all options.

## Testing

```bash
npm test
```

```bash
npm run coverage
```

## Part of the Retold Framework

Pict Session Manager is a service provider in the Pict ecosystem:

- [pict](https://github.com/stevenvelozo/pict) - MVC application framework
- [pict-view](https://github.com/stevenvelozo/pict-view) - View base class
- [pict-provider](https://github.com/stevenvelozo/pict-provider) - Data provider base class
- [fable](https://github.com/stevenvelozo/fable) - Service dependency injection framework
- [fable-serviceproviderbase](https://github.com/stevenvelozo/fable-serviceproviderbase) - Service provider base class

## Related Packages

- [pict](https://github.com/stevenvelozo/pict) - MVC application framework
- [fable](https://github.com/stevenvelozo/fable) - Application services framework
- [fable-serviceproviderbase](https://github.com/stevenvelozo/fable-serviceproviderbase) - Service provider base class

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/stevenvelozo/retold/blob/main/docs/contributing.md).
