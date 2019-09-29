# Kafka Owl

Kafka Owl is a Web UI which helps you to explore messages in your cluster's topics in the most comfortable way. 

![preview](docs/assets/preview.gif)

## Install

### Arguments

| Argument | Description | Default |
| --- | --- | --- |
| --telemetry.host | Host to listen on for the prometheus exporter | 0.0.0.0 |
| --telemetry.port | HTTP Port to listen on for the prometheus exporter | 8080 |
| --logging.level | Log granularity (debug, info, warn, error, fatal, panic) | info |
| --kafka.brokers | Array of broker addresses, delimited by comma (e. g. "kafka-1:9092, kafka-2:9092") | (No default) |
| --kafka.version | The kafka cluster's version (e. g. \"2.3.0\") | "0.11.0.2" |
| --kafka.client-id | ClientID to identify the consumer | "kafka-owl" |
| --kafka.sasl.enabled | Bool to enable/disable SASL authentication (only SASL_PLAINTEXT is supported) | false |
| --kafka.sasl.use-handshake | Whether or not to send the Kafka SASL handshake first | true |
| --kafka.sasl.username | SASL Username | (No default) |
| --kafka.sasl.password | SASL Password | (No default) |
| --kafka.tls.enabled | Whether or not to use TLS when connecting to the broker | false |
| --kafka.tls.ca-file-path | Path to the TLS CA file | (No default) |
| --kafka.tls.key-file-path | Path to the TLS key file | (No default) |
| --kafka.tls.cert-file-path | Path to the TLS cert file | (No default) |
| --kafka.tls.insecure-skip-verify | If true, TLS accepts any certificate presented by the server and any host name in that certificate. | true |
| --kafka.tls.passphrase | Passphrase to decrypt the TLS key (leave empty for unencrypted key files) | (No default) |