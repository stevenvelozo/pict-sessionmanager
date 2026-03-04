# REST Client Connection

Methods for wiring the session manager into a Fable REST client so that credentials are injected automatically on every outgoing request.

## connectToRestClient(pRestClient)

Connect this session manager to a Fable RestClient instance. Wraps the RestClient's `prepareRequestOptions` method so that every outgoing request passes through `prepareRequestOptionsAuto()`, which matches the request URL against session domain patterns and injects the appropriate credentials.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pRestClient` | `object` | No | A Fable RestClient instance. If not provided, uses `this.pict.RestClient`. |

**Returns:** `undefined`

**Behavior:**

1. If no RestClient is provided, instantiates the default one from the Pict instance
2. Stores a reference to the original `prepareRequestOptions` function
3. Replaces `prepareRequestOptions` with a wrapper that calls the original first, then passes the result through `prepareRequestOptionsAuto()`
4. Stores references for later disconnection

**Example — Connect to Default RestClient:**

```javascript
const libPict = require('pict');
const libPictSessionManager = require('pict-sessionmanager');

let tmpPict = new libPict();
tmpPict.serviceManager.addServiceType('SessionManager', libPictSessionManager);
tmpPict.serviceManager.instantiateServiceProvider('SessionManager');
tmpPict.serviceManager.instantiateServiceProvider('RestClient');

// Add and authenticate a session
tmpPict.SessionManager.addSession('MyAPI',
	{
		Type: 'Header',
		AuthenticationURITemplate: '/auth/{~D:Record.Key~}',
		HeaderName: 'Authorization',
		HeaderValueTemplate: 'Bearer {~D:Record.Token~}',
		DomainMatch: 'api.example.com'
	});

tmpPict.SessionManager.authenticate('MyAPI', { Key: 'my-key' },
	(pError) =>
	{
		// Connect — all future requests get credentials injected
		tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);

		// This request automatically gets the Authorization header
		tmpPict.RestClient.getJSON(
			{ url: 'https://api.example.com/users' },
			(pErr, pResponse, pData) =>
			{
				console.log('Data:', pData);
			});
	});
```

**Example — Connect Without Argument:**

```javascript
// If no argument is passed, uses pict.RestClient
tmpPict.SessionManager.connectToRestClient();

// Equivalent to:
tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);
```

---

## disconnectRestClient(pRestClient)

Disconnect this session manager from a previously connected RestClient. Restores the original `prepareRequestOptions` function so that credentials are no longer injected.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pRestClient` | `object` | No | The RestClient to disconnect. If not provided, disconnects the previously connected RestClient. |

**Returns:** `boolean` — `true` if successfully disconnected, `false` if no connected RestClient was found.

**Example:**

```javascript
// Connect
tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);

// ... use the REST client with auto-injection ...

// Disconnect — restores original behavior
let tmpResult = tmpPict.SessionManager.disconnectRestClient();
console.log(tmpResult); // true

// Now requests no longer get session credentials injected
tmpPict.RestClient.getJSON(
	{ url: 'https://api.example.com/users' },
	(pErr, pResponse, pData) =>
	{
		// No Authorization header was added
	});
```

**Example — Disconnect Specific RestClient:**

```javascript
tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);

// Pass the same RestClient to disconnect
tmpPict.SessionManager.disconnectRestClient(tmpPict.RestClient);
```

**Example — Disconnect When Not Connected:**

```javascript
// Returns false if nothing was connected
let tmpResult = tmpPict.SessionManager.disconnectRestClient();
console.log(tmpResult); // false
```
