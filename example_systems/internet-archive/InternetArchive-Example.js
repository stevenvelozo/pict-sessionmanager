/**
 * Internet Archive Example - Client
 *
 * Demonstrates using pict-sessionmanager to authenticate with a
 * cookie-based API (Internet Archive style) and access protected resources.
 *
 * Prerequisites:
 *   1. Start the mock server: node InternetArchive-Server.js
 *   2. Run this example: node InternetArchive-Example.js
 *
 * @author Steven Velozo <steven@velozo.com>
 */

const libPict = require('pict');
const libPictSessionManager = require('../../source/Pict-SessionManager.js');

const _ServerURL = 'http://127.0.0.1:8892';

// Create a Pict instance
let tmpPict = new libPict({ LogLevel: 5 });

// Register and instantiate the SessionManager
tmpPict.serviceManager.addServiceType('SessionManager', libPictSessionManager);
tmpPict.serviceManager.instantiateServiceProvider('SessionManager');

// Add a session definition for the Internet Archive API
tmpPict.SessionManager.addSession('InternetArchive',
	{
		Type: 'Cookie',

		// How to check if we're logged in
		CheckSessionURITemplate: `${_ServerURL}/check`,
		CheckSessionLoginMarkerType: 'boolean',
		CheckSessionLoginMarker: 'Authenticated',

		// How to authenticate (POST with body)
		AuthenticationMethod: 'post',
		AuthenticationURITemplate: `${_ServerURL}/login`,
		AuthenticationRequestBody: { UserName: '{~D:Record.LoginID~}', Password: '{~D:Record.LoginPassword~}' },
		AuthenticationRetryCount: 1,
		AuthenticationRetryDebounce: 500,

		// How to inject credentials
		DomainMatch: '127.0.0.1',
		CookieName: 'session_id',
		CookieValueAddress: 'SessionID'
	});

// Wire the session manager into the REST client
tmpPict.SessionManager.connectToRestClient();

console.log('--- Internet Archive Session Manager Example ---\n');
console.log(`Cookie capability: ${tmpPict.SessionManager.cookieCapability}\n`);

// Step 1: Check session before auth
console.log('Step 1: Checking session before authentication...');
tmpPict.SessionManager.checkSession('InternetArchive',
	(pCheckError, pAuthenticated, pCheckData) =>
	{
		console.log(`  Authenticated: ${pAuthenticated}`);
		console.log(`  Data: ${JSON.stringify(pCheckData)}\n`);

		// Step 2: Authenticate
		console.log('Step 2: Authenticating with Internet Archive...');
		tmpPict.SessionManager.authenticate('InternetArchive', { LoginID: 'archivist', LoginPassword: 'archive123' },
			(pAuthError, pSessionState) =>
			{
				if (pAuthError)
				{
					console.error(`  Authentication failed: ${pAuthError.message}`);
					return;
				}

				console.log(`  Authenticated: ${pSessionState.Authenticated}`);
				console.log(`  Session Cookie: ${JSON.stringify(pSessionState.Cookies)}\n`);

				// Step 3: Check session after auth
				console.log('Step 3: Checking session after authentication...');
				tmpPict.SessionManager.checkSession('InternetArchive',
					(pCheck2Error, pAuth2, pCheck2Data) =>
					{
						console.log(`  Authenticated: ${pAuth2}`);
						console.log(`  Data: ${JSON.stringify(pCheck2Data)}\n`);

						// Step 4: Search (cookies auto-injected)
						console.log('Step 4: Searching for "apollo" (cookies auto-injected)...');
						tmpPict.RestClient.getJSON(`${_ServerURL}/search?q=apollo`,
							(pSearchError, pSearchResponse, pSearchData) =>
							{
								console.log(`  Response: ${pSearchResponse.statusCode}`);
								console.log(`  Results: ${JSON.stringify(pSearchData, null, 2)}\n`);

								// Step 5: Deauthenticate
								console.log('Step 5: Deauthenticating...');
								tmpPict.SessionManager.deauthenticate('InternetArchive');
								let tmpSession = tmpPict.SessionManager.getSession('InternetArchive');
								console.log(`  Authenticated: ${tmpSession.Authenticated}`);
								console.log(`  Cookies: ${JSON.stringify(tmpSession.Cookies)}\n`);

								// Step 6: Try searching after deauth
								console.log('Step 6: Trying search after deauth...');
								tmpPict.RestClient.getJSON(`${_ServerURL}/search?q=dead`,
									(pFinalError, pFinalResponse, pFinalData) =>
									{
										console.log(`  Response: ${pFinalResponse.statusCode}`);
										console.log(`  Data: ${JSON.stringify(pFinalData)}\n`);
										console.log('--- Example Complete ---');
									});
							});
					});
			});
	});
