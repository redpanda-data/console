import { GenericContainer, Network, Wait } from 'testcontainers';

import { exec } from 'node:child_process';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Regex for extracting container ID from error messages
const CONTAINER_ID_REGEX = /container ([a-f0-9]+)/;

const getStateFile = (isEnterprise) =>
  resolve(__dirname, isEnterprise ? '.testcontainers-state-enterprise.json' : '.testcontainers-state.json');

async function setupEnterpriseLicense() {
  const fs = await import('node:fs');

  // Check if license is provided as GitHub secret (environment variable)
  if (process.env.ENTERPRISE_LICENSE_CONTENT) {
    console.log('Using ENTERPRISE_LICENSE_CONTENT from environment variable (GitHub secret)');
    // Write the license content to a temporary file
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const tempDir = mkdtempSync(`${tmpdir()}/redpanda-license-`);
    const licensePath = `${tempDir}/redpanda.license`;
    writeFileSync(licensePath, process.env.ENTERPRISE_LICENSE_CONTENT);
    console.log(`✓ License written to temporary file: ${licensePath}`);
    return licensePath;
  }

  // Default to relative path based on backend directory
  const backendDir = process.env.ENTERPRISE_BACKEND_DIR
    ? resolve(process.env.ENTERPRISE_BACKEND_DIR)
    : resolve(__dirname, '../../../console-enterprise/backend');

  const defaultLicensePath = resolve(backendDir, '../configs/shared/redpanda.license');
  const licensePath = process.env.REDPANDA_LICENSE_PATH || defaultLicensePath;
  console.log(`Enterprise license path: ${licensePath}`);

  if (!fs.existsSync(licensePath)) {
    throw new Error(`License file not found at: ${licensePath}`);
  }
  console.log('✓ License file found');
  return licensePath;
}

