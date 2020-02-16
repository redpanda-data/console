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

## Install

### Docker images

Docker images are available on [Quay.io](https://quay.io/repository/cloudhut/kafka-owl?tab=tags). We'll automatically push a docker image with a unique tag for each new release. Additionally we build and push docker images after every push to master which can be build successfully.

### Helm chart

Kubernetes users may want to use the Helm chart to deploy Kafka owl: https://github.com/kafka-owl/helm-chart

### Configuration

Kafka Owl can be configured using a YAML file but it also accepts few flags for sensitive inputs such as passwords. You must specify the `--config.filepath` flag which specifies the path to the YAML config file.

#### Flags

| Argument | Description | Default |
| --- | --- | --- |
| --config.filepath | Path to the config file | (No default) |
| --kafka.sasl.password | SASL Password | (No default) |
| --kafka.tls.passphrase | Passphrase to decrypt the TLS key (leave empty for unencrypted key files) | (No default) |

#### YAML Config

You can find a reference of all available config options under [/docs/config/kowl.yaml](#docs/config/kowl.yaml)
