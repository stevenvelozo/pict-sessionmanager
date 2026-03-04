/**
 * CustomAuth Example - Mock Server
 *
 * A simple HTTP server that mimics an API with header-based
 * authentication. Useful for testing the SessionManager module.
 *
 * Endpoints:
 *   GET  /1.0/Authenticate/:LoginID/:LoginPassword  - Authenticate and get a token
 *   GET  /1.0/CheckSession                           - Check if session is valid (requires x-session-token header)
 *   GET  /1.0/Books                                  - Protected resource (requires x-session-token header)
 *
 * Usage: node CustomAuth-Server.js
 *
 * @author Steven Velozo <steven@velozo.com>
 */

const libHTTP = require('http');

const _Port = 8891;

let _Sessions = {};
let _NextToken = 1000;

// Sample data
let _Books = [
	{ IDBook: 1, Title: 'The Left Hand of Darkness', Author: 'Ursula K. Le Guin' },
	{ IDBook: 2, Title: 'Neuromancer', Author: 'William Gibson' },
	{ IDBook: 3, Title: 'Dune', Author: 'Frank Herbert' }
];

function sendJSON(pResponse, pStatusCode, pData)
{
	pResponse.writeHead(pStatusCode, { 'Content-Type': 'application/json' });
	pResponse.end(JSON.stringify(pData));
}

function getSessionFromHeader(pRequest)
{
	let tmpToken = pRequest.headers['x-session-token'];
	if (tmpToken && _Sessions[tmpToken])
	{
		return _Sessions[tmpToken];
	}
	return false;
}

let tmpServer = libHTTP.createServer(
	(pRequest, pResponse) =>
	{
		let tmpURL = pRequest.url;
		let tmpMethod = pRequest.method;

		console.log(`${tmpMethod} ${tmpURL}`);

		// GET /1.0/Authenticate/:LoginID/:LoginPassword
		let tmpAuthMatch = tmpURL.match(/^\/1\.0\/Authenticate\/([^/]+)\/([^/]+)/);
		if (tmpAuthMatch && tmpMethod === 'GET')
		{
			let tmpLoginID = decodeURIComponent(tmpAuthMatch[1]);
			let tmpLoginPassword = decodeURIComponent(tmpAuthMatch[2]);

			// Accept any non-empty credentials for the example
			if (tmpLoginID && tmpLoginPassword && tmpLoginPassword.length >= 3)
			{
				let tmpToken = `CA-TOKEN-${_NextToken++}`;
				_Sessions[tmpToken] = { UserID: _NextToken, LoginID: tmpLoginID, CreatedAt: new Date().toISOString() };

				console.log(`  -> Authenticated [${tmpLoginID}] with token [${tmpToken}]`);
				return sendJSON(pResponse, 200, { Token: tmpToken, UserID: _NextToken, LoggedIn: true });
			}
			else
			{
				console.log(`  -> Authentication failed for [${tmpLoginID}]`);
				return sendJSON(pResponse, 401, { Error: 'Invalid credentials', LoggedIn: false });
			}
		}

		// GET /1.0/CheckSession
		if (tmpURL === '/1.0/CheckSession' && tmpMethod === 'GET')
		{
			let tmpSession = getSessionFromHeader(pRequest);
			if (tmpSession)
			{
				console.log(`  -> Session valid for [${tmpSession.LoginID}]`);
				return sendJSON(pResponse, 200, { Record: { LoggedIn: true, UserID: tmpSession.UserID, LoginID: tmpSession.LoginID } });
			}
			else
			{
				console.log(`  -> No valid session`);
				return sendJSON(pResponse, 200, { Record: { LoggedIn: false } });
			}
		}

		// GET /1.0/Books
		if (tmpURL === '/1.0/Books' && tmpMethod === 'GET')
		{
			let tmpSession = getSessionFromHeader(pRequest);
			if (tmpSession)
			{
				console.log(`  -> Returning books for [${tmpSession.LoginID}]`);
				return sendJSON(pResponse, 200, _Books);
			}
			else
			{
				return sendJSON(pResponse, 403, { Error: 'Not authenticated. Please provide x-session-token header.' });
			}
		}

		// Default
		return sendJSON(pResponse, 404, { Error: 'Not found' });
	});

tmpServer.listen(_Port,
	() =>
	{
		console.log(`CustomAuth Mock Server listening on http://127.0.0.1:${_Port}`);
		console.log(`  Authenticate: GET http://127.0.0.1:${_Port}/1.0/Authenticate/{LoginID}/{LoginPassword}`);
		console.log(`  Check Session: GET http://127.0.0.1:${_Port}/1.0/CheckSession  (header: x-session-token)`);
		console.log(`  Books: GET http://127.0.0.1:${_Port}/1.0/Books  (header: x-session-token)`);
	});
