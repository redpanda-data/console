config_file: /etc/redpanda/redpanda.yaml
pandaproxy: {}
redpanda:
  admin:
  - address: 0.0.0.0
    port: {{ .AdminPort }}
  advertised_kafka_api:
  - address: localhost
    name: OUTSIDE
    port: {{ .KafkaPort }}
  data_directory: /var/lib/redpanda/data
  developer_mode: true
  enable_idempotence: true
  enable_sasl: false
  enable_transactions: true
  kafka_api:
  - address: 0.0.0.0
    name: OUTSIDE
    port: {{ .KafkaPort }}
  node_id: 0
  rpc_server:
    address: 0.0.0.0
    port: 33145
  seed_servers: []
  superusers: []
rpk:
  coredump_dir: /var/lib/redpanda/coredump
  enable_memory_locking: false
  enable_usage_stats: false
  overprovisioned: true
  tune_aio_events: false
  tune_ballast_file: false
  tune_clocksource: false
  tune_coredump: false
  tune_cpu: false
  tune_disk_irq: false
  tune_disk_nomerges: false
  tune_disk_scheduler: false
  tune_disk_write_cache: false
  tune_fstrim: false
  tune_network: false
  tune_swappiness: false
  tune_transparent_hugepages: false
schema_registry: {}