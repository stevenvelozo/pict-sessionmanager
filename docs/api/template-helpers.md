# Template Helpers

Low-level utility methods for template resolution, request body construction, address lookup, and environment detection. These are used internally by the session manager and are also available for direct use.

## parseTemplateString(pTemplate, pData)

Resolve a Pict template string against a data object. Uses Pict's `{~D:Record.Key~}` template syntax, where the data object is accessible as `Record` in the template context.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pTemplate` | `string` | Yes | Template string with Pict directives |
| `pData` | `object` | Yes | Data object (accessible as `Record` in templates) |

**Returns:** `string` — The resolved template string. Returns empty string if template is falsy or not a string. Returns the template unchanged if data is falsy or not an object.

**Example:**

```javascript
// Basic template resolution
let tmpResult = tmpPict.SessionManager.parseTemplateString(
	'/api/users/{~D:Record.UserID~}/profile',
	{ UserID: 42 });
console.log(tmpResult); // '/api/users/42/profile'
```

```javascript
// Multiple placeholders
let tmpURI = tmpPict.SessionManager.parseTemplateString(
	'/auth/{~D:Record.LoginID~}/{~D:Record.Password~}',
	{ LoginID: 'alice', Password: 'secret' });
console.log(tmpURI); // '/auth/alice/secret'
```

```javascript
// Nested data access
let tmpValue = tmpPict.SessionManager.parseTemplateString(
	'Bearer {~D:Record.Auth.Token~}',
	{ Auth: { Token: 'abc123' } });
console.log(tmpValue); // 'Bearer abc123'
```

```javascript
// Edge cases
let tmpEmpty = tmpPict.SessionManager.parseTemplateString(null, {});
console.log(tmpEmpty); // ''

let tmpNoData = tmpPict.SessionManager.parseTemplateString('Hello {~D:Record.Name~}', null);
console.log(tmpNoData); // 'Hello {~D:Record.Name~}' (returned unchanged)
```

---

## buildRequestBody(pTemplate, pData)

Build a request body object from a template object. Iterates the template's keys — string values are parsed through `parseTemplateString()`, non-string values are copied as-is.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pTemplate` | `object` | Yes | Body template object |
| `pData` | `object` | Yes | Data object for template resolution |

**Returns:** `object` — The resolved body object. Returns empty object if template is falsy. Returns a deep copy of the template if data is falsy.

**Example:**

```javascript
// Build a POST body from a template
let tmpBody = tmpPict.SessionManager.buildRequestBody(
	{
		username: '{~D:Record.LoginID~}',
		password: '{~D:Record.Password~}',
		rememberMe: true
	},
	{ LoginID: 'alice', Password: 'secret' });

console.log(tmpBody);
// { username: 'alice', password: 'secret', rememberMe: true }
```

```javascript
// Non-string values pass through unchanged
let tmpBody = tmpPict.SessionManager.buildRequestBody(
	{
		name: '{~D:Record.Name~}',
		count: 5,
		active: true,
		tags: ['admin', 'user']
	},
	{ Name: 'Bob' });

console.log(tmpBody);
// { name: 'Bob', count: 5, active: true, tags: ['admin', 'user'] }
```

```javascript
// Null template returns empty object
let tmpEmpty = tmpPict.SessionManager.buildRequestBody(null, {});
console.log(tmpEmpty); // {}

// Null data returns a copy of the template
let tmpCopy = tmpPict.SessionManager.buildRequestBody(
	{ key: 'value' }, null);
console.log(tmpCopy); // { key: 'value' }
```

---

## resolveAddress(pObject, pAddress)

Resolve a dot-notation address in an object using Manyfest's `getValueByHash()`. This is the same address resolution used throughout the Pict and Fable ecosystems.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pObject` | `object` | Yes | The object to traverse |
| `pAddress` | `string` | Yes | Dot-notation address (e.g. `'User.Profile.Name'`) |

**Returns:** `*` — The resolved value, or `undefined` if not found or if parameters are falsy.

**Example:**

```javascript
let tmpData =
	{
		User:
			{
				Profile: { Name: 'Alice', Email: 'alice@example.com' },
				Settings: { Theme: 'dark' }
			}
	};

let tmpName = tmpPict.SessionManager.resolveAddress(tmpData, 'User.Profile.Name');
console.log(tmpName); // 'Alice'

let tmpTheme = tmpPict.SessionManager.resolveAddress(tmpData, 'User.Settings.Theme');
console.log(tmpTheme); // 'dark'

let tmpMissing = tmpPict.SessionManager.resolveAddress(tmpData, 'User.DoesNotExist');
console.log(tmpMissing); // undefined
```

```javascript
// Null parameters return undefined
let tmpResult = tmpPict.SessionManager.resolveAddress(null, 'Key');
console.log(tmpResult); // undefined

let tmpResult2 = tmpPict.SessionManager.resolveAddress({}, null);
console.log(tmpResult2); // undefined
```

---

## detectCookieCapability()

Detect whether the current environment supports cookie management. In Node.js environments, `cookieCapability` is set to `true`. In browser environments (where `window` is defined), it is set to `false`.

**Returns:** `boolean` — The cookie capability status.

**Example:**

```javascript
// In Node.js
let tmpCapable = tmpPict.SessionManager.detectCookieCapability();
console.log(tmpCapable); // true
console.log(tmpPict.SessionManager.cookieCapability); // true

// The property is also set during construction
console.log(tmpPict.SessionManager.cookieCapability); // true (in Node.js)
```

This is called automatically during construction. You typically do not need to call it directly unless you are testing or simulating different environments.
