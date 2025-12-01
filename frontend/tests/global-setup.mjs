import { GenericContainer, Network, Wait } from 'testcontainers';

import { exec, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const getStateFile = (isEnterprise) =>
  resolve(__dirname, isEnterprise ? '.testcontainers-state-enterprise.json' : '.testcontainers-state.json');

// Helper to run exec and log all output
async function execWithOutput(command, options = {}) {
  console.log(`\n> ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command, options);
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
    return { stdout, stderr };
  } catch (error) {
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    throw error;
  }
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
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Port ${port} failed to become available after ${maxAttempts} attempts`);
}

async function waitForFrontend(maxAttempts = 60, delayMs = 1000) {
  console.log('Waiting for frontend to compile and serve...');

  let consecutiveFastResponses = 0;
  const requiredConsecutiveFast = 3;

  for (let i = 0; i < maxAttempts; i++) {
    const requestStart = Date.now();
    try {
      const { stdout } = await execAsync('curl -s http://localhost:3000/');

      // Check for essential React app elements
      const hasRootDiv = stdout.includes('id="root"') || stdout.includes("id='root'");
      const hasScriptTag = stdout.includes('<script');
      const isHTML = stdout.includes('<!doctype html') || stdout.includes('<!DOCTYPE html') || stdout.includes('<html');
      const requestTime = Date.now() - requestStart;

      if (hasRootDiv && hasScriptTag && isHTML && requestTime < 1000) {
        consecutiveFastResponses++;
        console.log(`  Fast response ${consecutiveFastResponses}/${requiredConsecutiveFast} (${requestTime}ms)`);

        if (consecutiveFastResponses >= requiredConsecutiveFast) {
          console.log(`✓ Frontend ready and stable (${requiredConsecutiveFast} fast responses)`);
          return true;
        }
      } else {
        if (consecutiveFastResponses > 0) {
          console.log(`  Slow response (${requestTime}ms), resetting counter...`);
        }
        consecutiveFastResponses = 0;
      }

      if (requestTime > 2000) {
        console.log(`  Attempt ${i + 1}: Slow response (${requestTime}ms), compilation in progress...`);
      }
    } catch (_error) {
      consecutiveFastResponses = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Frontend failed to become ready');
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
  const redpanda = await new GenericContainer('redpandadata/redpanda:v25.2.1')
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
      interval: 15_000,
      timeout: 3000,
      retries: 5,
      startPeriod: 5000,
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .withStartupTimeout(120_000)
    .start();

  state.redpandaId = redpanda.getId();
  state.redpandaContainer = redpanda;
  console.log(`✓ Redpanda container started: ${state.redpandaId}`);
}

async function verifyRedpandaServices(state) {
  // Give Redpanda a moment to finish internal initialization
  console.log('Waiting for Redpanda services to initialize...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

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

async function startKafkaConnect(network, state) {
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

function setupProcessStreaming(processInstance, prefix) {
  processInstance.stdout.on('data', (data) => {
    process.stdout.write(`[${prefix}] ${data}`);
  });
  processInstance.stderr.on('data', (data) => {
    process.stderr.write(`[${prefix}] ${data}`);
  });
  processInstance.on('error', (error) => {
    console.error(`[${prefix}] Process error:`, error);
  });
  processInstance.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${prefix}] Process exited with code ${code}`);
    }
  });
}

async function startBackendServer(isEnterprise, state) {
  console.log('Starting backend server...');
  const backendCwd = isEnterprise
    ? resolve(__dirname, '../../../console-enterprise/backend/cmd')
    : resolve(__dirname, '../../backend/cmd/api');
  const backendConfigPath = isEnterprise
    ? resolve(__dirname, 'config/console.enterprise.config.yaml')
    : resolve(__dirname, 'config/console.config.yaml');
  console.log(`Backend working directory: ${backendCwd}`);
  console.log(`Backend config path: ${backendConfigPath}`);

  const backendProcess = spawn('go', ['run', '.', `--config.filepath=${backendConfigPath}`], {
    cwd: backendCwd,
    stdio: 'pipe',
  });

  if (!backendProcess.pid) {
    throw new Error('Failed to start backend process - no PID assigned');
  }

  state.backendPid = backendProcess.pid.toString();
  console.log(`Backend started with PID: ${state.backendPid}`);

  setupProcessStreaming(backendProcess, 'BACKEND');
}

async function startFrontendServer(isEnterprise, state) {
  console.log('Starting frontend server...');
  const frontendCwd = resolve(__dirname, '..');
  const frontendCommand = isEnterprise ? 'start2' : 'start';
  console.log(`Frontend working directory: ${frontendCwd}`);
  console.log(`Frontend command: bun run ${frontendCommand}`);

  const frontendProcess = spawn('bun', ['run', frontendCommand], {
    cwd: frontendCwd,
    stdio: 'pipe',
  });

  if (!frontendProcess.pid) {
    throw new Error('Failed to start frontend process - no PID assigned');
  }

  state.frontendPid = frontendProcess.pid.toString();
  console.log(`Frontend started with PID: ${state.frontendPid}`);

  setupProcessStreaming(frontendProcess, 'FRONTEND');
}

async function cleanupOnFailure(state) {
  if (state.backendPid) {
    try {
      process.kill(Number.parseInt(state.backendPid, 10));
    } catch (_) {}
  }
  if (state.frontendPid) {
    try {
      process.kill(Number.parseInt(state.frontendPid, 10));
    } catch (_) {}
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

export default async function globalSetup(config) {
  const isEnterprise = config.metadata?.isEnterprise ?? false;

  console.log('\n\n========================================');
  console.log(`🚀 GLOBAL SETUP STARTED ${isEnterprise ? '(ENTERPRISE MODE)' : '(OSS MODE)'}`);
  console.log('========================================\n');
  console.log('Starting testcontainers environment...');

  const state = {
    networkId: '',
    redpandaId: '',
    owlshopId: '',
    connectId: '',
    backendPid: '',
    frontendPid: '',
    isEnterprise,
  };

  try {
    // Setup Docker infrastructure
    const network = await setupDockerNetwork(state);
    await startRedpandaContainer(network, state);
    await verifyRedpandaServices(state);
    await startOwlShop(network, state);
    await createKafkaConnectTopics(state);
    await startKafkaConnect(network, state);

    console.log('');
    console.log('=== Docker Environment Ready ===');
    console.log('  - Redpanda broker (external): localhost:19092');
    console.log('  - Redpanda broker (internal): redpanda:9092');
    console.log('  - Schema Registry: http://localhost:18081');
    console.log('  - Admin API: http://localhost:19644');
    console.log('  - Kafka Connect: http://localhost:18083');
    console.log('================================\n');

    // Start application servers
    await startBackendServer(isEnterprise, state);
    await startFrontendServer(isEnterprise, state);

    // Wait for services to be ready
    console.log('Waiting for backend to be ready...');
    await waitForPort(9090, 60, 1000);
    console.log('Backend is ready');

    console.log('Waiting for frontend to be ready...');
    await waitForPort(3000, 60, 1000);
    await waitForFrontend(60, 1000);

    writeFileSync(getStateFile(isEnterprise), JSON.stringify(state, null, 2));

    console.log('\n✅ All services ready! Starting tests...\n');
  } catch (error) {
    console.error('Failed to start environment:', error);
    await cleanupOnFailure(state);
    throw error;
  }
}