async function waitForPort(port, maxAttempts = 30, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { stdout } = await execAsync(
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ || echo "0"`
      );
      const statusCode = Number.parseInt(stdout.trim(), 10);
      if (statusCode > 0 && statusCode < 500) {
        return true;
      }
      if ((i + 1) % 10 === 0) {
        console.log(`  Still waiting... (attempt ${i + 1}/${maxAttempts})`);
      }
    } catch (_error) {
      // Port not ready yet
      if ((i + 1) % 10 === 0) {
        console.log(`  Still waiting... (attempt ${i + 1}/${maxAttempts})`);
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw new Error(`Port ${port} failed to become available after ${maxAttempts} attempts`);
}
async function setupDockerNetwork(state) {
  console.log('Creating Docker network...');
  const network = await new Network().start();
  state.networkId = network.getId();
  state.network = network;
  console.log(`✓ Network created: ${state.networkId}`);
  return network;
}

async function startRedpandaContainer(network, state) {
  console.log('Starting Redpanda container...');
  const redpanda = await new GenericContainer('redpandadata/redpanda:v25.3.2')
    .withNetwork(network)
    .withNetworkAliases('redpanda')
    .withExposedPorts(
      { container: 19_092, host: 19_092 },
      { container: 18_081, host: 18_081 },
      { container: 18_082, host: 18_082 },
      { container: 9644, host: 19_644 }
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
      'internal://redpanda:8082,external://localhost:18082',
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
        source: resolve(__dirname, 'config/conf/.bootstrap.yaml'),
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

  state.redpandaId = redpanda.getId();
  state.redpandaContainer = redpanda;
  console.log(`✓ Redpanda container started: ${state.redpandaId}`);
}

async function verifyRedpandaServices(state) {
  // Give Redpanda a moment to finish internal initialization
  console.log('Waiting for Redpanda services to initialize...');
  await new Promise((resolveWait) => setTimeout(resolveWait, 5000));

  // Check services are ready
  console.log('Checking if Admin API is ready (port 19644)...');
  await waitForPort(19_644, 60, 2000);
  console.log('✓ Admin API is ready');

  console.log('Checking if Schema Registry is ready (port 18081)...');
  await waitForPort(18_081, 60, 2000);
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

  const owlshop = await new GenericContainer('quay.io/cloudhut/owl-shop:master')
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

  state.owlshopId = owlshop.getId();
  state.owlshopContainer = owlshop;
  console.log(`✓ OwlShop started: ${state.owlshopId}`);
}

async function createKafkaConnectTopics(state) {
  console.log('Pre-creating Kafka Connect internal topics...');
  const connectTopics = [
    '_internal_connectors_offsets',
    '_internal_connectors_configs',
    '_internal_connectors_status',
    '__redpanda.connectors_logs',
  ];

  for (const topic of connectTopics) {
    try {
      await execAsync(
        `docker exec ${state.redpandaId} rpk topic create ${topic} --replicas 1 --partitions 1 -X user=e2euser -X pass=very-secret -X sasl.mechanism=SCRAM-SHA-256`
      );
      console.log(`  ✓ Created topic: ${topic}`);
    } catch (_error) {
      console.log(`  - Topic ${topic} already exists or creation skipped`);
    }
  }
}

async function _startKafkaConnectttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt(
  network,
  state
) {
  console.log('Starting Kafka Connect container...');
  const connectConfig = `
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
security.protocol=SASL_PLAINTEXT
sasl.mechanism=SCRAM-SHA-256
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="e2euser" password="very-secret";
consumer.security.protocol=SASL_PLAINTEXT
consumer.sasl.mechanism=SCRAM-SHA-256
consumer.sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="e2euser" password="very-secret";
producer.security.protocol=SASL_PLAINTEXT
producer.sasl.mechanism=SCRAM-SHA-256
producer.sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="e2euser" password="very-secret";
admin.security.protocol=SASL_PLAINTEXT
admin.sasl.mechanism=SCRAM-SHA-256
admin.sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required username="e2euser" password="very-secret";
topic.creation.enable=false
`;

  let connect;
  try {
    connect = await new GenericContainer('docker.cloudsmith.io/redpanda/connectors-unsupported/connectors:latest')
      .withPlatform('linux/amd64')
      .withNetwork(network)
      .withNetworkAliases('connect')
      .withExposedPorts({ container: 8083, host: 18_083 })
      .withEnvironment({
        CONNECT_CONFIGURATION: connectConfig,
        CONNECT_BOOTSTRAP_SERVERS: 'redpanda:9092',
        CONNECT_GC_LOG_ENABLED: 'false',
        CONNECT_HEAP_OPTS: '-Xms512M -Xmx512M',
        CONNECT_LOG_LEVEL: 'info',
        CONNECT_TOPIC_LOG_ENABLED: 'true',
      })
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(120_000)
      .start();

    state.connectId = connect.getId();
    state.connectContainer = connect;
    console.log(`✓ Kafka Connect container started: ${state.connectId}`);

    // Verify it's responding
    console.log('Verifying Kafka Connect API...');
    await waitForPort(18_083, 60, 2000);
    console.log('✓ Kafka Connect API ready');
  } catch (error) {
    console.log('⚠ Kafka Connect failed to start (connector tests may fail)');
    console.log(`  Error: ${error.message}`);

    // Try to get container ID and logs for debugging
    if (connect) {
      try {
        const containerId = connect.getId();
        state.connectId = containerId;
        state.connectContainer = connect;
        console.log(`\n  Container ID: ${containerId}`);
        console.log('  Last 50 lines of Kafka Connect logs:');
        const { stdout } = await execAsync(`docker logs --tail 50 ${containerId}`);
        console.log(stdout);
      } catch {
        console.log('  Could not retrieve container logs');
      }
    } else {
      console.log('  Container failed to start - no logs available');
    }
  }
}

async function buildBackendImage(isEnterprise) {
  console.log(`Building backend Docker image ${isEnterprise ? '(Enterprise)' : '(OSS)'}...`);

  let backendDir;
  if (isEnterprise) {
    // Check for ENTERPRISE_BACKEND_DIR environment variable
    if (process.env.ENTERPRISE_BACKEND_DIR) {
      backendDir = resolve(process.env.ENTERPRISE_BACKEND_DIR);
      console.log(`Using ENTERPRISE_BACKEND_DIR from environment: ${backendDir}`);
    } else {
      // Default to relative path
      backendDir = resolve(__dirname, '../../../console-enterprise/backend');
    }
  } else {
    backendDir = resolve(__dirname, '../../backend');
  }

  // Resolve symlinks to real path (needed for Docker build context)
  if (existsSync(backendDir)) {
    backendDir = realpathSync(backendDir);
  }

  const imageTag = isEnterprise ? 'console-backend:e2e-test-enterprise' : 'console-backend:e2e-test';

  console.log(`Building from: ${backendDir}`);

  let embedDir = null;

  try {
    // Copy frontend assets before build (required for both OSS and Enterprise)
    // The pkg/embed/frontend/ directory has .gitignore with *, so assets don't exist in CI
    // Check if enterprise backend directory exists
    if (isEnterprise && !existsSync(backendDir)) {
      throw new Error(
        `Enterprise backend directory not found: ${backendDir}\n` +
          'Enterprise E2E tests require console-enterprise repo to be checked out alongside console repo.'
      );
    }

    const frontendBuildDir = resolve(__dirname, '../build');

    // Check if frontend build exists
    if (!existsSync(frontendBuildDir)) {
      throw new Error(`Frontend build directory not found: ${frontendBuildDir}\nRun `);
    }

    embedDir = join(backendDir, 'pkg/embed/frontend');

    console.log(`Copying frontend assets to ${isEnterprise ? 'enterprise' : 'OSS'} backend...`);
    console.log(`  From: ${frontendBuildDir}`);
    console.log(`  To: ${embedDir}`);

    // Copy all files from build/ to pkg/embed/frontend/
    await execAsync(`cp -r "${frontendBuildDir}"/* "${embedDir}"/`);
    console.log('✓ Frontend assets copied');

    // Build Docker image using testcontainers
    // Docker doesn't allow Dockerfiles to reference files outside build context,
    // so we temporarily copy the Dockerfile into the build context
    const dockerfilePath = resolve(__dirname, 'config/Dockerfile.backend');
    const tempDockerfile = join(backendDir, '.dockerfile.e2e.tmp');

    console.log('Building Docker image with testcontainers...');
    await execAsync(`cp "${dockerfilePath}" "${tempDockerfile}"`);

    try {
      await GenericContainer.fromDockerfile(backendDir, '.dockerfile.e2e.tmp')
        .withBuildArgs({
          BUILDKIT_INLINE_CACHE: '1',
        })
        .build(imageTag, { deleteOnExit: false });
      console.log('✓ Backend image built');
    } finally {
      // Clean up temporary Dockerfile
      await execAsync(`rm -f "${tempDockerfile}"`).catch(() => {
        // Ignore cleanup errors
      });
    }

    return imageTag;
  } finally {
    // Cleanup: remove copied frontend assets (for both OSS and Enterprise)
    if (embedDir) {
      console.log('Cleaning up copied frontend assets...');
      // Keep .gitignore, remove everything else
      await execAsync(`find "${embedDir}" -mindepth 1 ! -name '.gitignore' -delete`).catch(() => {
        // Ignore cleanup errors - this is a best-effort cleanup
      });
      console.log('✓ Cleanup complete');
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: (21) nested test environment setup with multiple configuration checks
async function startBackendServer(network, isEnterprise, imageTag, state) {
  console.log('Starting backend server container...');
  console.log(`Image tag: ${imageTag}`);
  console.log(`Enterprise mode: ${isEnterprise}`);

  const backendConfigPath = isEnterprise
    ? resolve(__dirname, 'config/console.enterprise.config.yaml')
    : resolve(__dirname, 'config/console.config.yaml');

  console.log(`Backend config path: ${backendConfigPath}`);

  const bindMounts = [
    {
      source: backendConfigPath,
      target: '/etc/console/config.yaml',
      mode: 'ro',
    },
  ];

  // Mount license file for enterprise mode
  if (isEnterprise) {
    const licensePath = await setupEnterpriseLicense();

    bindMounts.push({
      source: licensePath,
      target: '/etc/console/redpanda.license',
      mode: 'ro',
    });
  }

  console.log('Creating container with bind mounts:');
  bindMounts.forEach((mount, i) => {
    console.log(`  [${i}] ${mount.source} -> ${mount.target}`);
  });

  let backend;
  let containerId;
  try {
    console.log('Starting container...');
    console.log('Configuration summary:');
    console.log(`  - Network: ${network.getId ? network.getId() : 'unknown'}`);
    console.log('  - Alias: console-backend');
    console.log('  - Port: 3000:3000');
    console.log('  - Command: --config.filepath=/etc/console/config.yaml');

    // Create container without wait strategy first to get the ID immediately
    const container = new GenericContainer(imageTag)
      .withNetwork(network)
      .withNetworkAliases('console-backend')
      .withNetworkMode(network.getName())
      .withExposedPorts({ container: 3000, host: 3000 })
      .withBindMounts(bindMounts)
      .withCommand(['--config.filepath=/etc/console/config.yaml']);

    console.log('Calling container.start()...');

    try {
      backend = await container.start();
      containerId = backend.getId();
      state.backendId = containerId;
      state.backendContainer = backend;
      console.log(`✓ Container.start() returned with ID: ${containerId}`);
    } catch (startError) {
      console.error('Error during container.start():', startError.message);

      // Extract container ID from error message if available
      const containerIdMatch = startError.message.match(CONTAINER_ID_REGEX);
      const failedContainerId = containerIdMatch ? containerIdMatch[1] : null;

      if (failedContainerId) {
        console.log(`Container ID from error: ${failedContainerId}`);
        containerId = failedContainerId;
        state.backendId = failedContainerId;

        try {
          // Get logs from this container
          console.log('Fetching logs from failed container...');
          const { stdout: containerLogs } = await execAsync(`docker logs ${failedContainerId} 2>&1`);
          console.log('=== CONTAINER LOGS START ===');
          console.log(containerLogs || '(no logs)');
          console.log('=== CONTAINER LOGS END ===');

          // Get container state
          console.log('Fetching container state...');
          const { stdout: stateJson } = await execAsync(
            `docker inspect ${failedContainerId} --format='{{json .State}}'`
          );
          console.log('Container state:');
          const containerState = JSON.parse(stateJson);
          console.log(JSON.stringify(containerState, null, 2));

          // Get container config to see the actual command and mounts
          console.log('Fetching container config...');
          const { stdout: configJson } = await execAsync(
            `docker inspect ${failedContainerId} --format='{{json .Config}}'`
          );
          const config = JSON.parse(configJson);
          console.log('Container command:', config.Cmd);
          console.log('Container entrypoint:', config.Entrypoint);

          // Get mount info
          console.log('Fetching mount info...');
          const { stdout: mountsJson } = await execAsync(
            `docker inspect ${failedContainerId} --format='{{json .Mounts}}'`
          );
          const mounts = JSON.parse(mountsJson);
          console.log('Container mounts:');
          console.log(JSON.stringify(mounts, null, 2));
        } catch (inspectError) {
          console.error('Failed to inspect container:', inspectError.message);
        }
      } else {
        console.log('Could not extract container ID from error message');
        console.log('Full error:', JSON.stringify(startError, null, 2));
      }

      throw startError;
    }

    console.log(`Container created with ID: ${containerId}`);
    console.log('Waiting 2 seconds for container to initialize...');
    await new Promise((resolveInit) => setTimeout(resolveInit, 2000));

    // Check if container is still running
    const { stdout: inspectOutput } = await execAsync(`docker inspect ${containerId} --format='{{.State.Status}}'`);
    const containerStatus = inspectOutput.trim();
    console.log(`Container status: ${containerStatus}`);

    if (containerStatus !== 'running') {
      console.error(`Container is not running (status: ${containerStatus})`);
      console.log('Fetching container logs...');
      const { stdout: containerErrorLogs } = await execAsync(`docker logs ${containerId} 2>&1`);
      console.log('Container logs:');
      console.log(containerErrorLogs);

      // Get exit code
      const { stdout: exitCode } = await execAsync(`docker inspect ${containerId} --format='{{.State.ExitCode}}'`);
      console.log(`Container exit code: ${exitCode.trim()}`);

      throw new Error(`Container stopped immediately with status: ${containerStatus}`);
    }

    console.log(`✓ Backend container started and running: ${containerId}`);

    // Get initial logs to see startup
    console.log('Fetching initial container logs...');
    const { stdout: logs } = await execAsync(`docker logs ${containerId} 2>&1 | tail -30`);
    if (logs) {
      console.log('Container logs:');
      console.log(logs);
    }

    // Now wait for port to be ready
    console.log('Waiting for port 3000 to be ready...');
    await waitForPort(3000, 60, 1000);
    console.log('✓ Port 3000 is ready');
  } catch (error) {
    console.error('Failed to start backend container:', error.message);

    // Try to get container logs if container was created but failed
    if (containerId) {
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

    throw error;
  }
}

async function cleanupOnFailure(state) {
  if (state.backendContainer) {
    console.log('Stopping backend container using testcontainers API...');
    await state.backendContainer.stop().catch((error) => {
      console.log(`Failed to stop backend container: ${error.message}`);
    });
  }

  if (state.connectContainer) {
    console.log('Stopping Kafka Connect container using testcontainers API...');
    await state.connectContainer.stop().catch((error) => {
      console.log(`Failed to stop Connect container: ${error.message}`);
    });
  }
  if (state.owlshopContainer) {
    console.log('Stopping OwlShop container using testcontainers API...');
    await state.owlshopContainer.stop().catch((error) => {
      console.log(`Failed to stop OwlShop container: ${error.message}`);
    });
  }
  if (state.redpandaContainer) {
    console.log('Stopping Redpanda container using testcontainers API...');
    await state.redpandaContainer.stop().catch((error) => {
      console.log(`Failed to stop Redpanda container: ${error.message}`);
    });
  }
  if (state.network) {
    console.log('Stopping network using testcontainers API...');
    await state.network.stop().catch((error) => {
      console.log(`Failed to stop network: ${error.message}`);
    });
  }
}

export default async function globalSetup(config = {}) {
  const isEnterprise = config?.metadata?.isEnterprise ?? false;

  console.log('\n\n========================================');
  console.log(`🚀 GLOBAL SETUP STARTED ${isEnterprise ? '(ENTERPRISE MODE)' : '(OSS MODE)'}`);
  console.log('========================================\n');
  console.log('Starting testcontainers environment...');

  const state = {
    networkId: '',
    redpandaId: '',
    owlshopId: '',
    connectId: '',
    backendId: '',
    isEnterprise,
  };

  try {
    // Build backend Docker image
    const imageTag = await buildBackendImage(isEnterprise);

    // Setup Docker infrastructure
    const network = await setupDockerNetwork(state);
    await startRedpandaContainer(network, state);
    await verifyRedpandaServices(state);
    await startOwlShop(network, state);
    await createKafkaConnectTopics(state);
    // await startKafkaConnect(network, state);

    console.log('');
    console.log('=== Docker Environment Ready ===');
    console.log('  - Redpanda broker (external): localhost:19092');
    console.log('  - Redpanda broker (internal): redpanda:9092');
    console.log('  - Schema Registry: http://localhost:18081');
    console.log('  - Admin API: http://localhost:19644');
    console.log('  - Kafka Connect: http://localhost:18083');
    console.log('================================\n');

    // Start backend server (serves both API and frontend)
    await startBackendServer(network, isEnterprise, imageTag, state);

    // Wait for services to be ready
    console.log('Waiting for backend to be ready...');
    await waitForPort(3000, 60, 1000);
    console.log('Backend is ready');

    console.log('Waiting for frontend to be ready...');
    await waitForPort(3000, 60, 1000);

    writeFileSync(getStateFile(isEnterprise), JSON.stringify(state, null, 2));

    console.log('\n✅ All services ready! Starting tests...\n');
  } catch (error) {
    console.error('Failed to start environment:', error);
    await cleanupOnFailure(state);
    throw error;
  }
}
