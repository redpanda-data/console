/**
 * Zitadel OIDC provider setup for E2E tests.
 *
 * Starts PostgreSQL + Zitadel containers, provisions an OIDC application,
 * project roles, and test users. Returns the configuration needed by
 * Console's OIDC authentication.
 */

import { GenericContainer, Network, Wait } from 'testcontainers';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as crypto from 'node:crypto';

const ZITADEL_VERSION = 'v4.13.1';
const ZITADEL_API_IMAGE = `ghcr.io/zitadel/zitadel:${ZITADEL_VERSION}`;
const ZITADEL_LOGIN_IMAGE = `ghcr.io/zitadel/zitadel-login:${ZITADEL_VERSION}`;
const ZITADEL_DOMAIN = 'localhost';
const POSTGRES_IMAGE = 'postgres:17-alpine';
const MASTERKEY = 'MasterkeyNeedsToHave32Characters';
const TEST_PASSWORD = 'Secr3tP4ssw0rd!';
const MACHINE_KEY_PATH = '/data/machinekey.json';

/**
 * Start Zitadel with PostgreSQL and provision test resources.
 *
 * @param {import('testcontainers').StartedNetwork} network - Docker network
 * @param {object} state - Shared state object for container tracking
 * @param {object} ports - Port allocations from variant.json
 * @returns {Promise<{issuerURL: string, clientID: string, clientSecret: string, users: object[]}>}
 */
