# Kafka Owl

![License](https://img.shields.io/github/license/cloudworkz/kafka-minion.svg?color=blue) [![Go Report Card](https://goreportcard.com/badge/github.com/kafka-owl/kafka-owl)](https://goreportcard.com/report/github.com/kafka-owl/kafka-owl) ![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/kafka-owl/kafka-owl?sort=semver) [![Docker Repository on Quay](https://quay.io/repository/cloudhut/kafka-owl/status "Docker Repository on Quay")](https://quay.io/repository/cloudhut/kafka-owl)

Kafka Owl is a Web UI which helps you to explore messages in your cluster's topics in the most comfortable way.

![preview](docs/assets/preview.gif)

## Features

- [x] Supports Kafka 1.0.0+
- [x] Fetch messages from Kafka Topics so that they can be comfortably previewed (JSON, XML, Text, Binary)
- [x] Show Topic configuration with highlighted rows which have been modified
- [x] List all Topics' Low & High Watermarks
- [x] Performant & lightweight (e. g. fetching messages from one or across multiple partitions takes a few milliseconds)
- [x] Consumer group overview along with their members, member state & partition assignments

## Roadmap

- [ ] Add avro support for deserializing messages (key+value)
- [ ] Authentication layer with SSO support
- [ ] Editing features such as editing consumer group offsets
- [ ] ACL support for listing/editing/creating/deleting topics, consumer groups, ...

## Install

### Helm chart

Kubernetes users may want to use the Helm chart to deploy Kafka owl: https://github.com/kafka-owl/helm-chart

### Arguments

| Argument | Description | Default |
| --- | --- | --- |
| --server.graceful-shutdown-timeout | Timeout for graceful shutdowns | 30s |
| --server.http.listen-port | HTTP server listen port | 80 |
| --server.http.read-timeout | Read timeout for HTTP server | 30s |
| --server.http.write-timeout | Write timeout for HTTP server | 30s |
| --server.http.idle-timeout | Idle timeout for HTTP server | 120s |
| --logging.level | Log granularity (debug, info, warn, error, fatal, panic) | info |
| --logging.print-access-logs | Whether or not to print access log for each HTTP invocation | false |
| --logging.access-log-extra-header | Name of an additional header to include in the Access Logs. Intended to capture the current user that sent the request (obviously only works when there's a proxy that actually adds the header, like Googles Cloud IAP: `X-Goog-Authenticated-User-Email`) | `X-Goog-Authenticated-User-Email` |
| --logging.block-when-extra-header-missing | When true, and an incoming request does not have a value for the header 'logging.access-log-extra-header', it will be blocked (returning 400) | false |
| --kafka.brokers | Array of broker addresses, delimited by comma (e. g. "kafka-1:9092, kafka-2:9092") | (No default) |
| --kafka.client-id | ClientID to identify the consumer | "kafka-owl" |
| --kafka.sasl.enabled | Bool to enable/disable SASL authentication (only SASL_PLAINTEXT is supported) | false |
| --kafka.sasl.use-handshake | Whether or not to send the Kafka SASL handshake first | true |
| --kafka.sasl.username | SASL Username | (No default) |
| --kafka.sasl.password | SASL Password | (No default) |
| --kafka.tls.enabled | Whether or not to use TLS when connecting to the broker | false |
| --kafka.tls.ca-file-path | Path to the TLS CA file | (No default) |
| --kafka.tls.key-file-path | Path to the TLS key file | (No default) |
| --kafka.tls.cert-file-path | Path to the TLS cert file | (No default) |
| --kafka.tls.insecure-skip-verify | If true, TLS accepts any certificate presented by the server and any host name in that certificate. | false |
| --kafka.tls.passphrase | Passphrase to decrypt the TLS key (leave empty for unencrypted key files) | (No default) |
| --owl.topics.blacklist | Topics blacklist (comma separated) to configure access restrictions | (No default)
