# API Reference

Pict Session Manager exposes a service-oriented API organized into six functional areas. The service is registered with a Pict instance and accessed as `pict.SessionManager`.

## Setup

```javascript
const libPict = require('pict');
const libPictSessionManager = require('pict-sessionmanager');

let tmpPict = new libPict();
tmpPict.serviceManager.addServiceType('SessionManager', libPictSessionManager);
tmpPict.serviceManager.instantiateServiceProvider('SessionManager');

// Access the service
let tmpSessionManager = tmpPict.SessionManager;
```

## API Categories

### [Session Management](session-management.md)

Create, retrieve, and remove named sessions.

| Method | Description |
|--------|-------------|
| `addSession(pName, pConfiguration)` | Add a named session with configuration |
| `removeSession(pName)` | Remove a named session |
| `getSession(pName)` | Get a session state object by name |
| `getSessions()` | Get a summary of all sessions |
| `newSessionState(pConfiguration)` | Create a session state object without adding it |
| `deauthenticate(pName)` | Clear all authentication state for a session |

### [Authentication](authentication.md)

Authenticate sessions and process authentication responses.

| Method | Description |
|--------|-------------|
| `authenticate(pName, pCredentials, fCallback)` | Authenticate a named session |
| `onAuthenticate(pSessionState, pResponse, pData)` | Overridable: process authentication response |

### [Session Checking](session-check.md)

Verify that an existing session is still valid.

| Method | Description |
|--------|-------------|
| `checkSession(pName, fCallback)` | Check if a session is currently authenticated |
| `onCheckSession(pSessionState, pResponse, pData)` | Overridable: evaluate session check response |

### [Credential Injection](credential-injection.md)

Inject session credentials into outgoing REST requests.

| Method | Description |
|--------|-------------|
| `prepareRequestOptions(pName, pOptions)` | Inject credentials for a specific session |
| `prepareRequestOptionsAuto(pOptions)` | Auto-detect session by URL and inject credentials |
| `onPrepareHeaders(pSessionState, pOptions)` | Overridable: inject headers |
| `onPrepareCookies(pSessionState, pOptions)` | Overridable: inject cookies |

### [REST Client Connection](rest-client-connection.md)

Wire the session manager into a Fable REST client for automatic credential injection.

| Method | Description |
|--------|-------------|
| `connectToRestClient(pRestClient)` | Connect to a REST client for auto-injection |
| `disconnectRestClient(pRestClient)` | Disconnect and restore original behavior |

### [Template Helpers](template-helpers.md)

Low-level template resolution and address lookup utilities.

| Method | Description |
|--------|-------------|
| `parseTemplateString(pTemplate, pData)` | Resolve a Pict template string |
| `buildRequestBody(pTemplate, pData)` | Build a request body from a template object |
| `resolveAddress(pObject, pAddress)` | Resolve a dot-notation address in an object |
| `detectCookieCapability()` | Detect whether cookie management is available |

### [Configuration Reference](configuration.md)

Complete reference for all session configuration options.
