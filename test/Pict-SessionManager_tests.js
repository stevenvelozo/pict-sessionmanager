/**
 * Unit tests for Pict Session Manager
 *
 * @license     MIT
 *
 * @author      Steven Velozo <steven@velozo.com>
 */

var Chai = require("chai");
var Expect = Chai.expect;

const libPict = require('pict');
const libPictSessionManager = require('../source/Pict-SessionManager.js');

const libHTTP = require('http');

/**
 * Create a Pict instance with RestClient and SessionManager ready to use.
 */
function createTestPict()
{
	let tmpPict = new libPict({ LogLevel: 0 });
	// RestClient is registered but not instantiated by default in Pict
	tmpPict.serviceManager.instantiateServiceProvider('RestClient');
	tmpPict.serviceManager.addServiceType('SessionManager', libPictSessionManager);
	tmpPict.serviceManager.instantiateServiceProvider('SessionManager');
	return tmpPict;
}

// ---- Helpers ----

/**
 * Create a minimal mock HTTP server for testing authentication flows.
 * Returns: { server, port, close() }
 */
function createMockServer(fSetupRoutes, fCallback)
{
	let tmpSessions = {};
	let tmpNextToken = 100;

	let tmpServer = libHTTP.createServer(
		(pRequest, pResponse) =>
		{
			let tmpBody = '';
			pRequest.on('data', (pChunk) => { tmpBody += pChunk; });
			pRequest.on('end', () =>
			{
				let tmpParsedBody = null;
				try { tmpParsedBody = JSON.parse(tmpBody); } catch(e) { /* ignore */ }

				fSetupRoutes(pRequest, pResponse, tmpParsedBody, tmpSessions, tmpNextToken);
			});
		});

	tmpServer.listen(0,
		() =>
		{
			let tmpPort = tmpServer.address().port;
			fCallback(null,
				{
					server: tmpServer,
					port: tmpPort,
					url: `http://127.0.0.1:${tmpPort}`,
					close: (fDone) =>
					{
						tmpServer.close(fDone);
					}
				});
		});
}

/**
 * Standard header-based mock routes (CustomAuth style)
 */
function customAuthRoutes(pRequest, pResponse, pBody, pSessions, pNextToken)
{
	let tmpURL = pRequest.url;
	let tmpMethod = pRequest.method;

	// GET /1.0/Authenticate/:LoginID/:LoginPassword
	let tmpAuthMatch = tmpURL.match(/^\/1\.0\/Authenticate\/([^/]+)\/([^/]+)/);
	if (tmpAuthMatch && tmpMethod === 'GET')
	{
		let tmpLoginID = decodeURIComponent(tmpAuthMatch[1]);
		let tmpLoginPassword = decodeURIComponent(tmpAuthMatch[2]);

		if (tmpLoginID === 'testuser' && tmpLoginPassword === 'testpass')
		{
			let tmpToken = `TOKEN-${pNextToken++}`;
			pSessions[tmpToken] = { UserID: 1, LoginID: tmpLoginID };

			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Token: tmpToken, UserID: 1, LoggedIn: true }));
			return;
		}
		else
		{
			pResponse.writeHead(401, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Error: 'Invalid credentials' }));
			return;
		}
	}

	// POST /1.0/Authenticate (body-based)
	if (tmpURL === '/1.0/Authenticate' && tmpMethod === 'POST')
	{
		if (pBody && pBody.UserName === 'testuser' && pBody.Password === 'testpass')
		{
			let tmpToken = `TOKEN-${pNextToken++}`;
			pSessions[tmpToken] = { UserID: 1, LoginID: pBody.UserName };

			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Token: tmpToken, UserID: 1, LoggedIn: true }));
			return;
		}
		else
		{
			pResponse.writeHead(401, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Error: 'Invalid credentials' }));
			return;
		}
	}

	// GET /1.0/CheckSession
	if (tmpURL === '/1.0/CheckSession' && tmpMethod === 'GET')
	{
		let tmpSessionToken = pRequest.headers['x-session-token'];
		if (tmpSessionToken && pSessions[tmpSessionToken])
		{
			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Record: { LoggedIn: true, UserID: pSessions[tmpSessionToken].UserID } }));
			return;
		}
		else
		{
			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Record: { LoggedIn: false } }));
			return;
		}
	}

	// GET /1.0/ProtectedResource
	if (tmpURL === '/1.0/ProtectedResource' && tmpMethod === 'GET')
	{
		let tmpSessionToken = pRequest.headers['x-session-token'];
		if (tmpSessionToken && pSessions[tmpSessionToken])
		{
			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Data: 'Secret stuff', UserID: pSessions[tmpSessionToken].UserID }));
			return;
		}
		else
		{
			pResponse.writeHead(403, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Error: 'Not authenticated' }));
			return;
		}
	}

	// Default 404
	pResponse.writeHead(404, { 'Content-Type': 'application/json' });
	pResponse.end(JSON.stringify({ Error: 'Not found' }));
}

/**
 * Cookie-based mock routes
 */
function cookieRoutes(pRequest, pResponse, pBody, pSessions, pNextToken)
{
	let tmpURL = pRequest.url;
	let tmpMethod = pRequest.method;

	// POST /login
	if (tmpURL === '/login' && tmpMethod === 'POST')
	{
		if (pBody && pBody.UserName === 'archiveuser' && pBody.Password === 'archivepass')
		{
			let tmpSessionID = `SID-${pNextToken++}`;
			pSessions[tmpSessionID] = { UserID: 2, LoginID: pBody.UserName };

			pResponse.writeHead(200,
				{
					'Content-Type': 'application/json',
					'Set-Cookie': `session_id=${tmpSessionID}; Path=/`
				});
			pResponse.end(JSON.stringify({ Success: true, SessionID: tmpSessionID }));
			return;
		}
		else
		{
			pResponse.writeHead(401, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Error: 'Invalid credentials' }));
			return;
		}
	}

	// GET /check
	if (tmpURL === '/check' && tmpMethod === 'GET')
	{
		let tmpCookieHeader = pRequest.headers.cookie || '';
		let tmpSessionMatch = tmpCookieHeader.match(/session_id=([^;]+)/);
		if (tmpSessionMatch && pSessions[tmpSessionMatch[1]])
		{
			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Authenticated: true, UserID: pSessions[tmpSessionMatch[1]].UserID }));
			return;
		}
		else
		{
			pResponse.writeHead(200, { 'Content-Type': 'application/json' });
			pResponse.end(JSON.stringify({ Authenticated: false }));
			return;
		}
	}

	// Default 404
	pResponse.writeHead(404, { 'Content-Type': 'application/json' });
	pResponse.end(JSON.stringify({ Error: 'Not found' }));
}


