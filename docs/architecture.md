# Architecture

Pict Session Manager is a Fable service provider that manages authenticated REST sessions. It sits between your application code and the Fable REST client, intercepting outgoing requests and injecting the appropriate session credentials.

## System Overview

```mermaid
graph TB
	subgraph Application
		App[Application Code]
	end

	subgraph PictSessionManager["Pict Session Manager"]
		SM[SessionManager Service]
		Sessions[(Session Store)]
		TH[Template Helpers]
	end

	subgraph PictServices["Pict Services"]
		TE[Template Engine]
		MF[Manyfest]
		EP[ExpressionParser]
		RC[RestClient]
	end

	subgraph External["External APIs"]
		API1[API Server A]
		API2[API Server B]
	end

	App -->|addSession / authenticate| SM
	SM -->|session state| Sessions
	SM -->|parseTemplate| TE
	SM -->|getValueByHash| MF
	SM -->|solve| EP
	SM -->|connectToRestClient| RC
	SM -->|URI / body resolution| TH
	TH -->|delegates to| TE
	TH -->|delegates to| MF
	RC -->|auto-inject credentials| SM
	RC -->|HTTP requests| API1
	RC -->|HTTP requests| API2
```

## Data Flow

### Authentication Flow

When `authenticate()` is called, the session manager resolves the authentication URI template, makes the authentication request, and extracts session credentials from the response.

```mermaid
sequenceDiagram
	participant App as Application
	participant SM as SessionManager
	participant TE as Template Engine
	participant RC as RestClient
	participant API as API Server

	App->>SM: authenticate('MyAPI', credentials)
	SM->>SM: Store credentials on session
	SM->>TE: parseTemplate(AuthenticationURITemplate, credentials)
	TE-->>SM: Resolved URI
	SM->>RC: getJSON or postJSON
	RC->>API: HTTP request
	API-->>RC: Response with token/session data
	RC-->>SM: Response data
	SM->>SM: onAuthenticate() - extract headers/cookies
	SM->>SM: Mark session as Authenticated
	SM-->>App: Callback(null, sessionState)
```

### Credential Injection Flow

When connected to a RestClient, every outgoing request passes through the session manager. The URL is matched against configured domain patterns, and matching session credentials are injected.

```mermaid
sequenceDiagram
	participant App as Application
	participant RC as RestClient
	participant SM as SessionManager
	participant API as API Server

	App->>RC: getJSON({ url: 'https://api.example.com/data' })
	RC->>SM: prepareRequestOptionsAuto(options)
	SM->>SM: Match URL against session DomainMatch values
	SM->>SM: Inject headers and/or cookies
	SM-->>RC: Modified options with credentials
	RC->>API: HTTP request with injected credentials
	API-->>RC: Response
	RC-->>App: Callback(null, response, data)
```

### Session Check Flow

Session checks verify that an existing session is still valid by making a configured request and evaluating the response.

```mermaid
sequenceDiagram
	participant App as Application
	participant SM as SessionManager
	participant RC as RestClient
	participant API as API Server

	App->>SM: checkSession('MyAPI')
	SM->>SM: Check debounce timer
	SM->>RC: getJSON or postJSON (CheckSessionURI)
	RC->>API: HTTP request
	API-->>RC: Response data
	RC-->>SM: Response data
	SM->>SM: onCheckSession() - evaluate marker
	alt boolean marker
		SM->>SM: Resolve address, check truthiness
	else existence marker
		SM->>SM: Resolve address, check not null/undefined
	else solver marker
		SM->>SM: ExpressionParser.solve(expression, data)
	end
	SM-->>App: Callback(null, isAuthenticated, sessionData)
```

## Service Provider Pattern

Pict Session Manager extends `fable-serviceproviderbase`, which means it registers with a Fable/Pict instance through dependency injection. This gives it access to:

| Service | Usage |
|---------|-------|
| `this.pict` (alias for `this.fable`) | The Pict instance that owns this service |
| `this.pict.parseTemplate()` | Resolves `{~D:Record.Key~}` template expressions |
| `this.pict.manifest.getValueByHash()` | Traverses objects using dot-notation addresses |
| `this.pict.ExpressionParser.solve()` | Evaluates arithmetic expressions against data |
| `this.pict.RestClient` | Makes HTTP requests (GET, POST with JSON) |
| `this.log` | Structured logging via the Fable log service |

## Session State Object

Each named session maintains a state object with the following structure:

```javascript
{
	Name: 'MyAPI',                   // Session name
	Configuration: { ... },          // Merged configuration (defaults + user config)
	Authenticated: false,            // Whether the session is currently authenticated
	SessionData: {},                 // Data returned from authentication or session check
	Cookies: {},                     // Cookie name-value pairs for injection
	Headers: {},                     // Header name-value pairs for injection
	AuthenticateInProgress: false,   // Guard against concurrent authentication
	LastCheckTime: 0                 // Timestamp of last session check (for debounce)
}
```

## Extensibility

The session manager provides several overridable methods for customization:

| Method | Purpose |
|--------|---------|
| `onCheckSession(pSessionState, pResponse, pData)` | Custom logic for evaluating session check responses |
| `onAuthenticate(pSessionState, pResponse, pData)` | Custom logic for extracting credentials from authentication responses |
| `onPrepareHeaders(pSessionState, pOptions)` | Custom header injection logic |
| `onPrepareCookies(pSessionState, pOptions)` | Custom cookie injection logic |

To customize, extend `PictSessionManager` and override the methods:

```javascript
const libPictSessionManager = require('pict-sessionmanager');

class MySessionManager extends libPictSessionManager
{
	onAuthenticate(pSessionState, pResponse, pData)
	{
		// Call default behavior
		super.onAuthenticate(pSessionState, pResponse, pData);

		// Add custom post-auth logic
		if (pData && pData.RefreshToken)
		{
			pSessionState.SessionData.RefreshToken = pData.RefreshToken;
		}
	}
}
```
