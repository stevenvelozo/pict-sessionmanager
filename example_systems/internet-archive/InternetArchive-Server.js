/**
 * Internet Archive Example - Mock Server with Proxy
 *
 * A simple HTTP server that mimics an Internet Archive-style API with
 * cookie-based authentication. Includes a basic proxy endpoint for
 * demonstrating CORS-friendly access to archive.org.
 *
 * Endpoints:
 *   POST /login                 - Authenticate and receive a session cookie
 *   GET  /check                 - Check session validity (requires session_id cookie)
 *   GET  /search?q=:query       - Search items (requires session_id cookie)
 *   GET  /proxy?url=:encodedURL - Proxy GET requests to archive.org (for CORS)
 *
 * Usage: node InternetArchive-Server.js
 *
 * @author Steven Velozo <steven@velozo.com>
 */

const libHTTP = require('http');
const libHTTPS = require('https');
const libURL = require('url');

const _Port = 8892;

let _Sessions = {};
let _NextSession = 2000;

// Sample search results
let _SampleResults = [
	{ Identifier: 'nasa_apollo_11', Title: 'Apollo 11 Footage', MediaType: 'movies', Year: 1969 },
	{ Identifier: 'grateful_dead_1977', Title: 'Grateful Dead Live 1977-05-08', MediaType: 'audio', Year: 1977 },
	{ Identifier: 'principia_math', Title: 'Principia Mathematica', MediaType: 'texts', Year: 1687 }
];

function sendJSON(pResponse, pStatusCode, pData, pExtraHeaders)
{
	let tmpHeaders = Object.assign({ 'Content-Type': 'application/json' }, pExtraHeaders || {});
	pResponse.writeHead(pStatusCode, tmpHeaders);
	pResponse.end(JSON.stringify(pData));
}

function parseCookies(pRequest)
{
	let tmpCookies = {};
	let tmpCookieHeader = pRequest.headers.cookie || '';
	tmpCookieHeader.split(';').forEach(
		(pPair) =>
		{
			let tmpParts = pPair.trim().split('=');
			if (tmpParts.length === 2)
			{
				tmpCookies[tmpParts[0]] = tmpParts[1];
			}
		});
	return tmpCookies;
}

function getSessionFromCookie(pRequest)
{
	let tmpCookies = parseCookies(pRequest);
	if (tmpCookies.session_id && _Sessions[tmpCookies.session_id])
	{
		return _Sessions[tmpCookies.session_id];
	}
	return false;
}

let tmpServer = libHTTP.createServer(
	(pRequest, pResponse) =>
	{
		let tmpParsedURL = libURL.parse(pRequest.url, true);
		let tmpPath = tmpParsedURL.pathname;
		let tmpMethod = pRequest.method;

		console.log(`${tmpMethod} ${tmpPath}`);

		// POST /login
		if (tmpPath === '/login' && tmpMethod === 'POST')
		{
			let tmpBody = '';
			pRequest.on('data', (pChunk) => { tmpBody += pChunk; });
			pRequest.on('end', () =>
			{
				let tmpParsedBody = {};
				try { tmpParsedBody = JSON.parse(tmpBody); } catch(e) { /* ignore */ }

				if (tmpParsedBody.UserName && tmpParsedBody.Password && tmpParsedBody.Password.length >= 3)
				{
					let tmpSessionID = `IA-SID-${_NextSession++}`;
					_Sessions[tmpSessionID] = { UserID: _NextSession, LoginID: tmpParsedBody.UserName, CreatedAt: new Date().toISOString() };

					console.log(`  -> Authenticated [${tmpParsedBody.UserName}] with session [${tmpSessionID}]`);
					return sendJSON(pResponse, 200,
						{ Success: true, SessionID: tmpSessionID },
						{ 'Set-Cookie': `session_id=${tmpSessionID}; Path=/; HttpOnly` });
				}
				else
				{
					console.log(`  -> Login failed`);
					return sendJSON(pResponse, 401, { Error: 'Invalid credentials' });
				}
			});
			return;
		}

		// GET /check
		if (tmpPath === '/check' && tmpMethod === 'GET')
		{
			let tmpSession = getSessionFromCookie(pRequest);
			if (tmpSession)
			{
				console.log(`  -> Session valid for [${tmpSession.LoginID}]`);
				return sendJSON(pResponse, 200, { Authenticated: true, UserID: tmpSession.UserID, LoginID: tmpSession.LoginID });
			}
			else
			{
				console.log(`  -> No valid session`);
				return sendJSON(pResponse, 200, { Authenticated: false });
			}
		}

		// GET /search?q=:query
		if (tmpPath === '/search' && tmpMethod === 'GET')
		{
			let tmpSession = getSessionFromCookie(pRequest);
			if (!tmpSession)
			{
				return sendJSON(pResponse, 403, { Error: 'Not authenticated. Please provide session_id cookie.' });
			}

			let tmpQuery = (tmpParsedURL.query.q || '').toLowerCase();
			let tmpResults = _SampleResults.filter(
				(pItem) =>
				{
					return pItem.Title.toLowerCase().indexOf(tmpQuery) >= 0 ||
						pItem.Identifier.toLowerCase().indexOf(tmpQuery) >= 0;
				});

			console.log(`  -> Search [${tmpQuery}] returned ${tmpResults.length} result(s)`);
			return sendJSON(pResponse, 200, { Response: { NumFound: tmpResults.length, Docs: tmpResults } });
		}

		// GET /proxy?url=:encodedURL  -  Simple proxy for CORS
		if (tmpPath === '/proxy' && tmpMethod === 'GET')
		{
			let tmpTargetURL = tmpParsedURL.query.url;
			if (!tmpTargetURL)
			{
				return sendJSON(pResponse, 400, { Error: 'No url query parameter provided.' });
			}

			console.log(`  -> Proxying to [${tmpTargetURL}]`);

			let tmpProtocol = tmpTargetURL.startsWith('https') ? libHTTPS : libHTTP;
			tmpProtocol.get(tmpTargetURL,
				(pProxyResponse) =>
				{
					let tmpData = '';
					pProxyResponse.on('data', (pChunk) => { tmpData += pChunk; });
					pProxyResponse.on('end', () =>
					{
						pResponse.writeHead(pProxyResponse.statusCode,
							{
								'Content-Type': pProxyResponse.headers['content-type'] || 'application/octet-stream',
								'Access-Control-Allow-Origin': '*'
							});
						pResponse.end(tmpData);
					});
				}).on('error',
				(pError) =>
				{
					console.log(`  -> Proxy error: ${pError.message}`);
					return sendJSON(pResponse, 502, { Error: `Proxy error: ${pError.message}` });
				});
			return;
		}

		// Default
		return sendJSON(pResponse, 404, { Error: 'Not found' });
	});

tmpServer.listen(_Port,
	() =>
	{
		console.log(`Internet Archive Mock Server listening on http://127.0.0.1:${_Port}`);
		console.log(`  Login: POST http://127.0.0.1:${_Port}/login  body: {"UserName":"...","Password":"..."}`);
		console.log(`  Check: GET http://127.0.0.1:${_Port}/check  (cookie: session_id)`);
		console.log(`  Search: GET http://127.0.0.1:${_Port}/search?q=apollo  (cookie: session_id)`);
		console.log(`  Proxy: GET http://127.0.0.1:${_Port}/proxy?url=https://archive.org/metadata/nasa_apollo_11`);
	});