suite
(
	'Pict-SessionManager',
	() =>
	{
		suite
		(
			'Object Sanity',
			() =>
			{
				test
				(
					'initialize should build a happy little object',
					() =>
					{
						let tmpPict = createTestPict();
						let tmpSessionManager = tmpPict.SessionManager;
						Expect(tmpSessionManager).to.be.an('object', 'SessionManager should initialize as an object.');
						Expect(tmpSessionManager.serviceType).to.equal('SessionManager');
						Expect(tmpSessionManager._Package).to.be.an('object');
						Expect(tmpSessionManager._Package.name).to.equal('pict-sessionmanager');
					}
				);

				test
				(
					'should initialize via pict service manager',
					() =>
					{
						let tmpPict = createTestPict();
						Expect(tmpPict.SessionManager).to.be.an('object');
						Expect(tmpPict.SessionManager.serviceType).to.equal('SessionManager');
					}
				);

				test
				(
					'should have pict convenience alias',
					() =>
					{
						let tmpPict = createTestPict();
						Expect(tmpPict.SessionManager.pict).to.be.an('object');
						Expect(tmpPict.SessionManager.pict).to.equal(tmpPict.SessionManager.fable);
					}
				);
			}
		);

		suite
		(
			'Cookie Capability Detection',
			() =>
			{
				test
				(
					'should detect Node.js cookie capability as true',
					() =>
					{
						let tmpPict = createTestPict();
						Expect(tmpPict.SessionManager.cookieCapability).to.equal(true);
					}
				);

				test
				(
					'should detect browser cookie capability as false',
					() =>
					{
						let tmpPict = createTestPict();
						// Simulate browser environment
						global.window = {};
						tmpPict.SessionManager.detectCookieCapability();
						Expect(tmpPict.SessionManager.cookieCapability).to.equal(false);
						delete global.window;
					}
				);
			}
		);

		suite
		(
			'Template Helpers',
			() =>
			{
				test
				(
					'parseTemplateString should replace Pict template tokens',
					() =>
					{
						let tmpPict = createTestPict();
						let tmpResult = tmpPict.SessionManager.parseTemplateString(
							'/1.0/Authenticate/{~D:Record.LoginID~}/{~D:Record.LoginPassword~}',
							{ LoginID: 'bob', LoginPassword: 'pass123' });
						Expect(tmpResult).to.equal('/1.0/Authenticate/bob/pass123');
					}
				);

				test
				(
					'parseTemplateString should handle empty/null gracefully',
					() =>
					{
						let tmpPict = createTestPict();
						Expect(tmpPict.SessionManager.parseTemplateString(null, {})).to.equal('');
						Expect(tmpPict.SessionManager.parseTemplateString('/foo', null)).to.equal('/foo');
					}
				);

				test
				(
					'parseTemplateString should handle multiple tokens',
					() =>
					{
						let tmpPict = createTestPict();
						let tmpResult = tmpPict.SessionManager.parseTemplateString(
							'Hello {~D:Record.First~} {~D:Record.Last~}!',
							{ First: 'Jane', Last: 'Doe' });
						Expect(tmpResult).to.equal('Hello Jane Doe!');
					}
				);

				test
				(
					'buildRequestBody should replace Pict template tokens in string values',
					() =>
					{
						let tmpPict = createTestPict();
						let tmpResult = tmpPict.SessionManager.buildRequestBody(
							{ UserName: '{~D:Record.LoginID~}', Password: '{~D:Record.LoginPassword~}', Extra: 42 },
							{ LoginID: 'bob', LoginPassword: 'pass' }
						);
						Expect(tmpResult.UserName).to.equal('bob');
						Expect(tmpResult.Password).to.equal('pass');
						Expect(tmpResult.Extra).to.equal(42);
					}
				);

				test
				(
					'buildRequestBody should handle null/non-object pData by returning template copy',
					() =>
					{
						let tmpPict = createTestPict();
						let tmpTemplate = { UserName: '{~D:Record.LoginID~}', Count: 5 };
						let tmpResult = tmpPict.SessionManager.buildRequestBody(tmpTemplate, null);
						Expect(tmpResult.UserName).to.equal('{~D:Record.LoginID~}');
						Expect(tmpResult.Count).to.equal(5);
					}
				);

				test
				(
					'buildRequestBody should handle null/non-object pTemplate',
					() =>
					{
						let tmpPict = createTestPict();
						let tmpResult = tmpPict.SessionManager.buildRequestBody(null, { LoginID: 'bob' });
						Expect(tmpResult).to.be.an('object');
						Expect(Object.keys(tmpResult)).to.have.length(0);
					}
				);

				test
				(
					'resolveAddress should traverse dot-notation paths via Manyfest',
					() =>
					{
						let tmpPict = createTestPict();
						let tmpData = { Record: { LoggedIn: true, User: { Name: 'Alice' } } };
						Expect(tmpPict.SessionManager.resolveAddress(tmpData, 'Record.LoggedIn')).to.equal(true);
						Expect(tmpPict.SessionManager.resolveAddress(tmpData, 'Record.User.Name')).to.equal('Alice');
						Expect(tmpPict.SessionManager.resolveAddress(tmpData, 'Record.Missing')).to.equal(undefined);
						Expect(tmpPict.SessionManager.resolveAddress(null, 'Foo')).to.equal(undefined);
					}
				);
			}
		);

		suite
		(
			'Session CRUD',
			() =>
			{
				test
				(
					'addSession should create a session state',
					() =>
					{
						let tmpPict = createTestPict();

						let tmpState = tmpPict.SessionManager.addSession('TestSession',
							{
								Type: 'Header',
								DomainMatch: 'localhost',
								HeaderName: 'x-session-token'
							});

						Expect(tmpState).to.be.an('object');
						Expect(tmpState.Name).to.equal('TestSession');
						Expect(tmpState.Configuration.Type).to.equal('Header');
						Expect(tmpState.Authenticated).to.equal(false);
					}
				);

				test
				(
					'getSession should return the session state',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('MySession', { Type: 'Cookie' });
						let tmpSession = tmpPict.SessionManager.getSession('MySession');
						Expect(tmpSession).to.be.an('object');
						Expect(tmpSession.Name).to.equal('MySession');

						let tmpMissing = tmpPict.SessionManager.getSession('NonExistent');
						Expect(tmpMissing).to.equal(false);
					}
				);

				test
				(
					'getSessions should return a summary of all sessions',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('A', { Type: 'Header', DomainMatch: 'a.com' });
						tmpPict.SessionManager.addSession('B', { Type: 'Cookie', DomainMatch: 'b.com' });

						let tmpSummary = tmpPict.SessionManager.getSessions();
						Expect(Object.keys(tmpSummary)).to.have.length(2);
						Expect(tmpSummary.A.Type).to.equal('Header');
						Expect(tmpSummary.B.Type).to.equal('Cookie');
					}
				);

				test
				(
					'removeSession should delete a session',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Temp', {});
						Expect(tmpPict.SessionManager.getSession('Temp')).to.be.an('object');

						let tmpRemoved = tmpPict.SessionManager.removeSession('Temp');
						Expect(tmpRemoved).to.equal(true);
						Expect(tmpPict.SessionManager.getSession('Temp')).to.equal(false);

						let tmpRemoveMissing = tmpPict.SessionManager.removeSession('Nothing');
						Expect(tmpRemoveMissing).to.equal(false);
					}
				);

				test
				(
					'addSession with invalid name should return false',
					() =>
					{
						let tmpPict = createTestPict();

						let tmpResult = tmpPict.SessionManager.addSession(null, {});
						Expect(tmpResult).to.equal(false);
					}
				);
			}
		);

		suite
		(
			'Header Injection',
			() =>
			{
				test
				(
					'prepareRequestOptions should inject configured headers for authenticated sessions',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('HL',
							{
								Type: 'Header',
								HeaderName: 'x-session-token',
								DomainMatch: 'localhost'
							});

						// Manually set authenticated state
						let tmpSession = tmpPict.SessionManager.getSession('HL');
						tmpSession.Authenticated = true;
						tmpSession.Headers['x-session-token'] = 'TOKEN-ABC';

						let tmpOptions = { url: 'http://localhost/1.0/Stuff', headers: {} };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('HL', tmpOptions);

						Expect(tmpOptions.headers['x-session-token']).to.equal('TOKEN-ABC');
					}
				);

				test
				(
					'prepareRequestOptions should not inject for unauthenticated sessions',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('HL', { Type: 'Header', HeaderName: 'x-session-token' });

						let tmpOptions = { url: 'http://localhost/1.0/Stuff', headers: {} };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('HL', tmpOptions);

						Expect(tmpOptions.headers['x-session-token']).to.equal(undefined);
					}
				);
			}
		);

		suite
		(
			'Cookie Injection',
			() =>
			{
				test
				(
					'prepareRequestOptions should inject cookies for Cookie-type sessions',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('IA',
							{
								Type: 'Cookie',
								CookieName: 'session_id',
								DomainMatch: 'localhost'
							});

						let tmpSession = tmpPict.SessionManager.getSession('IA');
						tmpSession.Authenticated = true;
						tmpSession.Cookies['session_id'] = 'SID-42';

						let tmpOptions = { url: 'http://localhost/check', headers: {} };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('IA', tmpOptions);

						Expect(tmpOptions.headers.cookie).to.contain('session_id=SID-42');
					}
				);

				test
				(
					'prepareRequestOptions should preserve existing cookies',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('IA', { Type: 'Cookie' });

						let tmpSession = tmpPict.SessionManager.getSession('IA');
						tmpSession.Authenticated = true;
						tmpSession.Cookies['session_id'] = 'SID-99';

						let tmpOptions = { url: 'http://localhost/x', headers: { cookie: 'existing=yes' } };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('IA', tmpOptions);

						Expect(tmpOptions.headers.cookie).to.contain('existing=yes');
						Expect(tmpOptions.headers.cookie).to.contain('session_id=SID-99');
					}
				);
			}
		);

		suite
		(
			'Domain Matching',
			() =>
			{
				test
				(
					'prepareRequestOptionsAuto should match URLs containing DomainMatch',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('A',
							{
								Type: 'Header',
								HeaderName: 'x-token-a',
								DomainMatch: 'api-a.com'
							});
						tmpPict.SessionManager.addSession('B',
							{
								Type: 'Header',
								HeaderName: 'x-token-b',
								DomainMatch: 'api-b.com'
							});

						let tmpSessionA = tmpPict.SessionManager.getSession('A');
						tmpSessionA.Authenticated = true;
						tmpSessionA.Headers['x-token-a'] = 'AAA';

						let tmpSessionB = tmpPict.SessionManager.getSession('B');
						tmpSessionB.Authenticated = true;
						tmpSessionB.Headers['x-token-b'] = 'BBB';

						// Request to api-a.com should only get A's header
						let tmpOptionsA = { url: 'https://api-a.com/data', headers: {} };
						tmpOptionsA = tmpPict.SessionManager.prepareRequestOptionsAuto(tmpOptionsA);
						Expect(tmpOptionsA.headers['x-token-a']).to.equal('AAA');
						Expect(tmpOptionsA.headers['x-token-b']).to.equal(undefined);

						// Request to api-b.com should only get B's header
						let tmpOptionsB = { url: 'https://api-b.com/data', headers: {} };
						tmpOptionsB = tmpPict.SessionManager.prepareRequestOptionsAuto(tmpOptionsB);
						Expect(tmpOptionsB.headers['x-token-b']).to.equal('BBB');
						Expect(tmpOptionsB.headers['x-token-a']).to.equal(undefined);

						// Request to unmatched domain should get nothing
						let tmpOptionsC = { url: 'https://other.com/data', headers: {} };
						tmpOptionsC = tmpPict.SessionManager.prepareRequestOptionsAuto(tmpOptionsC);
						Expect(tmpOptionsC.headers['x-token-a']).to.equal(undefined);
						Expect(tmpOptionsC.headers['x-token-b']).to.equal(undefined);
					}
				);
			}
		);

		suite
		(
			'REST Client Connection',
			() =>
			{
				test
				(
					'connectToRestClient should override prepareRequestOptions',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Test',
							{
								Type: 'Header',
								HeaderName: 'x-test',
								DomainMatch: '127.0.0.1'
							});

						let tmpSession = tmpPict.SessionManager.getSession('Test');
						tmpSession.Authenticated = true;
						tmpSession.Headers['x-test'] = 'TESTVALUE';

						tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);

						// Now prepareRequestOptions on the RestClient should inject our headers
						let tmpOptions = { url: 'http://127.0.0.1/foo', headers: {} };
						tmpOptions = tmpPict.RestClient.prepareRequestOptions(tmpOptions);
						Expect(tmpOptions.headers['x-test']).to.equal('TESTVALUE');
					}
				);

				test
				(
					'connectToRestClient with no argument should use pict.RestClient',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.connectToRestClient();

						// Should not throw; should have connected to the default RestClient
						let tmpOptions = { url: 'http://nothing.com/foo', headers: {} };
						tmpOptions = tmpPict.RestClient.prepareRequestOptions(tmpOptions);
						Expect(tmpOptions).to.be.an('object');
					}
				);

				test
				(
					'disconnectRestClient should restore original prepareRequestOptions',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Test',
							{
								Type: 'Header',
								HeaderName: 'x-test',
								DomainMatch: '127.0.0.1'
							});

						let tmpSession = tmpPict.SessionManager.getSession('Test');
						tmpSession.Authenticated = true;
						tmpSession.Headers['x-test'] = 'TESTVALUE';

						tmpPict.SessionManager.connectToRestClient(tmpPict.RestClient);

						// Headers should be injected while connected
						let tmpOptions = { url: 'http://127.0.0.1/foo', headers: {} };
						tmpOptions = tmpPict.RestClient.prepareRequestOptions(tmpOptions);
						Expect(tmpOptions.headers['x-test']).to.equal('TESTVALUE');

						// Disconnect
						let tmpResult = tmpPict.SessionManager.disconnectRestClient();
						Expect(tmpResult).to.equal(true);

						// Headers should no longer be injected
						let tmpOptions2 = { url: 'http://127.0.0.1/foo', headers: {} };
						tmpOptions2 = tmpPict.RestClient.prepareRequestOptions(tmpOptions2);
						Expect(tmpOptions2.headers['x-test']).to.equal(undefined);
					}
				);

				test
				(
					'disconnectRestClient with no prior connection should return false',
					() =>
					{
						let tmpPict = createTestPict();

						let tmpResult = tmpPict.SessionManager.disconnectRestClient();
						Expect(tmpResult).to.equal(false);
					}
				);
			}
		);

		suite
		(
			'Deauthenticate',
			() =>
			{
				test
				(
					'deauthenticate should clear session state',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('DeauthTest', { Type: 'Header' });
						let tmpSession = tmpPict.SessionManager.getSession('DeauthTest');
						tmpSession.Authenticated = true;
						tmpSession.SessionData = { Token: 'abc' };
						tmpSession.Headers['x-token'] = 'abc';
						tmpSession.Cookies['sid'] = '123';

						let tmpResult = tmpPict.SessionManager.deauthenticate('DeauthTest');
						Expect(tmpResult).to.equal(true);
						Expect(tmpSession.Authenticated).to.equal(false);
						Expect(Object.keys(tmpSession.SessionData)).to.have.length(0);
						Expect(Object.keys(tmpSession.Headers)).to.have.length(0);
						Expect(Object.keys(tmpSession.Cookies)).to.have.length(0);

						Expect(tmpPict.SessionManager.deauthenticate('NonExistent')).to.equal(false);
					}
				);
			}
		);

		suite
		(
			'Authentication with Mock Server (Header-based, CustomAuth)',
			function()
			{
				let _MockServer = null;

				setup
				(
					function(fDone)
					{
						createMockServer(customAuthRoutes,
							(pError, pServerInfo) =>
							{
								_MockServer = pServerInfo;
								fDone();
							});
					}
				);

				teardown
				(
					function(fDone)
					{
						if (_MockServer)
						{
							_MockServer.close(fDone);
						}
						else
						{
							fDone();
						}
					}
				);

				test
				(
					'authenticate should succeed with valid credentials (GET method)',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('CustomAuth',
							{
								Type: 'Header',
								AuthenticationMethod: 'get',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/Authenticate/{~D:Record.LoginID~}/{~D:Record.LoginPassword~}`,
								HeaderName: 'x-session-token',
								HeaderValueTemplate: '{~D:Record.Token~}',
								DomainMatch: '127.0.0.1'
							});

						tmpPict.SessionManager.authenticate('CustomAuth', { LoginID: 'testuser', LoginPassword: 'testpass' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);
								Expect(pSessionState.Authenticated).to.equal(true);
								Expect(pSessionState.SessionData.Token).to.be.a('string');
								Expect(pSessionState.Headers['x-session-token']).to.be.a('string');
								fDone();
							});
					}
				);

				test
				(
					'authenticate should fail with invalid credentials',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('CustomAuth',
							{
								Type: 'Header',
								AuthenticationMethod: 'get',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/Authenticate/{~D:Record.LoginID~}/{~D:Record.LoginPassword~}`,
								AuthenticationRetryCount: 0,
								DomainMatch: '127.0.0.1'
							});

						tmpPict.SessionManager.authenticate('CustomAuth', { LoginID: 'bad', LoginPassword: 'wrong' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pSessionState.Authenticated).to.equal(false);
								fDone();
							});
					}
				);

				test
				(
					'authenticate should work with POST method',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('CustomAuthPost',
							{
								Type: 'Header',
								AuthenticationMethod: 'post',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/Authenticate`,
								AuthenticationRequestBody: { UserName: '{~D:Record.LoginID~}', Password: '{~D:Record.LoginPassword~}' },
								HeaderName: 'x-session-token',
								HeaderValueTemplate: '{~D:Record.Token~}',
								DomainMatch: '127.0.0.1'
							});

						tmpPict.SessionManager.authenticate('CustomAuthPost', { LoginID: 'testuser', LoginPassword: 'testpass' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);
								Expect(pSessionState.Authenticated).to.equal(true);
								Expect(pSessionState.SessionData.Token).to.be.a('string');
								fDone();
							});
					}
				);

				test
				(
					'checkSession should detect authenticated state',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('HL',
							{
								Type: 'Header',
								AuthenticationMethod: 'get',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/Authenticate/{~D:Record.LoginID~}/{~D:Record.LoginPassword~}`,
								CheckSessionURITemplate: `${_MockServer.url}/1.0/CheckSession`,
								CheckSessionLoginMarkerType: 'boolean',
								CheckSessionLoginMarker: 'Record.LoggedIn',
								HeaderName: 'x-session-token',
								HeaderValueTemplate: '{~D:Record.Token~}',
								DomainMatch: '127.0.0.1'
							});

						// First authenticate
						tmpPict.SessionManager.authenticate('HL', { LoginID: 'testuser', LoginPassword: 'testpass' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);
								Expect(pSessionState.Authenticated).to.equal(true);

								// Now check session
								tmpPict.SessionManager.checkSession('HL',
									(pCheckError, pAuthenticated, pData) =>
									{
										Expect(pCheckError).to.equal(null);
										Expect(pAuthenticated).to.equal(true);
										Expect(pData.Record.LoggedIn).to.equal(true);
										fDone();
									});
							});
					}
				);

				test
				(
					'checkSession should detect unauthenticated state',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('HL',
							{
								Type: 'Header',
								CheckSessionURITemplate: `${_MockServer.url}/1.0/CheckSession`,
								CheckSessionLoginMarkerType: 'boolean',
								CheckSessionLoginMarker: 'Record.LoggedIn',
								HeaderName: 'x-session-token',
								DomainMatch: '127.0.0.1'
							});

						// Check without authenticating first
						tmpPict.SessionManager.checkSession('HL',
							(pCheckError, pAuthenticated, pData) =>
							{
								Expect(pCheckError).to.equal(null);
								Expect(pAuthenticated).to.equal(false);
								fDone();
							});
					}
				);

				test
				(
					'full flow: authenticate, inject headers, access protected resource',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('HL',
							{
								Type: 'Header',
								AuthenticationMethod: 'get',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/Authenticate/{~D:Record.LoginID~}/{~D:Record.LoginPassword~}`,
								HeaderName: 'x-session-token',
								HeaderValueTemplate: '{~D:Record.Token~}',
								DomainMatch: '127.0.0.1'
							});

						// Connect to REST client
						tmpPict.SessionManager.connectToRestClient();

						// Authenticate
						tmpPict.SessionManager.authenticate('HL', { LoginID: 'testuser', LoginPassword: 'testpass' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);

								// Now make a request to the protected resource
								// The session manager should auto-inject the header
								tmpPict.RestClient.getJSON(`${_MockServer.url}/1.0/ProtectedResource`,
									(pReqError, pResponse, pData) =>
									{
										Expect(pReqError).to.equal(null);
										Expect(pResponse.statusCode).to.equal(200);
										Expect(pData.Data).to.equal('Secret stuff');
										fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'Authentication with Mock Server (Cookie-based)',
			function()
			{
				let _MockServer = null;

				setup
				(
					function(fDone)
					{
						createMockServer(cookieRoutes,
							(pError, pServerInfo) =>
							{
								_MockServer = pServerInfo;
								fDone();
							});
					}
				);

				teardown
				(
					function(fDone)
					{
						if (_MockServer)
						{
							_MockServer.close(fDone);
						}
						else
						{
							fDone();
						}
					}
				);

				test
				(
					'authenticate should succeed with cookie-based session (POST)',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('IA',
							{
								Type: 'Cookie',
								AuthenticationMethod: 'post',
								AuthenticationURITemplate: `${_MockServer.url}/login`,
								AuthenticationRequestBody: { UserName: '{~D:Record.LoginID~}', Password: '{~D:Record.LoginPassword~}' },
								CookieName: 'session_id',
								CookieValueAddress: 'SessionID',
								DomainMatch: '127.0.0.1'
							});

						tmpPict.SessionManager.authenticate('IA', { LoginID: 'archiveuser', LoginPassword: 'archivepass' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);
								Expect(pSessionState.Authenticated).to.equal(true);
								Expect(pSessionState.Cookies['session_id']).to.be.a('string');
								Expect(pSessionState.Cookies['session_id']).to.contain('SID-');
								fDone();
							});
					}
				);

				test
				(
					'full cookie flow: authenticate, inject cookies, check session',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('IA',
							{
								Type: 'Cookie',
								AuthenticationMethod: 'post',
								AuthenticationURITemplate: `${_MockServer.url}/login`,
								AuthenticationRequestBody: { UserName: '{~D:Record.LoginID~}', Password: '{~D:Record.LoginPassword~}' },
								CheckSessionURITemplate: `${_MockServer.url}/check`,
								CheckSessionLoginMarkerType: 'boolean',
								CheckSessionLoginMarker: 'Authenticated',
								CookieName: 'session_id',
								CookieValueAddress: 'SessionID',
								DomainMatch: '127.0.0.1'
							});

						// Connect to REST client
						tmpPict.SessionManager.connectToRestClient();

						// Authenticate
						tmpPict.SessionManager.authenticate('IA', { LoginID: 'archiveuser', LoginPassword: 'archivepass' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);
								Expect(pSessionState.Authenticated).to.equal(true);

								// Check session — cookies should be auto-injected
								tmpPict.SessionManager.checkSession('IA',
									(pCheckError, pAuthenticated, pData) =>
									{
										Expect(pCheckError).to.equal(null);
										Expect(pAuthenticated).to.equal(true);
										Expect(pData.Authenticated).to.equal(true);
										fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'CheckSession Marker Types',
			() =>
			{
				test
				(
					'existence marker should check for non-null/undefined',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Test',
							{
								Type: 'Header',
								CheckSessionLoginMarkerType: 'existence',
								CheckSessionLoginMarker: 'Session.Token'
							});

						let tmpSession = tmpPict.SessionManager.getSession('Test');

						// With a value present
						let tmpResult1 = tmpPict.SessionManager.onCheckSession(tmpSession, null, { Session: { Token: 'abc' } });
						Expect(tmpResult1).to.equal(true);

						// With null
						let tmpResult2 = tmpPict.SessionManager.onCheckSession(tmpSession, null, { Session: { Token: null } });
						Expect(tmpResult2).to.equal(false);

						// With missing
						let tmpResult3 = tmpPict.SessionManager.onCheckSession(tmpSession, null, { Session: {} });
						Expect(tmpResult3).to.equal(false);
					}
				);

				test
				(
					'boolean marker should check for truthiness',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Test',
							{
								Type: 'Header',
								CheckSessionLoginMarkerType: 'boolean',
								CheckSessionLoginMarker: 'LoggedIn'
							});

						let tmpSession = tmpPict.SessionManager.getSession('Test');

						Expect(tmpPict.SessionManager.onCheckSession(tmpSession, null, { LoggedIn: true })).to.equal(true);
						Expect(tmpPict.SessionManager.onCheckSession(tmpSession, null, { LoggedIn: false })).to.equal(false);
						Expect(tmpPict.SessionManager.onCheckSession(tmpSession, null, { LoggedIn: 0 })).to.equal(false);
						Expect(tmpPict.SessionManager.onCheckSession(tmpSession, null, { LoggedIn: 'yes' })).to.equal(true);
					}
				);

				test
				(
					'onCheckSession should return false for null data',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Test', { Type: 'Header', CheckSessionLoginMarker: 'X' });
						let tmpSession = tmpPict.SessionManager.getSession('Test');
						Expect(tmpPict.SessionManager.onCheckSession(tmpSession, null, null)).to.equal(false);
					}
				);
			}
		);

		suite
		(
			'Error Handling',
			() =>
			{
				test
				(
					'checkSession with missing session should return error',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.checkSession('NonExistent',
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('not found');
								fDone();
							});
					}
				);

				test
				(
					'authenticate with missing session should return error',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.authenticate('NonExistent', {},
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('not found');
								fDone();
							});
					}
				);

				test
				(
					'checkSession with no URI template should return error',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoURI', { Type: 'Header' });

						tmpPict.SessionManager.checkSession('NoURI',
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('CheckSessionURITemplate');
								fDone();
							});
					}
				);

				test
				(
					'authenticate with no URI template should return error',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoURI', { Type: 'Header' });

						tmpPict.SessionManager.authenticate('NoURI', {},
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('AuthenticationURITemplate');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Solver Marker Type',
			() =>
			{
				test
				(
					'solver marker should evaluate expression and return truthy result',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('SolverTrue',
							{
								Type: 'Header',
								CheckSessionLoginMarkerType: 'solver',
								CheckSessionLoginMarker: '1 + 1'
							});

						let tmpSession = tmpPict.SessionManager.getSession('SolverTrue');

						// 1 + 1 = 2, !!2 = true
						let tmpResult = tmpPict.SessionManager.onCheckSession(tmpSession, null, {});
						Expect(tmpResult).to.equal(true);
					}
				);

				test
				(
					'solver marker should return false on expression error',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('SolverErr',
							{
								Type: 'Header',
								CheckSessionLoginMarkerType: 'solver',
								CheckSessionLoginMarker: 'SomeExpression'
							});

						let tmpSession = tmpPict.SessionManager.getSession('SolverErr');

						// Monkey-patch ExpressionParser to throw
						tmpPict.instantiateServiceProviderIfNotExists('ExpressionParser');
						let tmpOrigSolve = tmpPict.ExpressionParser.solve;
						tmpPict.ExpressionParser.solve = () => { throw new Error('Solver boom'); };

						let tmpResult = tmpPict.SessionManager.onCheckSession(tmpSession, null, { SomeExpression: true });
						Expect(tmpResult).to.equal(false);

						// Restore
						tmpPict.ExpressionParser.solve = tmpOrigSolve;
					}
				);
			}
		);

		suite
		(
			'CheckSession Edge Cases',
			function()
			{
				test
				(
					'checkSession should return cached data within debounce window',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Debounce',
							{
								Type: 'Header',
								CheckSessionURITemplate: 'http://127.0.0.1:1/check',
								CheckSessionDebounce: 60000
							});

						let tmpSession = tmpPict.SessionManager.getSession('Debounce');
						tmpSession.Authenticated = true;
						tmpSession.SessionData = { CachedResult: true };
						tmpSession.LastCheckTime = Date.now();

						tmpPict.SessionManager.checkSession('Debounce',
							(pError, pAuthenticated, pData) =>
							{
								Expect(pError).to.equal(null);
								Expect(pAuthenticated).to.equal(true);
								Expect(pData.CachedResult).to.equal(true);
								fDone();
							});
					}
				);

				test
				(
					'checkSession should proceed to REST call when debounce has elapsed',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('DebounceElapsed',
							{
								Type: 'Header',
								CheckSessionURITemplate: 'http://127.0.0.1:1/check',
								CheckSessionDebounce: 1
							});

						let tmpSession = tmpPict.SessionManager.getSession('DebounceElapsed');
						tmpSession.LastCheckTime = 1; // Very old timestamp — debounce window long elapsed

						tmpPict.SessionManager.checkSession('DebounceElapsed',
							(pError) =>
							{
								// Connection refused, but exercises the debounce-elapsed branch
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);

				test
				(
					'checkSession should not throw when no callback provided',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoCb',
							{
								Type: 'Header'
							});

						// No CheckSessionURITemplate and no callback - exercises fallback callback branch
						tmpPict.SessionManager.checkSession('NoCb');
						setTimeout(fDone, 50);
					}
				);

				test
				(
					'checkSession should handle REST request errors',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('ErrCheck',
							{
								Type: 'Header',
								CheckSessionURITemplate: 'http://127.0.0.1:1/check',
								HeaderName: 'x-test',
								DomainMatch: '127.0.0.1'
							});

						let tmpSession = tmpPict.SessionManager.getSession('ErrCheck');
						tmpSession.Authenticated = true;
						tmpSession.Headers['x-test'] = 'val';

						tmpPict.SessionManager.checkSession('ErrCheck',
							(pError, pAuthenticated, pData) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pAuthenticated).to.equal(false);
								fDone();
							});
					}
				);

				test
				(
					'checkSession should default to GET when CheckSessionMethod is falsy',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('DefaultMethod',
							{
								Type: 'Header',
								CheckSessionURITemplate: 'http://127.0.0.1:1/check'
							});

						let tmpSession = tmpPict.SessionManager.getSession('DefaultMethod');
						tmpSession.Configuration.CheckSessionMethod = '';

						tmpPict.SessionManager.checkSession('DefaultMethod',
							(pError) =>
							{
								// Will fail (connection refused) but exercises the default method branch
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'CheckSession POST Method',
			function()
			{
				let _MockServer = null;

				setup
				(
					function(fDone)
					{
						createMockServer(
							(pRequest, pResponse) =>
							{
								if (pRequest.url === '/check' && pRequest.method === 'POST')
								{
									pResponse.writeHead(200, { 'Content-Type': 'application/json' });
									pResponse.end(JSON.stringify({ Active: true }));
									return;
								}
								pResponse.writeHead(404, { 'Content-Type': 'application/json' });
								pResponse.end(JSON.stringify({ Error: 'Not found' }));
							},
							(pError, pServerInfo) =>
							{
								_MockServer = pServerInfo;
								fDone();
							});
					}
				);

				teardown
				(
					function(fDone)
					{
						if (_MockServer) { _MockServer.close(fDone); }
						else { fDone(); }
					}
				);

				test
				(
					'checkSession should use POST method when configured',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('PostCheck',
							{
								Type: 'Header',
								CheckSessionURITemplate: `${_MockServer.url}/check`,
								CheckSessionMethod: 'post',
								CheckSessionLoginMarkerType: 'boolean',
								CheckSessionLoginMarker: 'Active'
							});

						tmpPict.SessionManager.checkSession('PostCheck',
							(pError, pAuthenticated, pData) =>
							{
								Expect(pError).to.equal(null);
								Expect(pAuthenticated).to.equal(true);
								Expect(pData.Active).to.equal(true);
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Authentication Edge Cases',
			function()
			{
				test
				(
					'authenticate should reject when already in progress',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('InProgress',
							{
								Type: 'Header',
								AuthenticationURITemplate: 'http://127.0.0.1:1/auth'
							});

						let tmpSession = tmpPict.SessionManager.getSession('InProgress');
						tmpSession.AuthenticateInProgress = true;

						tmpPict.SessionManager.authenticate('InProgress', { LoginID: 'test' },
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('already in progress');
								fDone();
							});
					}
				);

				test
				(
					'authenticate should not throw when no callback provided',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoCb2',
							{
								Type: 'Header'
							});

						// No AuthenticationURITemplate and no callback - exercises fallback callback branch
						tmpPict.SessionManager.authenticate('NoCb2', {});
						setTimeout(fDone, 50);
					}
				);

				test
				(
					'authenticate should handle null credentials gracefully',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NullCreds',
							{
								Type: 'Header',
								AuthenticationURITemplate: 'http://127.0.0.1:1/auth',
								AuthenticationRetryCount: 0
							});

						tmpPict.SessionManager.authenticate('NullCreds', null,
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);

				test
				(
					'GET authentication should handle network errors',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NetErr',
							{
								Type: 'Header',
								AuthenticationMethod: 'get',
								AuthenticationURITemplate: 'http://127.0.0.1:1/auth/{~D:Record.LoginID~}',
								AuthenticationRetryCount: 0
							});

						tmpPict.SessionManager.authenticate('NetErr', { LoginID: 'test' },
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);

				test
				(
					'POST authentication should handle network errors',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('PostNetErr',
							{
								Type: 'Header',
								AuthenticationMethod: 'post',
								AuthenticationURITemplate: 'http://127.0.0.1:1/auth',
								AuthenticationRequestBody: { UserName: '{~D:Record.LoginID~}' },
								AuthenticationRetryCount: 0
							});

						tmpPict.SessionManager.authenticate('PostNetErr', { LoginID: 'test' },
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);

				test
				(
					'authenticate should default to GET when AuthenticationMethod is falsy',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('DefaultAuth',
							{
								Type: 'Header',
								AuthenticationURITemplate: 'http://127.0.0.1:1/auth',
								AuthenticationRetryCount: 0
							});

						let tmpSession = tmpPict.SessionManager.getSession('DefaultAuth');
						tmpSession.Configuration.AuthenticationMethod = '';

						tmpPict.SessionManager.authenticate('DefaultAuth', { LoginID: 'test' },
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);
				test
				(
					'authenticate with falsy retry count and credentials should use fallbacks',
					function(fDone)
					{
						this.timeout(10000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('FalsyFallbacks',
							{
								Type: 'Header',
								AuthenticationURITemplate: 'http://127.0.0.1:1/auth'
							});

						let tmpSession = tmpPict.SessionManager.getSession('FalsyFallbacks');
						// Force falsy values to exercise || fallback branches
						tmpSession.Configuration.AuthenticationRetryCount = undefined;
						tmpSession.Configuration.AuthenticationRetryDebounce = undefined;
						tmpSession.Configuration.Credentials = null;

						// Pass null credentials so the Credentials stays null through the check
						tmpPict.SessionManager.authenticate('FalsyFallbacks', null,
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);

				test
				(
					'authenticate should handle null session data from successful auth',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NullData',
							{
								Type: 'Header',
								AuthenticationURITemplate: 'http://fake/auth'
							});

						// Mock _executeAuthentication to return success with null data
						let tmpOrig = tmpPict.SessionManager._executeAuthentication;
						tmpPict.SessionManager._executeAuthentication = function(pState, fCb)
						{
							fCb(null, null);
						};

						tmpPict.SessionManager.authenticate('NullData', { LoginID: 'test' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);
								Expect(pSessionState.SessionData).to.be.an('object');
								Expect(Object.keys(pSessionState.SessionData)).to.have.length(0);
								tmpPict.SessionManager._executeAuthentication = tmpOrig;
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'POST Authentication Status Errors',
			function()
			{
				let _MockServer = null;

				setup
				(
					function(fDone)
					{
						createMockServer(customAuthRoutes,
							(pError, pServerInfo) =>
							{
								_MockServer = pServerInfo;
								fDone();
							});
					}
				);

				teardown
				(
					function(fDone)
					{
						if (_MockServer) { _MockServer.close(fDone); }
						else { fDone(); }
					}
				);

				test
				(
					'POST authenticate should fail with status >= 400',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('PostFail',
							{
								Type: 'Header',
								AuthenticationMethod: 'post',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/Authenticate`,
								AuthenticationRequestBody: { UserName: '{~D:Record.LoginID~}', Password: '{~D:Record.LoginPassword~}' },
								AuthenticationRetryCount: 0
							});

						tmpPict.SessionManager.authenticate('PostFail', { LoginID: 'bad', LoginPassword: 'wrong' },
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('status');
								fDone();
							});
					}
				);

				test
				(
					'POST authenticate with no request body template should send empty body',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('PostNoBody',
							{
								Type: 'Header',
								AuthenticationMethod: 'post',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/Authenticate`,
								AuthenticationRetryCount: 0
							});

						tmpPict.SessionManager.authenticate('PostNoBody', { LoginID: 'test' },
							(pError) =>
							{
								// Will fail (empty body → no valid creds → 401) but covers the no-body-template branch
								Expect(pError).to.be.an('error');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Authentication Retry',
			function()
			{
				let _MockServer = null;
				let _RetryAttempts = 0;

				setup
				(
					function(fDone)
					{
						_RetryAttempts = 0;
						createMockServer(
							(pRequest, pResponse) =>
							{
								if (pRequest.url.startsWith('/1.0/AuthRetry'))
								{
									_RetryAttempts++;
									if (_RetryAttempts <= 1)
									{
										pResponse.writeHead(500, { 'Content-Type': 'application/json' });
										pResponse.end(JSON.stringify({ Error: 'Temporary failure' }));
										return;
									}
									pResponse.writeHead(200, { 'Content-Type': 'application/json' });
									pResponse.end(JSON.stringify({ Token: 'RETRY-TOKEN', LoggedIn: true }));
									return;
								}
								pResponse.writeHead(404, { 'Content-Type': 'application/json' });
								pResponse.end(JSON.stringify({ Error: 'Not found' }));
							},
							(pError, pServerInfo) =>
							{
								_MockServer = pServerInfo;
								fDone();
							});
					}
				);

				teardown
				(
					function(fDone)
					{
						if (_MockServer) { _MockServer.close(fDone); }
						else { fDone(); }
					}
				);

				test
				(
					'should retry authentication on failure and succeed',
					function(fDone)
					{
						this.timeout(5000);
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('Retry',
							{
								Type: 'Header',
								AuthenticationMethod: 'get',
								AuthenticationURITemplate: `${_MockServer.url}/1.0/AuthRetry/{~D:Record.LoginID~}`,
								AuthenticationRetryCount: 2,
								AuthenticationRetryDebounce: 50,
								HeaderName: 'x-token',
								HeaderValueTemplate: '{~D:Record.Token~}'
							});

						tmpPict.SessionManager.authenticate('Retry', { LoginID: 'test' },
							(pError, pSessionState) =>
							{
								Expect(pError).to.equal(null);
								Expect(pSessionState.Authenticated).to.equal(true);
								Expect(_RetryAttempts).to.equal(2);
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'onAuthenticate Edge Cases',
			() =>
			{
				test
				(
					'should use address lookup when HeaderName set but no HeaderValueTemplate',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('AddrHeader',
							{
								Type: 'Header',
								HeaderName: 'Authorization'
								// No HeaderValueTemplate
							});

						let tmpSession = tmpPict.SessionManager.getSession('AddrHeader');
						tmpSession.Authenticated = true;
						tmpSession.SessionData = { Authorization: 'Bearer abc123' };

						tmpPict.SessionManager.onAuthenticate(tmpSession, null, tmpSession.SessionData);

						Expect(tmpSession.Headers['Authorization']).to.equal('Bearer abc123');
					}
				);

				test
				(
					'should not set header when address lookup returns nothing',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoVal',
							{
								Type: 'Header',
								HeaderName: 'Authorization'
							});

						let tmpSession = tmpPict.SessionManager.getSession('NoVal');
						tmpSession.Authenticated = true;
						tmpSession.SessionData = { Other: 'stuff' };

						tmpPict.SessionManager.onAuthenticate(tmpSession, null, tmpSession.SessionData);

						Expect(tmpSession.Headers['Authorization']).to.equal(undefined);
					}
				);

				test
				(
					'should skip cookie when CookieValueAddress resolves to null',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NullCookie',
							{
								Type: 'Cookie',
								CookieName: 'sid',
								CookieValueAddress: 'MissingField'
							});

						let tmpSession = tmpPict.SessionManager.getSession('NullCookie');
						tmpSession.SessionData = {};

						tmpPict.SessionManager.onAuthenticate(tmpSession, null, tmpSession.SessionData);

						Expect(tmpSession.Cookies['sid']).to.equal(undefined);
					}
				);
			}
		);

		suite
		(
			'Injection Edge Cases',
			() =>
			{
				test
				(
					'prepareRequestOptions should inject both headers and cookies for Both type',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('BothSession',
							{
								Type: 'Both',
								HeaderName: 'x-token',
								CookieName: 'sid',
								DomainMatch: 'localhost'
							});

						let tmpSession = tmpPict.SessionManager.getSession('BothSession');
						tmpSession.Authenticated = true;
						tmpSession.Headers['x-token'] = 'TOKEN123';
						tmpSession.Cookies['sid'] = 'SIDVAL';

						let tmpOptions = { url: 'http://localhost/test', headers: {} };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('BothSession', tmpOptions);

						Expect(tmpOptions.headers['x-token']).to.equal('TOKEN123');
						Expect(tmpOptions.headers.cookie).to.contain('sid=SIDVAL');
					}
				);

				test
				(
					'prepareRequestOptions should create headers object if missing',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoHeaders',
							{
								Type: 'Header',
								HeaderName: 'x-test'
							});

						let tmpSession = tmpPict.SessionManager.getSession('NoHeaders');
						tmpSession.Authenticated = true;
						tmpSession.Headers['x-test'] = 'VALUE';

						let tmpOptions = { url: 'http://localhost/test' };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('NoHeaders', tmpOptions);

						Expect(tmpOptions.headers).to.be.an('object');
						Expect(tmpOptions.headers['x-test']).to.equal('VALUE');
					}
				);

				test
				(
					'cookie injection should warn when cookieCapability is false',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoCookieCap',
							{
								Type: 'Cookie',
								CookieName: 'sid',
								DomainMatch: 'localhost'
							});

						let tmpSession = tmpPict.SessionManager.getSession('NoCookieCap');
						tmpSession.Authenticated = true;
						tmpSession.Cookies['sid'] = 'SIDVAL';

						tmpPict.SessionManager.cookieCapability = false;

						let tmpOptions = { url: 'http://localhost/test', headers: {} };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('NoCookieCap', tmpOptions);

						// Cookie should NOT be injected
						Expect(tmpOptions.headers.cookie).to.equal(undefined);

						tmpPict.SessionManager.cookieCapability = true;
					}
				);

				test
				(
					'prepareRequestOptionsAuto should handle null/undefined options',
					() =>
					{
						let tmpPict = createTestPict();

						let tmpResult1 = tmpPict.SessionManager.prepareRequestOptionsAuto(null);
						Expect(tmpResult1).to.equal(null);

						let tmpResult2 = tmpPict.SessionManager.prepareRequestOptionsAuto(undefined);
						Expect(tmpResult2).to.equal(undefined);

						let tmpResult3 = tmpPict.SessionManager.prepareRequestOptionsAuto({});
						Expect(tmpResult3).to.be.an('object');
					}
				);

				test
				(
					'prepareRequestOptions should default Type to Header when not set',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoType', {});

						let tmpSession = tmpPict.SessionManager.getSession('NoType');
						tmpSession.Authenticated = true;
						tmpSession.Headers['x-test'] = 'VALUE';
						tmpSession.Configuration.Type = '';

						let tmpOptions = { url: 'http://localhost/test', headers: {} };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('NoType', tmpOptions);

						Expect(tmpOptions.headers['x-test']).to.equal('VALUE');
					}
				);

				test
				(
					'cookie session with no cookies set should not modify options',
					() =>
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('EmptyCookies',
							{
								Type: 'Cookie',
								DomainMatch: 'localhost'
							});

						let tmpSession = tmpPict.SessionManager.getSession('EmptyCookies');
						tmpSession.Authenticated = true;

						let tmpOptions = { url: 'http://localhost/test', headers: {} };
						tmpOptions = tmpPict.SessionManager.prepareRequestOptions('EmptyCookies', tmpOptions);

						Expect(tmpOptions.headers.cookie).to.equal(undefined);
					}
				);

				test
				(
					'addSession should handle falsy configuration',
					() =>
					{
						let tmpPict = createTestPict();

						let tmpState = tmpPict.SessionManager.addSession('FalsyConfig');
						Expect(tmpState).to.be.an('object');
						Expect(tmpState.Name).to.equal('FalsyConfig');
					}
				);
			}
		);

		suite
		(
			'No RestClient Available',
			function()
			{
				test
				(
					'checkSession should return error when no RestClient',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoRC',
							{
								Type: 'Header',
								CheckSessionURITemplate: 'http://fake/check'
							});

						// Replace pict reference with a mock that has no RestClient
						let tmpOrigPict = tmpPict.SessionManager.pict;
						tmpPict.SessionManager.pict = {
							instantiateServiceProviderIfNotExists: () => {},
							RestClient: null,
							log: tmpOrigPict.log,
							manifest: tmpOrigPict.manifest,
							parseTemplate: tmpOrigPict.parseTemplate.bind(tmpOrigPict)
						};

						tmpPict.SessionManager.checkSession('NoRC',
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('RestClient');
								tmpPict.SessionManager.pict = tmpOrigPict;
								fDone();
							});
					}
				);

				test
				(
					'authenticate should return error when no RestClient',
					function(fDone)
					{
						let tmpPict = createTestPict();

						tmpPict.SessionManager.addSession('NoRC2',
							{
								Type: 'Header',
								AuthenticationURITemplate: 'http://fake/auth',
								AuthenticationRetryCount: 0
							});

						let tmpOrigPict = tmpPict.SessionManager.pict;
						tmpPict.SessionManager.pict = {
							instantiateServiceProviderIfNotExists: () => {},
							RestClient: null,
							log: tmpOrigPict.log,
							manifest: tmpOrigPict.manifest,
							parseTemplate: tmpOrigPict.parseTemplate.bind(tmpOrigPict)
						};

						tmpPict.SessionManager.authenticate('NoRC2', { LoginID: 'test' },
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('RestClient');
								tmpPict.SessionManager.pict = tmpOrigPict;
								fDone();
							});
					}
				);

				test
				(
					'connectToRestClient should log error when no RestClient available at all',
					() =>
					{
						let tmpPict = createTestPict();

						let tmpOrigPict = tmpPict.SessionManager.pict;
						tmpPict.SessionManager.pict = {
							instantiateServiceProviderIfNotExists: () => {},
							RestClient: null,
							log: tmpOrigPict.log
						};

						// Should not throw, should log error and return
						tmpPict.SessionManager.connectToRestClient();

						Expect(tmpPict.SessionManager._connectedRestClient).to.not.be.ok;

						tmpPict.SessionManager.pict = tmpOrigPict;
					}
				);
			}
		);

		suite
		(
			'Factory',
			() =>
			{
				test
				(
					'new() factory function should exist and create an instance',
					() =>
					{
						Expect(libPictSessionManager.new).to.be.a('function');

						let tmpPict = new libPict({ LogLevel: 0 });
						let tmpInstance = libPictSessionManager.new(tmpPict);
						Expect(tmpInstance).to.be.an('object');
						Expect(tmpInstance.serviceType).to.equal('SessionManager');
					}
				);
			}
		);
	}
);
