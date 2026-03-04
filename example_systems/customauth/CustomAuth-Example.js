/**
 * CustomAuth Example - Client
 *
 * Demonstrates using pict-sessionmanager to authenticate with a
 * header-based auth API and access protected resources.
 *
 * Prerequisites:
 *   1. Start the mock server: node CustomAuth-Server.js
 *   2. Run this example: node CustomAuth-Example.js
 *
 * @author Steven Velozo <steven@velozo.com>
 */

const libPict = require('pict');
const libPictSessionManager = require('../../source/Pict-SessionManager.js');

const _ServerURL = 'http://127.0.0.1:8891';

// Create a Pict instance
let tmpPict = new libPict({ LogLevel: 5 });

// Register and instantiate the SessionManager
tmpPict.serviceManager.addServiceType('SessionManager', libPictSessionManager);
tmpPict.serviceManager.instantiateServiceProvider('SessionManager');

// Add a session definition for the CustomAuth API
tmpPict.SessionManager.addSession('CustomAuth',
	{
		Type: 'Header',

		// How to check if we're logged in
		CheckSessionURITemplate: `${_ServerURL}/1.0/CheckSession`,
		CheckSessionLoginMarkerType: 'boolean',
		CheckSessionLoginMarker: 'Record.LoggedIn',

		// How to authenticate
		AuthenticationMethod: 'get',
		AuthenticationURITemplate: `${_ServerURL}/1.0/Authenticate/{~D:Record.LoginID~}/{~D:Record.LoginPassword~}`,
		AuthenticationRetryCount: 2,
		AuthenticationRetryDebounce: 200,

		// How to inject credentials
		DomainMatch: '127.0.0.1',
		HeaderName: 'x-session-token',
		HeaderValueTemplate: '{~D:Record.Token~}'
	});

// Wire the session manager into the REST client
tmpPict.SessionManager.connectToRestClient();

console.log('--- CustomAuth Session Manager Example ---\n');

// Step 1: Try to access a protected resource without authentication
console.log('Step 1: Trying to access protected resource without auth...');
tmpPict.RestClient.getJSON(`${_ServerURL}/1.0/Books`,
	(pError, pResponse, pData) =>
	{
		console.log(`  Response: ${pResponse.statusCode}`);
		console.log(`  Data: ${JSON.stringify(pData)}\n`);

		// Step 2: Authenticate
		console.log('Step 2: Authenticating...');
		tmpPict.SessionManager.authenticate('CustomAuth', { LoginID: 'demo', LoginPassword: 'demo123' },
			(pAuthError, pSessionState) =>
			{
				if (pAuthError)
				{
					console.error(`  Authentication failed: ${pAuthError.message}`);
					return;
				}

				console.log(`  Authenticated: ${pSessionState.Authenticated}`);
				console.log(`  Token: ${pSessionState.SessionData.Token}\n`);

				// Step 3: Check session
				console.log('Step 3: Checking session...');
				tmpPict.SessionManager.checkSession('CustomAuth',
					(pCheckError, pAuthenticated, pCheckData) =>
					{
						console.log(`  Session valid: ${pAuthenticated}`);
						console.log(`  Check data: ${JSON.stringify(pCheckData)}\n`);

						// Step 4: Access protected resource (session header auto-injected!)
						console.log('Step 4: Accessing protected resource with session...');
						tmpPict.RestClient.getJSON(`${_ServerURL}/1.0/Books`,
							(pBooksError, pBooksResponse, pBooksData) =>
							{
								console.log(`  Response: ${pBooksResponse.statusCode}`);
								console.log(`  Books: ${JSON.stringify(pBooksData, null, 2)}\n`);

								// Step 5: Deauthenticate
								console.log('Step 5: Deauthenticating...');
								tmpPict.SessionManager.deauthenticate('CustomAuth');
								console.log(`  Session authenticated: ${tmpPict.SessionManager.getSession('CustomAuth').Authenticated}\n`);

								// Step 6: Try again without auth
								console.log('Step 6: Trying protected resource after deauth...');
								tmpPict.RestClient.getJSON(`${_ServerURL}/1.0/Books`,
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
