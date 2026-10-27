import { GenericContainer, Network, Wait } from 'testcontainers';

import {
  cleanupSerializedResources,
  cleanupStartedResources,
  createEnvironmentState,
  rememberContainer,
  serializeEnvironmentState,
} from './test-environment-state.mjs';
import { KAFKA_CONNECT_IMAGE, KAFKA_IMAGE, OWL_SHOP_IMAGE, REDPANDA_IMAGE } from './test-images.mjs';
import { exec, execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Regex for extracting container ID from error messages
const CONTAINER_ID_REGEX = /container ([a-f0-9]+)/;
const MISSING_CONTAINER_PATTERN = /No such container/i;
const MISSING_NETWORK_PATTERN = /No such network/i;
// Workspace `use` entries in go.work, one module path per line
const GO_WORK_USE_LINE_REGEX = /^\s+(\S+)\s*$/gm;
const MODULE_PATH_SEPARATOR_REGEX = /[./]/g;
const EDGE_DASHES_REGEX = /^-+|-+$/g;

const REDPANDA_SASL_FLAGS = '-X user=e2euser -X pass=very-secret -X sasl.mechanism=SCRAM-SHA-256';

const KAFKA_CONNECT_CONFIGURATION = `
key.converter=org.apache.kafka.connect.converters.ByteArrayConverter
value.converter=org.apache.kafka.connect.converters.ByteArrayConverter
group.id=connectors-cluster
offset.storage.topic=_internal_connectors_offsets
config.storage.topic=_internal_connectors_configs
status.storage.topic=_internal_connectors_status
config.storage.replication.factor=1
offset.storage.replication.factor=1
status.storage.replication.factor=1
offset.flush.interval.ms=1000
producer.linger.ms=50
producer.batch.size=131072
topic.creation.enable=false
`;

const getStateFile = (variantName) => resolve(__dirname, '..', `.testcontainers-state-${variantName}.json`);

function variantConfigPath(variantName, fileName) {
  return resolve(__dirname, '..', `test-variant-${variantName}`, 'config', fileName);
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

/**
 * Load variant configuration from test-variant-{name}/config/variant.json
 * @param {string} variantName - The variant name (e.g., "console", "console-enterprise")
 * @returns {object} - The variant configuration including ports
 */
function loadVariantConfig(variantName) {
  const variantDir = resolve(__dirname, '..', `test-variant-${variantName}`);
  const configPath = join(variantDir, 'config', 'variant.json');

  if (!existsSync(configPath)) {
    throw new Error(`Variant config not found: ${configPath}`);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  return config;
}

async function probeHostPort(port) {
  try {
    const { stdout } = await execAsync(
      `curl -4 -s -m 5 -o /dev/null -w "%{http_code}" http://localhost:${port}/ || echo "0"`
    );
    const statusCode = Number.parseInt(stdout.trim(), 10);
    return { ready: statusCode > 0 && statusCode < 500, detail: `last status: ${statusCode}` };
  } catch (error) {
    // Port not ready yet
    return { ready: false, detail: `error: ${error.message}` };
  }
}

function waitForPort(port, maxAttempts = 30, delayMs = 500) {
  // Polls recursively: each probe finishes, and the delay elapses, before the next probe starts.
  const pollFrom = async (attempt) => {
    if (attempt >= maxAttempts) {
      throw new Error(`Port ${port} failed to become available after ${maxAttempts} attempts`);
    }
    const probe = await probeHostPort(port);
    if (probe.ready) {
      return true;
    }
    if ((attempt + 1) % 5 === 0) {
      console.log(`  Still waiting for port ${port}... (attempt ${attempt + 1}/${maxAttempts}, ${probe.detail})`);
    }
    await delay(delayMs);
    return pollFrom(attempt + 1);
  };
  return pollFrom(0);
}

/**
 * Retries a command run inside the Docker network until it succeeds or the attempts run out.
 * Exhausting the attempts is not an error: callers continue and rely on later readiness checks.
 */
function waitForInternalProbe(command, { attempts, delayMs, label, logEvery }) {
  // Polls recursively: each probe finishes, and the delay elapses, before the next probe starts.
  const pollFrom = async (attempt) => {
    if (attempt >= attempts) {
      return;
    }
    try {
      await execAsync(command);
    } catch {
      if ((attempt + 1) % logEvery === 0) {
        console.log(`  Still waiting for ${label}... (attempt ${attempt + 1}/${attempts})`);
      }
      await delay(delayMs);
      await pollFrom(attempt + 1);
    }
  };
  return pollFrom(0);
}

async function setupDockerNetwork(state) {
  console.log('Creating Docker network...');
  const network = await new Network().start();
  state.networkId = network.getId();
  state.network = network;
  console.log(`✓ Network created: ${state.networkId}`);
  return network;
}

async function startRedpandaContainer(network, state, ports) {
  console.log('Starting Redpanda container...');
  const redpanda = await new GenericContainer(REDPANDA_IMAGE)
    .withNetwork(network)
    .withNetworkAliases('redpanda')
    .withExposedPorts(
      { container: 19_092, host: ports.redpandaKafka },
      { container: 18_081, host: ports.redpandaSchemaRegistry },
      { container: 18_082, host: ports.redpandaPandaproxy },
      { container: 9644, host: ports.redpandaAdmin }
    )
    .withCommand([
      'redpanda',
      'start',
      '--smp',
      '1',
      '--mode dev-container',
      '--overprovisioned',
      '--kafka-addr',
      'internal://0.0.0.0:9092,external://0.0.0.0:19092',
      '--advertise-kafka-addr',
      'internal://redpanda:9092,external://localhost:19092',
      '--pandaproxy-addr',
      'internal://0.0.0.0:8082,external://0.0.0.0:18082',
      '--advertise-pandaproxy-addr',
      `internal://redpanda:8082,external://localhost:${ports.redpandaPandaproxy}`,
      '--schema-registry-addr',
      'internal://0.0.0.0:8081,external://0.0.0.0:18081',
      '--rpc-addr',
      'redpanda:33145',
      '--advertise-rpc-addr',
      'redpanda:33145',
    ])
    .withEnvironment({
      RP_BOOTSTRAP_USER: 'e2euser:very-secret',
    })
    .withBindMounts([
      {
        source: resolve(__dirname, 'conf/.bootstrap.yaml'),
        target: '/etc/redpanda/.bootstrap.yaml',
      },
    ])
    .withHealthCheck({
      test: ['CMD-SHELL', "rpk cluster health | grep -E 'Healthy:.+true' || exit 1"],
      interval: 10_000,
      timeout: 3000,
      retries: 5,
      startPeriod: 5000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(90_000)
    .start();

  rememberContainer(state, 'redpanda', redpanda);
  console.log(`✓ Redpanda container started: ${state.redpandaId}`);
}

async function verifyRedpandaServices(state, ports) {
  // Docker health check already verified rpk cluster health passed.
  // Just verify Schema Registry is responding (it can lag behind the broker).
  console.log('Checking if Schema Registry is ready...');
  await waitForInternalProbe(
    `docker exec ${state.redpandaId} curl -s -m 3 -o /dev/null -w "%{http_code}" http://localhost:18081/subjects`,
    { attempts: 30, delayMs: 1000, label: 'Schema Registry', logEvery: 5 }
  );
  console.log('✓ Schema Registry is ready');

  // Verify SASL authentication is working
  console.log('Verifying Redpanda SASL authentication...');
  try {
    await execAsync(
      `docker exec ${state.redpandaId} rpk cluster info -X brokers=redpanda:9092 -X user=e2euser -X pass=very-secret -X sasl.mechanism=SCRAM-SHA-256`
    );
    console.log('✓ SASL authentication verified');
  } catch (error) {
    console.log('⚠ SASL authentication check failed:', error.message);
  }
}

async function startKafkaContainer(network, state, ports, variantName) {
  console.log('Starting Apache Kafka container (KRaft, SASL/PLAIN)...');
  const jaasConfPath = resolve(__dirname, '..', `test-variant-${variantName}`, 'config', 'kafka_server_jaas.conf');
  const kafka = await new GenericContainer(KAFKA_IMAGE)
    .withNetwork(network)
    .withNetworkAliases('kafka')
    .withExposedPorts({ container: 9092, host: ports.kafkaKafka })
    .withBindMounts([{ source: jaasConfPath, target: '/etc/kafka/jaas.conf', mode: 'ro' }])
    .withEnvironment({
      KAFKA_NODE_ID: '1',
      KAFKA_PROCESS_ROLES: 'broker,controller',
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:9093',
      KAFKA_LISTENERS: 'SASL_PLAINTEXT://:9092,CONTROLLER://:9093',
      KAFKA_ADVERTISED_LISTENERS: 'SASL_PLAINTEXT://kafka:9092',
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'SASL_PLAINTEXT:SASL_PLAINTEXT,CONTROLLER:PLAINTEXT',
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
      KAFKA_INTER_BROKER_LISTENER_NAME: 'SASL_PLAINTEXT',
      KAFKA_SASL_ENABLED_MECHANISMS: 'PLAIN',
      KAFKA_SASL_MECHANISM_INTER_BROKER_PROTOCOL: 'PLAIN',
      // Enable Kafka Auth BEGIN
      KAFKA_AUTHORIZER_CLASS_NAME: 'org.apache.kafka.metadata.authorizer.StandardAuthorizer',
      KAFKA_SUPER_USERS: 'User:e2euser',
      KAFKA_ALLOW_EVERYONE_IF_NO_ACL_FOUND: 'true',
      // Enable Kafka Auth END
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true',
      CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk',
      KAFKA_OPTS: '-Djava.security.auth.login.config=/etc/kafka/jaas.conf',
    })
    .withWaitStrategy(Wait.forLogMessage(/Kafka Server started/i))
    .withStartupTimeout(120_000)
    .start();

  rememberContainer(state, 'kafka', kafka);
  console.log(`✓ Apache Kafka container started: ${state.kafkaId}`);
}

async function startOwlShop(network, state) {
  console.log('Starting OwlShop container...');
  const owlshopConfigContent = `
shop:
  requestRate: 1
  interval: 0.1s
  topicReplicationFactor: 1
  topicPartitionCount: 1
kafka:
  brokers: "redpanda:9092"
  sasl:
    enabled: true
    mechanism: SCRAM-SHA-256
    username: e2euser
    password: very-secret
schemaRegistry:
  address: "http://redpanda:8081"
`;

  const owlshop = await new GenericContainer(OWL_SHOP_IMAGE)
    .withPlatform('linux/amd64')
    .withNetwork(network)
    .withNetworkAliases('owlshop')
    .withEnvironment({
      CONFIG_FILEPATH: '/tmp/config.yml',
      OWLSHOP_CONFIG_FILE: owlshopConfigContent,
    })
    .withEntrypoint(['/bin/sh'])
    .withCommand(['-c', 'echo "$OWLSHOP_CONFIG_FILE" > /tmp/config.yml && /app/owlshop'])
    .withStartupTimeout(120_000)
    .start();

  rememberContainer(state, 'owlshop', owlshop);
  console.log(`✓ OwlShop started: ${state.owlshopId}`);
}

async function createInternalTopic(state, topic, { compact }) {
  const policyFlags = compact ? '--topic-config cleanup.policy=compact ' : '';
  try {
    await execAsync(
      `docker exec ${state.redpandaId} rpk topic create ${topic} --replicas 1 --partitions 1 ${policyFlags}${REDPANDA_SASL_FLAGS}`
    );
    console.log(`  ✓ Created topic: ${topic}${compact ? ' (compact)' : ''}`);
  } catch (_error) {
    console.log(`  - Topic ${topic} already exists or creation skipped`);
  }
}

async function createKafkaConnectTopics(state) {
  console.log('Pre-creating Kafka Connect internal topics...');

  // Kafka Connect internal storage topics must have cleanup.policy=compact
  const compactTopics = ['_internal_connectors_offsets', '_internal_connectors_configs', '_internal_connectors_status'];
  // Log topic uses default delete policy
  const deleteTopics = ['__redpanda.connectors_logs'];

  // The topics are independent and createInternalTopic handles its own failures, so they are created
  // concurrently; every creation still finishes before Kafka Connect starts.
  await Promise.all([
    ...compactTopics.map((topic) => createInternalTopic(state, topic, { compact: true })),
    ...deleteTopics.map((topic) => createInternalTopic(state, topic, { compact: false })),
  ]);
}

// Write SASL password to a temp file so it can be mounted into the container.
// The Redpanda Connectors image reads the password from a file at
// /opt/kafka/connect-password/${CONNECT_SASL_PASSWORD_FILE} — passing SASL
// settings via CONNECT_CONFIGURATION doesn't work because the config generator
// appends security.protocol=PLAINTEXT after the user-provided config, overriding it.
function writeKafkaConnectPasswordFile() {
  const passwordFile = resolve(__dirname, '.connect-sasl-password.tmp');
  writeFileSync(passwordFile, 'very-secret');
  return passwordFile;
}

function startKafkaConnectContainer(network, ports, passwordFile) {
  return (
    new GenericContainer(KAFKA_CONNECT_IMAGE)
      .withPlatform('linux/amd64')
      .withNetwork(network)
      .withNetworkAliases('connect')
      .withExposedPorts({ container: 8083, host: ports.kafkaConnect })
      .withBindMounts([
        {
          source: passwordFile,
          target: '/opt/kafka/connect-password/e2e-password',
          mode: 'ro',
        },
      ])
      .withEnvironment({
        CONNECT_CONFIGURATION: KAFKA_CONNECT_CONFIGURATION,
        CONNECT_BOOTSTRAP_SERVERS: 'redpanda:9092',
        CONNECT_SASL_MECHANISM: 'SCRAM-SHA-256',
        CONNECT_SASL_USERNAME: 'e2euser',
        CONNECT_SASL_PASSWORD_FILE: 'e2e-password',
        CONNECT_GC_LOG_ENABLED: 'false',
        CONNECT_HEAP_OPTS: '-Xms512M -Xmx512M',
        CONNECT_LOG_LEVEL: 'info',
        CONNECT_TOPIC_LOG_ENABLED: 'true',
      })
      // Use log-based wait: avoids IPv4/IPv6 port-forwarding issues on macOS Docker Desktop.
      // Kafka Connect prints "REST resources initialized" when the HTTP API is ready.
      .withWaitStrategy(Wait.forLogMessage(/.*REST resources initialized.*/i))
      .withStartupTimeout(300_000)
      .start()
  );
}

async function waitForKafkaConnectApi(state, ports) {
  // Verify it's responding via docker exec (avoids macOS Docker Desktop port-forwarding latency)
  console.log('Verifying Kafka Connect API...');
  await waitForInternalProbe(
    `docker exec ${state.redpandaId} curl -s -m 5 -o /dev/null -w "%{http_code}" http://connect:8083/`,
    { attempts: 30, delayMs: 2000, label: 'Kafka Connect API', logEvery: 5 }
  );
  console.log('✓ Kafka Connect API ready (internal)');

  // Also wait for the host port to be forwarded (needed for tests that POST directly to the API)
  console.log(`Waiting for Kafka Connect host port ${ports.kafkaConnect}...`);
  await waitForPort(ports.kafkaConnect, 60, 2000);
  console.log(`✓ Kafka Connect host port ${ports.kafkaConnect} ready`);
}

async function printKafkaConnectLogs(connect, state) {
  try {
    const containerId = connect.getId();
    rememberContainer(state, 'connect', connect);
    console.log(`\n  Container ID: ${containerId}`);
    console.log('  Last 50 lines of Kafka Connect logs:');
    const { stdout } = await execAsync(`docker logs --tail 50 ${containerId}`);
    console.log(stdout);
  } catch {
    console.log('  Could not retrieve container logs');
  }
}

async function reportKafkaConnectFailure(error, connect, state) {
  console.log('⚠ Kafka Connect failed to start (connector tests may fail)');
  console.log(`  Error: ${error.message}`);

  // Try to get container ID and logs for debugging
  if (connect) {
    await printKafkaConnectLogs(connect, state);
  } else {
    console.log('  Container failed to start - no logs available');
  }
}

async function startKafkaConnect(network, state, ports) {
  console.log('Starting Kafka Connect container...');

  const passwordFile = writeKafkaConnectPasswordFile();

  let connect;
  try {
    connect = await startKafkaConnectContainer(network, ports, passwordFile);

    rememberContainer(state, 'connect', connect);
    console.log(`✓ Kafka Connect container started: ${state.connectId}`);

    await waitForKafkaConnectApi(state, ports);
  } catch (error) {
    await reportKafkaConnectFailure(error, connect, state);
  } finally {
    rmSync(passwordFile, { force: true });
  }
}

function attemptCleanup(errors, cleanup) {
  try {
    cleanup();
  } catch (error) {
    errors.push(error);
  }
}

function restoreGoWork(backendDir, originalGoWork) {
  writeFileSync(join(backendDir, 'go.work'), originalGoWork);
  console.log('  ✓ Restored original go.work');
}

function cleanupWorkspaceBuild(errors, { backendDir, originalGoWork, workspaceDir }) {
  attemptCleanup(errors, () => rmSync(workspaceDir, { force: true, recursive: true }));
  if (originalGoWork !== null) {
    attemptCleanup(errors, () => restoreGoWork(backendDir, originalGoWork));
  }
}

function removeCopiedFrontendAssets(embedDir) {
  // Keep .gitignore, remove everything else.
  if (existsSync(embedDir)) {
    for (const entry of readdirSync(embedDir)) {
      if (entry !== '.gitignore') {
        rmSync(join(embedDir, entry), { force: true, recursive: true });
      }
    }
  }
}

function cleanupBackendBuild({ backendDir, embedDir, originalGoWork, tempDockerfile, workspaceDir }) {
  const errors = [];

  if (tempDockerfile) {
    attemptCleanup(errors, () => rmSync(tempDockerfile, { force: true }));
  }
  if (workspaceDir) {
    cleanupWorkspaceBuild(errors, { backendDir, originalGoWork, workspaceDir });
  }
  if (embedDir) {
    console.log('Cleaning up copied frontend assets...');
    attemptCleanup(errors, () => removeCopiedFrontendAssets(embedDir));
  }

  return errors;
}

function resolveBackendDir(isEnterprise) {
  let backendDir;
  if (isEnterprise) {
    // Check for ENTERPRISE_BACKEND_DIR environment variable
    if (process.env.ENTERPRISE_BACKEND_DIR) {
      backendDir = resolve(process.env.ENTERPRISE_BACKEND_DIR);
      console.log(`Using ENTERPRISE_BACKEND_DIR from environment: ${backendDir}`);
    } else {
      // Default to relative path
      backendDir = resolve(__dirname, '../../../../console-enterprise/backend');
    }
  } else {
    backendDir = resolve(__dirname, '../../../backend');
  }

  // Resolve symlinks to real path (needed for Docker build context)
  if (existsSync(backendDir)) {
    backendDir = realpathSync(backendDir);
  }
  return backendDir;
}

function resolveFrontendBuildDir(backendDir, isEnterprise) {
  // Copy frontend assets before build (required for both OSS and Enterprise)
  // The pkg/embed/frontend/ directory has .gitignore with *, so assets don't exist in CI
  if (isEnterprise && !existsSync(backendDir)) {
    throw new Error(
      `Enterprise backend directory not found: ${backendDir}\nEnterprise E2E tests require console-enterprise repo to be checked out alongside console repo.`
    );
  }

  const frontendBuildDir = resolve(__dirname, '../../build');

  // Check if frontend build exists
  if (!existsSync(frontendBuildDir)) {
    throw new Error(
      `Frontend build directory not found: ${frontendBuildDir}\nRun "bun run build" before running E2E tests.`
    );
  }
  return frontendBuildDir;
}

async function copyFrontendAssets(build, frontendBuildDir, isEnterprise) {
  build.embedDir = join(build.backendDir, 'pkg/embed/frontend');

  console.log(`Copying frontend assets to ${isEnterprise ? 'enterprise' : 'OSS'} backend...`);
  console.log(`  From: ${frontendBuildDir}`);
  console.log(`  To: ${build.embedDir}`);

  // Copy all files from build/ to pkg/embed/frontend/
  await execAsync(`cp -r "${frontendBuildDir}"/* "${build.embedDir}"/`);
  console.log('✓ Frontend assets copied');
}

// Detect and recover from a corrupted go.work left by a previous interrupted run.
// A corrupted go.work references .e2e-workspace/ paths that no longer exist on disk.
// In that case, use go.ci.work (the canonical workspace template) as the base instead.
function resetStaleGoWork(build) {
  const ciWorkPath = join(build.backendDir, 'go.ci.work');
  if (existsSync(ciWorkPath)) {
    console.warn(
      '  go.work contains stale .e2e-workspace/ paths (leftover from previous run). Resetting from go.ci.work...'
    );
    build.originalGoWork = readFileSync(ciWorkPath, 'utf-8');
    writeFileSync(join(build.backendDir, 'go.work'), build.originalGoWork);
    console.log('  ✓ Reset go.work from go.ci.work');
  } else {
    throw new Error(
      'go.work contains stale .e2e-workspace/ references but go.ci.work was not found to recover from. ' +
        'Please restore go.work manually.'
    );
  }
}

// Resolve the actual path relative to backendDir, or fall back to the
// repo root (parent of backendDir). go.work paths like ../console/backend
// are authored relative to the repo root, not the backend/ subdir.
function resolveWorkspaceModulePath(backendDir, modulePath) {
  const absModulePath = resolve(backendDir, modulePath);
  if (existsSync(absModulePath)) {
    return absModulePath;
  }
  const parentDir = resolve(backendDir, '..');
  const fromParent = resolve(parentDir, modulePath);
  if (existsSync(fromParent)) {
    console.log(`  Resolving ${modulePath} from repo root: ${fromParent}`);
    return fromParent;
  }
  console.warn(`  Workspace module not found: ${absModulePath} (also tried ${fromParent}), skipping`);
  return null;
}

async function copyWorkspaceModule(workspaceDir, modulePath, absModulePath) {
  // Create a sanitized directory name
  const localName = modulePath.replace(MODULE_PATH_SEPARATOR_REGEX, '-').replace(EDGE_DASHES_REGEX, '');
  const destPath = join(workspaceDir, localName);

  console.log(`  Copying workspace module: ${modulePath} -> .e2e-workspace/${localName}`);
  await execAsync(`mkdir -p "${destPath}" && cp -r "${absModulePath}"/* "${destPath}"/`);
  return { original: modulePath, local: `.e2e-workspace/${localName}` };
}

async function copyWorkspaceModules(backendDir, workspaceDir, goWork) {
  // Parse workspace module paths (skip "." which is the backend itself)
  const modulePaths = Array.from(goWork.matchAll(GO_WORK_USE_LINE_REGEX), ([, modulePath]) => modulePath).filter(
    (modulePath) => !(modulePath === '.' || modulePath === 'use' || modulePath === '(' || modulePath === ')')
  );
  const rewrittenPaths = [];
  // Copy one module at a time: after a failed copy no other copy may still be writing into
  // .e2e-workspace when cleanupWorkspaceBuild removes it.
  await modulePaths.reduce(
    (previousCopy, modulePath) =>
      previousCopy.then(async () => {
        const absModulePath = resolveWorkspaceModulePath(backendDir, modulePath);
        if (absModulePath) {
          rewrittenPaths.push(await copyWorkspaceModule(workspaceDir, modulePath, absModulePath));
        }
      }),
    Promise.resolve()
  );
  return rewrittenPaths;
}

function rewriteGoWork(backendDir, goWork, rewrittenPaths) {
  let newGoWork = goWork;
  for (const { original, local } of rewrittenPaths) {
    newGoWork = newGoWork.replace(original, local);
  }
  writeFileSync(join(backendDir, 'go.work'), newGoWork);
  console.log('  ✓ Rewrote go.work with local paths');
}

async function prepareWorkspaceBuild(build) {
  console.log('Workspace build detected (go.work found)');
  build.originalGoWork = readFileSync(join(build.backendDir, 'go.work'), 'utf-8');

  const hasStaleWorkspacePaths = build.originalGoWork.includes('.e2e-workspace/');
  if (hasStaleWorkspacePaths) {
    resetStaleGoWork(build);
  }

  const rewrittenPaths = await copyWorkspaceModules(build.backendDir, build.workspaceDir, build.originalGoWork);

  // Rewrite go.work to use local paths
  if (rewrittenPaths.length > 0) {
    rewriteGoWork(build.backendDir, build.originalGoWork, rewrittenPaths);
  }
}

async function runDockerBuild(backendDir, dockerfilePath, tempDockerfile, imageTag) {
  console.log('Building Docker image with BuildKit...');
  await execAsync(`cp "${dockerfilePath}" "${tempDockerfile}"`);
  // Use docker buildx with BuildKit cache mounts for Go module and build caches.
  // This is significantly faster than testcontainers build on repeat runs.
  await execAsync(`DOCKER_BUILDKIT=1 docker build -f .dockerfile.e2e.tmp -t ${imageTag} .`, {
    cwd: backendDir,
    maxBuffer: 50 * 1024 * 1024,
  });
  console.log('✓ Backend image built');
}

/**
 * Runs every build step, recording each temporary artifact on `build` as soon as it
 * exists so cleanup can undo exactly what a failed step left behind.
 */
async function buildImageInContext(build, isEnterprise, imageTag) {
  const frontendBuildDir = resolveFrontendBuildDir(build.backendDir, isEnterprise);
  await copyFrontendAssets(build, frontendBuildDir, isEnterprise);

  // Build Docker image using testcontainers
  // Docker doesn't allow Dockerfiles to reference files outside build context,
  // so we temporarily copy the Dockerfile into the build context
  const dockerfilePath = resolve(__dirname, 'Dockerfile.backend');
  build.tempDockerfile = join(build.backendDir, '.dockerfile.e2e.tmp');

  // For enterprise workspace builds (go.work exists), the workspace references
  // modules outside the backend/ directory (e.g., ../console-oss/backend).
  // We copy those into the build context and rewrite go.work to use local paths.
  const isWorkspaceBuild = isEnterprise && existsSync(join(build.backendDir, 'go.work'));
  build.workspaceDir = isWorkspaceBuild ? join(build.backendDir, '.e2e-workspace') : null;

  if (isWorkspaceBuild) {
    await prepareWorkspaceBuild(build);
  }

  await runDockerBuild(build.backendDir, dockerfilePath, build.tempDockerfile, imageTag);
}

function throwBackendBuildFailures(buildError, cleanupErrors) {
  if (buildError) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError([buildError, ...cleanupErrors], 'Backend build and cleanup both failed');
    }
    throw buildError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Failed to clean up the Playwright backend build');
  }
}

async function buildImageWithCleanup(build, isEnterprise, imageTag) {
  let buildError = null;
  try {
    await buildImageInContext(build, isEnterprise, imageTag);
  } catch (error) {
    buildError = error;
  }

  throwBackendBuildFailures(buildError, cleanupBackendBuild(build));
}

export async function buildBackendImage(isEnterprise) {
  console.log(`Building backend Docker image ${isEnterprise ? '(Enterprise)' : '(OSS)'}...`);

  const backendDir = resolveBackendDir(isEnterprise);

  const imageTag = isEnterprise ? 'console-backend:e2e-test-enterprise' : 'console-backend:e2e-test';

  console.log(`Building from: ${backendDir}`);

  const build = { backendDir, embedDir: null, originalGoWork: null, tempDockerfile: null, workspaceDir: null };
  await buildImageWithCleanup(build, isEnterprise, imageTag);

  console.log('✓ Cleanup complete');
  return imageTag;
}

/**
 * Resolves the environment for the Console Enterprise backend container.
 *
 * By default the enterprise backend runs without a Console license. Its config
 * has no `licenseFilepath`, so Console asks the Redpanda cluster for its license
 * and picks up the built-in 30-day trial that every fresh cluster starts with
 * (Redpanda >= 24.3). The e2e clusters are created from scratch on every run,
 * so that trial is always valid and CI needs no license secret.
 *
 * Set REDPANDA_LICENSE_PATH to a license file to run against a real license
 * instead, e.g. for license-specific tests. Its contents are passed to Console
 * through the REDPANDA_LICENSE environment variable the backend reads at startup.
 *
 * @returns {Record<string, string>} Environment variables for the backend container
 */
function resolveEnterpriseLicenseEnv() {
  const licensePath = process.env.REDPANDA_LICENSE_PATH;
  if (!licensePath) {
    console.log("No REDPANDA_LICENSE_PATH set, Console will use the Redpanda cluster's built-in trial license");
    return {};
  }
  if (!existsSync(licensePath)) {
    throw new Error(`REDPANDA_LICENSE_PATH is set but no file exists at: ${licensePath}`);
  }
  console.log(`Using Console Enterprise license from REDPANDA_LICENSE_PATH: ${licensePath}`);
  return { REDPANDA_LICENSE: readFileSync(licensePath, 'utf-8').trim() };
}

function consoleConfigMounts(configPath) {
  return [
    {
      source: configPath,
      target: '/etc/console/config.yaml',
      mode: 'ro',
    },
  ];
}

function logBackendStartHeader(imageTag, isEnterprise, backendConfigPath) {
  console.log('Starting backend server container...');
  console.log(`Image tag: ${imageTag}`);
  console.log(`Enterprise mode: ${isEnterprise}`);
  console.log(`Backend config path: ${backendConfigPath}`);
}

function logBindMounts(bindMounts) {
  console.log('Creating container with bind mounts:');
  bindMounts.forEach((mount, i) => {
    console.log(`  [${i}] ${mount.source} -> ${mount.target}`);
  });
}

function logBackendContainerSummary(network, ports) {
  console.log('Starting container...');
  console.log('Configuration summary:');
  console.log(`  - Network: ${network.getId ? network.getId() : 'unknown'}`);
  console.log('  - Alias: console-backend');
  console.log(`  - Port: ${ports.backend}:3000`);
  console.log('  - Command: --config.filepath=/etc/console/config.yaml');
}

function createBackendContainer({ bindMounts, environment, imageTag, network, ports }) {
  return (
    new GenericContainer(imageTag)
      .withNetwork(network)
      .withNetworkAliases('console-backend')
      .withNetworkMode(network.getName())
      .withExposedPorts({ container: 3000, host: ports.backend })
      .withBindMounts(bindMounts)
      .withEnvironment(environment)
      .withCommand(['--config.filepath=/etc/console/config.yaml'])
      // Testcontainers 12 prefers an image healthcheck when present. Preserve
      // the backend's established port-readiness contract across the upgrade.
      .withWaitStrategy(Wait.forListeningPorts())
  );
}

async function printFailedContainerLogs(containerId) {
  // Get logs from this container
  console.log('Fetching logs from failed container...');
  const { stdout: logs } = await execAsync(`docker logs ${containerId} 2>&1`);
  console.log('=== CONTAINER LOGS START ===');
  console.log(logs || '(no logs)');
  console.log('=== CONTAINER LOGS END ===');
}

async function printFailedContainerState(containerId) {
  // Get container state
  console.log('Fetching container state...');
  const { stdout: stateJson } = await execAsync(`docker inspect ${containerId} --format='{{json .State}}'`);
  console.log('Container state:');
  const containerState = JSON.parse(stateJson);
  console.log(JSON.stringify(containerState, null, 2));
}

async function printFailedContainerConfig(containerId) {
  // Get container config to see the actual command and mounts
  console.log('Fetching container config...');
  const { stdout: configJson } = await execAsync(`docker inspect ${containerId} --format='{{json .Config}}'`);
  const config = JSON.parse(configJson);
  console.log('Container command:', config.Cmd);
  console.log('Container entrypoint:', config.Entrypoint);
}

async function printFailedContainerMounts(containerId) {
  // Get mount info
  console.log('Fetching mount info...');
  const { stdout: mountsJson } = await execAsync(`docker inspect ${containerId} --format='{{json .Mounts}}'`);
  const mounts = JSON.parse(mountsJson);
  console.log('Container mounts:');
  console.log(JSON.stringify(mounts, null, 2));
}

async function printFailedBackendDiagnostics(containerId) {
  try {
    await printFailedContainerLogs(containerId);
    await printFailedContainerState(containerId);
    await printFailedContainerConfig(containerId);
    await printFailedContainerMounts(containerId);
  } catch (inspectError) {
    console.error('Failed to inspect container:', inspectError.message);
  }
}

async function reportBackendStartError(startError, state, attempt) {
  console.error('Error during container.start():', startError.message);

  // Extract container ID from error message if available
  const containerIdMatch = startError.message.match(CONTAINER_ID_REGEX);
  const failedContainerId = containerIdMatch ? containerIdMatch[1] : null;

  if (failedContainerId) {
    console.log(`Container ID from error: ${failedContainerId}`);
    attempt.containerId = failedContainerId;
    state.backendId = failedContainerId;
    await printFailedBackendDiagnostics(failedContainerId);
  } else {
    console.log('Could not extract container ID from error message');
    console.log('Full error:', JSON.stringify(startError, null, 2));
  }
}

async function startBackendContainer(container, state, attempt) {
  try {
    const backend = await container.start();
    attempt.containerId = backend.getId();
    rememberContainer(state, 'backend', backend);
    console.log(`✓ Container.start() returned with ID: ${attempt.containerId}`);
  } catch (startError) {
    await reportBackendStartError(startError, state, attempt);
    throw startError;
  }
}

async function printStoppedBackendContainer(containerId, containerStatus) {
  console.error(`Container is not running (status: ${containerStatus})`);
  console.log('Fetching container logs...');
  const { stdout: logs } = await execAsync(`docker logs ${containerId} 2>&1`);
  console.log('Container logs:');
  console.log(logs);

  // Get exit code
  const { stdout: exitCode } = await execAsync(`docker inspect ${containerId} --format='{{.State.ExitCode}}'`);
  console.log(`Container exit code: ${exitCode.trim()}`);
}

async function ensureBackendContainerRunning(containerId) {
  // Check if container is still running
  const { stdout: inspectOutput } = await execAsync(`docker inspect ${containerId} --format='{{.State.Status}}'`);
  const containerStatus = inspectOutput.trim();
  console.log(`Container status: ${containerStatus}`);

  if (containerStatus !== 'running') {
    await printStoppedBackendContainer(containerId, containerStatus);
    throw new Error(`Container stopped immediately with status: ${containerStatus}`);
  }
}

async function printInitialBackendLogs(containerId) {
  // Get initial logs to see startup
  console.log('Fetching initial container logs...');
  const { stdout: logs } = await execAsync(`docker logs ${containerId} 2>&1 | tail -30`);
  if (logs) {
    console.log('Container logs:');
    console.log(logs);
  }
}

async function waitForBackendReady(state, ports) {
  // Wait for backend via docker exec (avoids macOS Docker Desktop port-forwarding latency)
  console.log('Waiting for backend to be ready (internal port 3000)...');
  await waitForInternalProbe(
    `docker exec ${state.redpandaId} curl -s -m 5 -o /dev/null -w "%{http_code}" http://console-backend:3000/`,
    { attempts: 90, delayMs: 2000, label: 'backend', logEvery: 10 }
  );
  console.log('✓ Backend ready (internal)');

  // Also wait for host port to be forwarded (browser navigates to localhost:port)
  console.log(`Waiting for backend host port ${ports.backend}...`);
  await waitForPort(ports.backend, 90, 2000);
  console.log(`✓ Backend host port ${ports.backend} ready`);
}

async function launchBackendContainer(options) {
  const { attempt, network, ports, state } = options;
  logBackendContainerSummary(network, ports);

  // Create container without wait strategy first to get the ID immediately
  const container = createBackendContainer(options);

  console.log('Calling container.start()...');
  await startBackendContainer(container, state, attempt);
  console.log(`Container created with ID: ${attempt.containerId}`);

  await ensureBackendContainerRunning(attempt.containerId);
  console.log(`✓ Backend container started and running: ${attempt.containerId}`);

  await printInitialBackendLogs(attempt.containerId);
  await waitForBackendReady(state, ports);
}

async function printBackendFailureLogs(containerId) {
  try {
    console.log('Attempting to fetch logs from failed container...');
    const { stdout: logs } = await execAsync(`docker logs ${containerId} 2>&1`);
    console.log('Full container logs:');
    console.log(logs);

    // Get container inspect info
    const { stdout: inspect } = await execAsync(`docker inspect ${containerId}`);
    console.log('Container inspect (state):');
    const inspectJson = JSON.parse(inspect);
    console.log(JSON.stringify(inspectJson[0].State, null, 2));
  } catch (logError) {
    console.error('Could not fetch logs:', logError.message);
  }
}

async function reportBackendStartFailure(error, containerId) {
  console.error('Failed to start backend container:', error.message);

  // Try to get container logs if container was created but failed
  if (containerId) {
    await printBackendFailureLogs(containerId);
  }
}

async function startBackendServer(network, isEnterprise, imageTag, state, variantName, configFile, ports) {
  const backendConfigPath = variantConfigPath(variantName, configFile);
  logBackendStartHeader(imageTag, isEnterprise, backendConfigPath);

  const bindMounts = consoleConfigMounts(backendConfigPath);

  const environment = isEnterprise ? resolveEnterpriseLicenseEnv() : {};

  logBindMounts(bindMounts);

  // Tracks the container ID as soon as it is known, so a failure at any later step can fetch its logs.
  const attempt = { containerId: undefined };
  try {
    await launchBackendContainer({ attempt, bindMounts, environment, imageTag, network, ports, state });
  } catch (error) {
    await reportBackendStartFailure(error, attempt.containerId);
    throw error;
  }
}

async function startDestinationRedpandaContainer(network, state, ports) {
  console.log('Starting destination Redpanda container for shadowlink...');
  const destRedpanda = await new GenericContainer(REDPANDA_IMAGE)
    .withNetwork(network)
    .withNetworkAliases('dest-cluster')
    .withExposedPorts(
      { container: 19_093, host: ports.destRedpandaKafka },
      { container: 18_091, host: ports.destRedpandaSchemaRegistry },
      { container: 18_092, host: ports.destRedpandaPandaproxy },
      { container: 9644, host: ports.destRedpandaAdmin }
    )
    .withCommand([
      'redpanda',
      'start',
      '--smp',
      '1',
      '--mode dev-container',
      '--overprovisioned',
      '--kafka-addr',
      'internal://0.0.0.0:9092,external://0.0.0.0:19093',
      '--advertise-kafka-addr',
      'internal://dest-cluster:9092,external://localhost:19093',
      '--pandaproxy-addr',
      'internal://0.0.0.0:8082,external://0.0.0.0:18092',
      '--advertise-pandaproxy-addr',
      `internal://dest-cluster:8082,external://localhost:${ports.destRedpandaPandaproxy}`,
      '--schema-registry-addr',
      'internal://0.0.0.0:8081,external://0.0.0.0:18091',
      '--rpc-addr',
      'dest-cluster:33145',
      '--advertise-rpc-addr',
      'dest-cluster:33145',
    ])
    .withEnvironment({
      RP_BOOTSTRAP_USER: 'e2euser:very-secret',
    })
    .withBindMounts([
      {
        source: resolve(__dirname, 'conf/.bootstrap-dest.yaml'),
        target: '/etc/redpanda/.bootstrap.yaml',
      },
    ])
    .withHealthCheck({
      test: ['CMD-SHELL', "rpk cluster health | grep -E 'Healthy:.+true' || exit 1"],
      interval: 15_000,
      timeout: 3000,
      retries: 5,
      startPeriod: 5000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(120_000)
    .start();

  rememberContainer(state, 'destRedpanda', destRedpanda);
  console.log(`✓ Destination Redpanda container started: ${state.destRedpandaId}`);

  // Debug: Check port mappings
  try {
    const { stdout: portOutput } = await execAsync(`docker port ${state.destRedpandaId}`);
    console.log('Destination container port mappings:');
    console.log(portOutput);
  } catch (e) {
    console.log('Could not get port mappings:', e.message);
  }
}

async function printDestinationContainerStatus(state) {
  // Debug: Check if container is still running
  try {
    const { stdout: status } = await execAsync(`docker inspect ${state.destRedpandaId} --format='{{.State.Status}}'`);
    console.log(`Destination container status: ${status.trim()}`);
    if (status.trim() !== 'running') {
      const { stdout: logs } = await execAsync(`docker logs ${state.destRedpandaId} 2>&1 | tail -30`);
      console.log('Destination container logs:');
      console.log(logs);
    }
  } catch (e) {
    console.log('Could not check container status:', e.message);
  }
}

async function verifyDestinationRedpandaServices(state, ports) {
  console.log('Waiting for destination Redpanda services...');

  await printDestinationContainerStatus(state);

  console.log(`Checking destination Admin API (port ${ports.destRedpandaAdmin})...`);
  await waitForPort(ports.destRedpandaAdmin, 60, 2000);
  console.log('✓ Destination Admin API ready');

  console.log(`Checking destination Schema Registry (port ${ports.destRedpandaSchemaRegistry})...`);
  await waitForPort(ports.destRedpandaSchemaRegistry, 60, 2000);
  console.log('✓ Destination Schema Registry ready');
}

function bufferContainerOutput(lines) {
  return (stream) => {
    stream.on('data', (line) => lines.push(String(line)));
    stream.on('err', (line) => lines.push(String(line)));
  };
}

async function assertConfiguredBackendRunning(containerId) {
  // Check if container is still running
  const { stdout: status } = await execAsync(`docker inspect ${containerId} --format='{{.State.Status}}'`);
  if (status.trim() !== 'running') {
    const { stdout: logs } = await execAsync(`docker logs ${containerId} 2>&1`);
    const { stdout: exitCode } = await execAsync(`docker inspect ${containerId} --format='{{.State.ExitCode}}'`);
    console.error(`Container ${containerId} stopped (exit ${exitCode.trim()}):`);
    console.error(logs);
    throw new Error(`Container stopped immediately with status: ${status.trim()}`);
  }
}

async function launchConfiguredBackend({
  attempt,
  bindMounts,
  environment,
  externalPort,
  imageTag,
  network,
  networkAlias,
  state,
  stateSlot,
}) {
  const backend = await new GenericContainer(imageTag)
    .withNetwork(network)
    .withNetworkAliases(networkAlias)
    .withExposedPorts({ container: 3000, host: externalPort })
    .withBindMounts(bindMounts)
    .withEnvironment(environment)
    .withCommand(['--config.filepath=/etc/console/config.yaml'])
    .withLogConsumer(bufferContainerOutput(attempt.startupLogs))
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  attempt.containerId = backend.getId();
  rememberContainer(state, stateSlot, backend);

  await delay(2000);

  await assertConfiguredBackendRunning(attempt.containerId);

  await waitForPort(externalPort, 60, 1000);
  console.log(`✓ Backend ready at http://localhost:${externalPort}`);
}

async function printContainerStateDiagnostics(containerId) {
  try {
    const { stdout: inspect } = await execAsync(`docker inspect ${containerId}`);
    const inspectJson = JSON.parse(inspect);
    console.error('Container state:', JSON.stringify(inspectJson[0].State, null, 2));
  } catch (logError) {
    console.error('Could not fetch container diagnostics:', logError.message);
  }
}

async function reportConfiguredBackendFailure(error, { attempt, externalPort, imageTag }) {
  console.error(`Failed to start backend on port ${externalPort}:`, error.message);

  // The buffered log stream is the reliable record: when `.start()` throws, Ryuk reaps the
  // container almost immediately, so `docker logs` against it races removal and loses.
  if (attempt.startupLogs.length > 0) {
    console.error(`Backend container output (${imageTag}):`);
    console.error(attempt.startupLogs.join(''));
  }

  if (attempt.containerId) {
    await printContainerStateDiagnostics(attempt.containerId);
  }
}

async function startBackendServerWithConfig({
  configPath,
  externalPort,
  imageTag,
  isEnterprise,
  network,
  networkAlias,
  state,
  stateSlot = 'backend',
}) {
  console.log(`Starting backend server container on port ${externalPort} with alias ${networkAlias}...`);

  const bindMounts = consoleConfigMounts(configPath);

  const environment = isEnterprise ? resolveEnterpriseLicenseEnv() : {};

  // Buffer the container's own output from the moment it starts: when the backend crashes
  // during startup, `.start()` throws and Ryuk reaps the container before `docker logs` can
  // reach it — this live stream is the only record of WHY the backend died.
  const attempt = { containerId: undefined, startupLogs: [] };
  try {
    await launchConfiguredBackend({
      attempt,
      bindMounts,
      environment,
      externalPort,
      imageTag,
      network,
      networkAlias,
      state,
      stateSlot,
    });
  } catch (error) {
    await reportConfiguredBackendFailure(error, { attempt, externalPort, imageTag });
    throw error;
  }
}

async function cleanupOnFailure(state) {
  console.log('Stopping partially started test environment...');
  let gracefulCleanupError = null;
  try {
    await cleanupStartedResources(state);
  } catch (error) {
    gracefulCleanupError = error;
    console.warn('Graceful test environment cleanup failed; forcing serialized resources:', error);
  }

  try {
    await cleanupSerializedResources(serializeEnvironmentState(state), {
      removeContainer: async (id) => {
        try {
          await execFileAsync('docker', ['rm', '--force', '--volumes', id]);
        } catch (error) {
          if (!MISSING_CONTAINER_PATTERN.test(`${error?.message ?? ''}\n${error?.stderr ?? ''}`)) {
            throw error;
          }
        }
      },
      removeNetwork: async (id) => {
        try {
          await execFileAsync('docker', ['network', 'rm', id]);
        } catch (error) {
          if (!MISSING_NETWORK_PATTERN.test(`${error?.message ?? ''}\n${error?.stderr ?? ''}`)) {
            throw error;
          }
        }
      },
    });
  } catch (forcedCleanupError) {
    throw new AggregateError(
      gracefulCleanupError ? [gracefulCleanupError, forcedCleanupError] : [forcedCleanupError],
      'Failed to clean up partially started Playwright resources'
    );
  }
}

function writeEnvironmentState(variantName, state) {
  writeFileSync(getStateFile(variantName), JSON.stringify(serializeEnvironmentState(state), null, 2));
}

function createTeardown(variantName, state) {
  return async () => {
    console.log(`\n🛑 TEARDOWN: ${variantName}...`);
    await cleanupStartedResources(state);
    rmSync(getStateFile(variantName), { force: true });
    console.log('✅ Test environment stopped successfully\n');
  };
}

function readSetupMetadata(config) {
  return {
    variantName: config?.metadata?.variantName ?? 'console',
    configFile: config?.metadata?.configFile ?? 'console.config.yaml',
    isEnterprise: config?.metadata?.isEnterprise ?? false,
    needsShadowlink: config?.metadata?.needsShadowlink ?? false,
    needsConnect: config?.metadata?.needsConnect ?? false,
  };
}

function parsePortsOverride() {
  try {
    return JSON.parse(process.env.E2E_PORTS_OVERRIDE ?? '{}');
  } catch (error) {
    throw new Error('E2E_PORTS_OVERRIDE must be valid JSON', { cause: error });
  }
}

function logSetupBanner({ variantName, configFile, isEnterprise, needsShadowlink }, ports) {
  console.log('\n\n========================================');
  console.log(`🚀 GLOBAL SETUP: ${variantName}${needsShadowlink ? ' + SHADOWLINK' : ''}`);
  console.log('========================================\n');
  console.log('DEBUG - Config metadata:', {
    variantName,
    configFile,
    isEnterprise,
    needsShadowlink,
    ports,
  });
  console.log('Starting testcontainers environment...');
}

async function resolveBackendImageTag(isEnterprise) {
  // Use pre-built image tag if available (set by run-all-variants.mjs), otherwise build
  const prebuiltTag = isEnterprise ? process.env.E2E_PREBUILT_IMAGE_TAG_ENTERPRISE : process.env.E2E_PREBUILT_IMAGE_TAG;
  return prebuiltTag || (await buildBackendImage(isEnterprise));
}

// --- Kafka variant: simple KRaft broker, no Redpanda/owlshop/connect ---
async function startKafkaVariant({ configFile, imageTag, isEnterprise, network, ports, state, variantName }) {
  await startKafkaContainer(network, state, ports, variantName);
  await startBackendServerWithConfig({
    configPath: variantConfigPath(variantName, configFile),
    externalPort: ports.backend,
    imageTag,
    isEnterprise,
    network,
    networkAlias: 'console-backend',
    state,
  });
}

// --- Group 1: Start clusters in parallel ---
async function startClusters({ isEnterprise, needsShadowlink, network, ports, state }) {
  const clusterPromises = [
    startRedpandaContainer(network, state, ports).then(() => verifyRedpandaServices(state, ports)),
  ];
  if (isEnterprise && needsShadowlink) {
    clusterPromises.push(
      startDestinationRedpandaContainer(network, state, ports).then(() =>
        verifyDestinationRedpandaServices(state, ports)
      )
    );
  }
  await Promise.all(clusterPromises);
}

function logSourceEnvironment(ports) {
  console.log(`  - Source Redpanda broker (external): localhost:${ports.redpandaKafka}`);
  console.log('  - Source Redpanda broker (internal): redpanda:9092');
  console.log(`  - Schema Registry: http://localhost:${ports.redpandaSchemaRegistry}`);
  console.log(`  - Admin API: http://localhost:${ports.redpandaAdmin}`);
}

function logDestinationEnvironment(ports) {
  console.log(`  - Destination Redpanda broker (external): localhost:${ports.destRedpandaKafka}`);
  console.log('  - Destination Redpanda broker (internal): dest-cluster:9092');
  console.log(`  - Destination Schema Registry: http://localhost:${ports.destRedpandaSchemaRegistry}`);
  console.log(`  - Destination Admin API: http://localhost:${ports.destRedpandaAdmin}`);
}

function logDockerEnvironment(ports, needsShadowlink) {
  console.log('');
  console.log('=== Docker Environment Ready ===');
  logSourceEnvironment(ports);
  if (needsShadowlink) {
    logDestinationEnvironment(ports);
  }
  console.log(`  - Kafka Connect: http://localhost:${ports.kafkaConnect}`);
  console.log('================================\n');
}

function startParallelBackends({
  configFile,
  imageTag,
  isEnterprise,
  needsShadowlink,
  network,
  ports,
  state,
  variantName,
}) {
  if (needsShadowlink) {
    return [
      startBackendServerWithConfig({
        configPath: variantConfigPath(variantName, configFile),
        externalPort: ports.backend,
        imageTag,
        isEnterprise,
        network,
        networkAlias: 'console-backend',
        state,
        stateSlot: 'sourceBackend',
      }),
      startBackendServerWithConfig({
        configPath: resolve(__dirname, 'console.dest.config.yaml'),
        externalPort: ports.backendDest,
        imageTag,
        isEnterprise,
        network,
        networkAlias: 'console-backend-dest',
        state,
      }),
    ];
  }
  return [startBackendServer(network, isEnterprise, imageTag, state, variantName, configFile, ports)];
}

// --- Group 2: Start services in parallel (all depend on Redpanda being ready) ---
async function startServices(context) {
  const { needsConnect, network, ports, state } = context;
  const servicePromises = [
    startOwlShop(network, state),
    createKafkaConnectTopics(state).then(() => (needsConnect ? startKafkaConnect(network, state, ports) : null)),
  ];

  // For variants that need Kafka Connect, the backend must start AFTER Connect is ready
  // (the backend proxies connector APIs and tests immediately hit those endpoints).
  // For other variants, start the backend in parallel with services.
  if (!needsConnect) {
    servicePromises.push(...startParallelBackends(context));
  }

  await Promise.all(servicePromises);
}

async function stabilizeForCi({ isEnterprise, needsShadowlink }) {
  // Give services extra time to stabilize in CI (especially shadowlink replication)
  if (isEnterprise && needsShadowlink && process.env.CI) {
    console.log('CI detected: Giving services 3 seconds to stabilize...');
    await delay(3000);
    console.log('✓ Stabilization period complete');
  }
}

async function startRedpandaVariant(context) {
  const { configFile, imageTag, isEnterprise, needsConnect, network, ports, state, variantName } = context;
  await startClusters(context);

  logDockerEnvironment(ports, context.needsShadowlink);

  await startServices(context);

  // Start backend after Kafka Connect for connect variants
  if (needsConnect) {
    await startBackendServer(network, isEnterprise, imageTag, state, variantName, configFile, ports);
  }

  console.log('Backend is ready');

  await stabilizeForCi(context);
}

async function startTestEnvironment(setup) {
  const { isEnterprise, state, variantConfig, variantName } = setup;
  const imageTag = await resolveBackendImageTag(isEnterprise);

  // Setup Docker infrastructure
  const network = await setupDockerNetwork(state);

  if (variantConfig.isKafka) {
    await startKafkaVariant({ ...setup, imageTag, network });
  } else {
    await startRedpandaVariant({ ...setup, imageTag, network });
  }

  writeEnvironmentState(variantName, state);

  console.log('\n✅ All services ready! Starting tests...\n');
  return createTeardown(variantName, state);
}

async function cleanupAfterSetupFailure(error, state) {
  console.error('Failed to start environment:', error);
  try {
    await cleanupOnFailure(state);
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], 'Test environment setup and cleanup both failed');
  }
}

export default async function globalSetup(config = {}) {
  // Get variant configuration from metadata
  const metadata = readSetupMetadata(config);

  // Load ports from variant's config/variant.json, then apply any dynamic
  // host-port overrides chosen by run-variant.mjs (E2E_PORTS_OVERRIDE) so local
  // runs avoid collisions with whatever is on the default ports.
  const variantConfig = loadVariantConfig(metadata.variantName);
  const ports = { ...variantConfig.ports, ...parsePortsOverride() };

  logSetupBanner(metadata, ports);

  const state = createEnvironmentState({
    isEnterprise: metadata.isEnterprise,
    needsShadowlink: metadata.needsShadowlink,
  });

  try {
    return await startTestEnvironment({ ...metadata, ports, state, variantConfig });
  } catch (error) {
    await cleanupAfterSetupFailure(error, state);
    throw error;
  }
}