export async function startZitadel(network, state, ports) {
  console.log('Starting Zitadel OIDC provider...');

  // Create a temp dir for the machine key file (bind-mounted into Zitadel)
  const keyDir = mkdtempSync(join(tmpdir(), 'zitadel-key-'));

  // 1. Start PostgreSQL for Zitadel
  console.log('  Starting PostgreSQL for Zitadel...');
  const postgres = await new GenericContainer(POSTGRES_IMAGE)
    .withNetwork(network)
    .withNetworkAliases('zitadel-db')
    .withEnvironment({
      POSTGRES_USER: 'zitadel',
      POSTGRES_PASSWORD: 'zitadel',
      POSTGRES_DB: 'zitadel',
    })
    .withHealthCheck({
      test: ['CMD-SHELL', 'pg_isready -U zitadel'],
      interval: 5_000,
      timeout: 3_000,
      retries: 10,
      startPeriod: 5_000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(60_000)
    .start();

  state.zitadelDbId = postgres.getId();
  state.zitadelDbContainer = postgres;
  console.log(`  ✓ PostgreSQL started: ${state.zitadelDbId}`);

  // 2. Create a shared volume for the login client PAT (API writes, Login reads)
  const bootstrapDir = mkdtempSync(join(tmpdir(), 'zitadel-bootstrap-'));

  // 3. Start Zitadel API server
  console.log('  Starting Zitadel API server...');
  const publicURL = `http://${ZITADEL_DOMAIN}:${ports.zitadel}`;
  const zitadelApi = await new GenericContainer(ZITADEL_API_IMAGE)
    .withNetwork(network)
    .withNetworkAliases('zitadel-api')
    .withCommand([
      'start-from-init',
      '--masterkey', MASTERKEY,
      '--tlsMode', 'disabled',
    ])
    .withUser('root')
    .withBindMounts([
      { source: keyDir, target: '/data' },
      { source: bootstrapDir, target: '/zitadel/bootstrap' },
    ])
    .withEnvironment({
      ZITADEL_PORT: '8080',
      ZITADEL_EXTERNALDOMAIN: ZITADEL_DOMAIN,
      ZITADEL_EXTERNALSECURE: 'false',
      ZITADEL_EXTERNALPORT: String(ports.zitadel),
      ZITADEL_TLS_ENABLED: 'false',
      ZITADEL_DATABASE_POSTGRES_HOST: 'zitadel-db',
      ZITADEL_DATABASE_POSTGRES_PORT: '5432',
      ZITADEL_DATABASE_POSTGRES_DATABASE: 'zitadel',
      ZITADEL_DATABASE_POSTGRES_USER_USERNAME: 'zitadel',
      ZITADEL_DATABASE_POSTGRES_USER_PASSWORD: 'zitadel',
      ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE: 'disable',
      ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME: 'zitadel',
      ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD: 'zitadel',
      ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE: 'disable',
      ZITADEL_FIRSTINSTANCE_MACHINEKEYPATH: MACHINE_KEY_PATH,
      ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME: 'admin-sa',
      ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_NAME: 'Admin',
      ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINEKEY_TYPE: '1',
      // Login client PAT for the login app
      ZITADEL_FIRSTINSTANCE_LOGINCLIENTPATPATH: '/zitadel/bootstrap/login-client.pat',
      ZITADEL_FIRSTINSTANCE_ORG_LOGINCLIENT_MACHINE_USERNAME: 'login-client',
      ZITADEL_FIRSTINSTANCE_ORG_LOGINCLIENT_MACHINE_NAME: 'Login Client',
      ZITADEL_FIRSTINSTANCE_ORG_LOGINCLIENT_PAT_EXPIRATIONDATE: '2099-01-01T00:00:00Z',
      // v2 login UI configuration
      ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_REQUIRED: 'true',
      ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_BASEURI: `${publicURL}/ui/v2/login/`,
      ZITADEL_OIDC_DEFAULTLOGINURLV2: `${publicURL}/ui/v2/login/login?authRequest=`,
      ZITADEL_OIDC_DEFAULTLOGOUTURLV2: `${publicURL}/ui/v2/login/logout?post_logout_redirect=`,
    })
    .withHealthCheck({
      test: ['CMD', '/app/zitadel', 'ready'],
      interval: 10_000,
      timeout: 30_000,
      retries: 12,
      startPeriod: 20_000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(120_000)
    .start();

  state.zitadelId = zitadelApi.getId();
  state.zitadelContainer = zitadelApi;
  console.log(`  ✓ Zitadel API started: ${state.zitadelId}`);

  // 4. Start Zitadel Login app (Next.js)
  console.log('  Starting Zitadel Login app...');
  const zitadelLogin = await new GenericContainer(ZITADEL_LOGIN_IMAGE)
    .withNetwork(network)
    .withNetworkAliases('zitadel-login')
    .withUser('root')
    .withBindMounts([
      { source: bootstrapDir, target: '/zitadel/bootstrap', mode: 'ro' },
    ])
    .withEnvironment({
      ZITADEL_API_URL: 'http://zitadel-api:8080',
      NEXT_PUBLIC_BASE_PATH: '/ui/v2/login',
      ZITADEL_SERVICE_USER_TOKEN_FILE: '/zitadel/bootstrap/login-client.pat',
      CUSTOM_REQUEST_HEADERS: `Host:${ZITADEL_DOMAIN},X-Forwarded-Proto:http`,
    })
    .withHealthCheck({
      test: ['CMD', '/bin/sh', '-c', 'node /app/healthcheck.mjs http://localhost:3000/ui/v2/login/healthy'],
      interval: 10_000,
      timeout: 30_000,
      retries: 12,
      startPeriod: 20_000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(120_000)
    .start();

  state.zitadelLoginId = zitadelLogin.getId();
  state.zitadelLoginContainer = zitadelLogin;
  console.log(`  ✓ Zitadel Login started: ${state.zitadelLoginId}`);

  // 5. Start nginx reverse proxy to route between API and Login
  // /ui/v2/login/* → zitadel-login:3000, everything else → zitadel-api:8080
  console.log('  Starting nginx proxy...');
  const nginxConf = `
server {
    listen 80;
    location /ui/v2/login/ {
        proxy_pass http://zitadel-login:3000;
        proxy_set_header Host ${ZITADEL_DOMAIN}:${ports.zitadel};
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-Host ${ZITADEL_DOMAIN}:${ports.zitadel};
    }
    location / {
        proxy_pass http://zitadel-api:8080;
        proxy_set_header Host ${ZITADEL_DOMAIN}:${ports.zitadel};
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-Host ${ZITADEL_DOMAIN}:${ports.zitadel};
        proxy_http_version 1.1;
    }
}`;
  const nginxConfDir = mkdtempSync(join(tmpdir(), 'zitadel-nginx-'));
  writeFileSync(join(nginxConfDir, 'default.conf'), nginxConf);

  const proxy = await new GenericContainer('nginx:alpine')
    .withNetwork(network)
    .withNetworkAliases('zitadel-proxy')
    .withExposedPorts({ container: 80, host: ports.zitadel })
    .withBindMounts([
      { source: join(nginxConfDir, 'default.conf'), target: '/etc/nginx/conf.d/default.conf', mode: 'ro' },
    ])
    .withWaitStrategy(Wait.forHttp('/.well-known/openid-configuration', 80)
      .withHeaders({ Host: `${ZITADEL_DOMAIN}:${ports.zitadel}` })
      .forStatusCode(200))
    .withStartupTimeout(30_000)
    .start();

  state.zitadelProxyId = proxy.getId();
  state.zitadelProxyContainer = proxy;
  console.log(`  ✓ nginx proxy started: ${state.zitadelProxyId}`);

  const issuerURL = `http://${ZITADEL_DOMAIN}:${ports.zitadel}`;
  console.log(`  ✓ Zitadel issuer URL: ${issuerURL}`);

  // 6. Authenticate using the machine key (retry — file may not be written yet, API may need time)
  console.log('  Authenticating with machine key...');
  const machineKeyFile = join(keyDir, 'machinekey.json');
  let adminToken;
  for (let i = 0; i < 20; i++) {
    try {
      const machineKey = JSON.parse(readFileSync(machineKeyFile, 'utf-8'));
      if (!machineKey.keyId || !machineKey.key || !machineKey.userId) {
        throw new Error('Machine key file is incomplete');
      }
      adminToken = await getAdminToken(issuerURL, machineKey);
      break;
    } catch (err) {
      if (i === 19) throw new Error(`Failed to authenticate with machine key after 20 attempts: ${err.message}`);
      if ((i + 1) % 5 === 0) console.log(`  Waiting for machine key / token endpoint... (attempt ${i + 1}/20)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.log('  ✓ Admin token obtained');

  // 7. Get default org ID (retry - management API may need a few seconds after discovery is ready)
  let orgID;
  for (let i = 0; i < 30; i++) {
    try {
      orgID = await getOrgID(issuerURL, adminToken);
      break;
    } catch (err) {
      if (i === 29) throw err;
      if ((i + 1) % 5 === 0) console.log(`  Waiting for Zitadel management API... (attempt ${i + 1}/30)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.log(`  ✓ Org ID: ${orgID}`);

  // 8. Create project with role assertion
  const projectID = await createProject(issuerURL, adminToken);
  console.log(`  ✓ Project created: ${projectID}`);

  // 9. Create project roles
  await createProjectRoles(issuerURL, adminToken, projectID, [
    'platform-admins', 'developers', 'analysts',
  ]);
  console.log('  ✓ Project roles created');

  // 10. Create OIDC app with all possible redirect URIs
  const { clientID, clientSecret } = await createOIDCApp(
    issuerURL, adminToken, projectID,
    [
      `http://localhost:${ports.backend}/auth/callbacks/oidc`,
      `http://127.0.0.1:${ports.backend}/auth/callbacks/oidc`,
      `http://console-backend:3000/auth/callbacks/oidc`,
    ]
  );
  console.log(`  ✓ OIDC app created: ${clientID}`);

  // 11. Create test users and assign roles
  const testUsers = [
    { username: 'admin-user', email: 'admin@zitadel.test', roles: ['platform-admins'] },
    { username: 'editor-user', email: 'editor@zitadel.test', roles: ['developers'] },
    { username: 'viewer-user', email: 'viewer@zitadel.test', roles: ['analysts'] },
    { username: 'denied-user', email: 'denied@zitadel.test', roles: [] },
    { username: 'direct-admin', email: 'direct-admin@zitadel.test', roles: [] },
  ];

  for (const user of testUsers) {
    const userID = await createHumanUser(issuerURL, adminToken, user.username, user.email);
    user.userID = userID;
    if (user.roles.length > 0) {
      await assignUserRoles(issuerURL, adminToken, userID, projectID, user.roles);
    }
    console.log(`  ✓ User created: ${user.username} (${user.roles.join(', ') || 'no roles'})`);
  }

  // 12. Disable MFA prompt in the login policy so tests don't get stuck on 2FA setup
  await apiCall(issuerURL, 'PUT', '/management/v1/policies/login', adminToken, {
    forceMfa: false,
    forceMfaLocalOnly: false,
    passwordlessType: 'PASSWORDLESS_TYPE_NOT_ALLOWED',
    hidePasswordReset: false,
    multiFactors: [],
    secondFactors: [],
  }).catch(err => {
    console.warn('  WARNING: Failed to disable MFA in login policy. OIDC browser tests may hang on 2FA prompts.');
    console.warn('  Error:', err.message);
  });

  // 13. Create Zitadel action to inject flat "groups" claim
  // The function name MUST match the action name for Zitadel to find it.
  // Uses ctx.v1.user.grants.grants (the inner grants array) per Zitadel's API.
  const actionScript = `function groupsClaim(ctx, api) {
  if (ctx.v1.user.grants == undefined || ctx.v1.user.grants.count == 0) {
    return;
  }
  var groups = [];
  ctx.v1.user.grants.grants.forEach(function(grant) {
    if (grant.roles) {
      grant.roles.forEach(function(role) {
        groups.push(role);
      });
    }
  });
  if (groups.length > 0) {
    api.v1.claims.setClaim('groups', groups);
  }
}`;
  const actionID = await createAction(issuerURL, adminToken, 'groupsClaim', actionScript);
  await setActionTrigger(issuerURL, adminToken, actionID);
  console.log('  ✓ Groups claim action configured');

  const result = {
    issuerURL,
    clientID,
    clientSecret,
    projectID,
    users: testUsers,
    adminToken,
    consoleRedirectURL: `http://localhost:${ports.backend}/auth/callbacks/oidc`,
  };

  console.log('✓ Zitadel OIDC provider ready');
  return result;
}

/**
 * Rewrite the Console config YAML with actual Zitadel values.
 */
export function rewriteConsoleConfig(configPath, zitadelConfig) {
  let config = readFileSync(configPath, 'utf-8');
  config = config.replace('__ZITADEL_ISSUER_URL__', zitadelConfig.issuerURL);
  config = config.replace('__ZITADEL_CLIENT_ID__', zitadelConfig.clientID);
  config = config.replace('__ZITADEL_CLIENT_SECRET__', zitadelConfig.clientSecret);
  config = config.replace('__CONSOLE_REDIRECT_URL__', zitadelConfig.consoleRedirectURL || '');

  // Write to a temp file so we don't modify the source
  const tempDir = mkdtempSync(join(tmpdir(), 'console-config-'));
  const tempConfig = join(tempDir, 'console.config.yaml');
  writeFileSync(tempConfig, config);
  return tempConfig;
}

// --- Zitadel API helpers ---

async function apiCall(baseURL, method, path, token, body) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const resp = await fetch(`${baseURL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Zitadel API ${method} ${path} returned ${resp.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getAdminToken(issuerURL, machineKey) {
  // Parse PEM private key
  const privateKey = crypto.createPrivateKey(machineKey.key);

  // Create JWT assertion
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: machineKey.keyId };
  const payload = {
    iss: machineKey.userId,
    sub: machineKey.userId,
    aud: issuerURL,
    iat: now,
    exp: now + 3600,
  };

  const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encHeader}.${encPayload}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), privateKey);
  const assertion = `${signingInput}.${signature.toString('base64url')}`;

  // Exchange for access token
  const resp = await fetch(`${issuerURL}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      scope: 'openid urn:zitadel:iam:org:project:id:zitadel:aud',
      assertion,
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Token exchange failed: ${text}`);
  }
  const parsed = JSON.parse(text);
  if (!parsed.access_token) {
    throw new Error(`Token endpoint returned no access_token: ${text}`);
  }
  return parsed.access_token;
}

async function getOrgID(issuerURL, token) {
  const resp = await apiCall(issuerURL, 'GET', '/management/v1/orgs/me', token);
  return resp.org.id;
}

async function createProject(issuerURL, token) {
  const resp = await apiCall(issuerURL, 'POST', '/management/v1/projects', token, {
    name: 'e2e-test-project',
    projectRoleAssertion: true,
    projectRoleCheck: true,
    hasProjectCheck: false,
    privateLabelingSetting: 'PRIVATE_LABELING_SETTING_UNSPECIFIED',
  });
  return resp.id;
}

async function createProjectRoles(issuerURL, token, projectID, roles) {
  const bulkRoles = roles.map(r => ({ key: r, displayName: r }));
  await apiCall(issuerURL, 'POST', `/management/v1/projects/${projectID}/roles/_bulk`, token, {
    roles: bulkRoles,
  });
}

async function createOIDCApp(issuerURL, token, projectID, redirectURIs) {
  const resp = await apiCall(
    issuerURL, 'POST',
    `/management/v1/projects/${projectID}/apps/oidc`,
    token,
    {
      name: 'console-e2e',
      redirectUris: redirectURIs,
      responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
      grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
      appType: 'OIDC_APP_TYPE_WEB',
      authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
      devMode: true,
      accessTokenType: 'OIDC_TOKEN_TYPE_JWT',
      idTokenRoleAssertion: true,
      idTokenUserinfoAssertion: true,
    }
  );
  return { clientID: resp.clientId, clientSecret: resp.clientSecret };
}

async function createHumanUser(issuerURL, token, username, email) {
  const resp = await apiCall(issuerURL, 'POST', '/v2/users/human', token, {
    username,
    profile: {
      givenName: username,
      familyName: 'Test',
      displayName: username,
    },
    email: {
      email,
      isVerified: true,
    },
    password: {
      password: TEST_PASSWORD,
      changeRequired: false,
    },
  });
  return resp.userId;
}

async function assignUserRoles(issuerURL, token, userID, projectID, roles) {
  await apiCall(issuerURL, 'POST', `/management/v1/users/${userID}/grants`, token, {
    projectId: projectID,
    roleKeys: roles,
  });
}

async function createAction(issuerURL, token, name, script) {
  const resp = await apiCall(issuerURL, 'POST', '/management/v1/actions', token, {
    name,
    script,
    timeout: '10s',
    allowedToFail: false,
  });
  return resp.id;
}

async function setActionTrigger(issuerURL, token, actionID) {
  // Flow type 2 = "Complement Token", Trigger type 5 = "Pre Access Token Creation"
  await apiCall(issuerURL, 'POST', '/management/v1/flows/2/trigger/5', token, {
    actionIds: [actionID],
  });
}

export { TEST_PASSWORD };
