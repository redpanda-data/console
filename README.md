# Kowl - Apache Kafka Web UI

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/cloudhut/kowl/blob/master/LICENSE)
[![Go Report Card](https://goreportcard.com/badge/github.com/cloudhut/kowl)](https://goreportcard.com/report/github.com/cloudhut/kowl)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cloudhut/kowl?sort=semver)
[![Discord Chat](https://img.shields.io/badge/discord-online-brightgreen.svg)](https://discord.gg/KQj7P6v)
[![Docker Repository on Quay](https://img.shields.io/badge/docker%20image-ready-green "Docker Repository on Quay")](https://quay.io/repository/cloudhut/kowl)

Kowl (previously known as Kafka Owl) is a web application that helps you to explore messages in your Apache Kafka cluster and get better insights on what is actually happening in your Kafka cluster in the most comfortable way:

![preview](docs/assets/preview.gif)

## Features

- **Message viewer:** Explore your topics' messages in our message viewer through ad-hoc queries and dynamic filters. Find any message you want using JavaScript functions to filter messages. Supported encodings are: JSON, Avro, Protobuf, XML, MessagePack, Text and Binary (hex view). The used enconding (except Protobuf) is recognized automatically.
- **Consumer groups:** List all your active consumer groups along with their active group offsets. You can view a visualization of group lags either by topic (sum of all partition lags), single partitions or the sum of all partition lags (group lag)
- **Topic overview:** Browse through the list of your Kafka topics, check their configuration, space usage, list all consumers who consume a single topic or watch partition details (such as low and high water marks, message count, ...), embed topic documentation from a git repository and more.
- **Cluster overview:** List available brokers, their space usage, rack id and other information to get a high level overview of your brokers in your cluster.

**A roadmap** is maintained using [milestones](https://github.com/cloudhut/kowl/milestones).

|  | Kowl | Kowl Business |
| :-- | :-: | :-: |
| **Topic Overview** | :white_check_mark: | :white_check_mark: |
| **Consumer Group Overview** | :white_check_mark: | :white_check_mark: |
| **Broker/Cluster Overview** | :white_check_mark: | :white_check_mark: |
| **Message viewer** | :white_check_mark: | :white_check_mark: |
| **Login System (Google, GitHub, Okta)** | :x: | :white_check_mark: |
| **RBAC permissions with group syncing** | :x: | :white_check_mark: |
| **Screenshots** | Preview .gif in README | https://cloudhut.dev/ |
| **Price** | Always free / Open source | Free during beta\* |

\*If you want to participate in the free beta sign in here: https://license.cloudhut.dev/ . You'll get a forever free license for 2 seats. If you need more than 2 seats, just drop us an email at info@cloudhut.dev

## Getting Started

### Prerequisites

- Kafka Cluster (v1.0.0+) connectivity
- At least one OAuth app for SSO (Kowl business only)
- Internet connectivity to validate license (Kowl business only)

### Installing

We offer pre built docker images for Kowl (Business), a Helm chart and a Terraform module to make the installation as comfortable as possible for you. Please take a look at our dedicated [Installation documentation](https://cloudhut.dev/docs/installation).

### Quick Start

Do you just want to test Kowl against one of your Kafka clusters without spending too much time on the test setup? Here are some docker commands that allow you to run it locally against an existing Kafka cluster:

#### Kafka is running locally

Since Kowl runs in it's own container (which has it's own network scope), we have to use `host.docker.internal` as bootstrap server. That DNS resolves to the host system's ip address. However since Kafka brokers send a list of all brokers' DNS when a client has connected, you have to make sure your advertised listener is connected accordingly, e.g.: `PLAINTEXT://host.docker.internal:9092`

```shell
docker run -p 8080:8080 -e KAFKA_BROKERS=host.docker.internal:9092 quay.io/cloudhut/kowl:master
```

Docker supports the `--network=host` option only on Linux. So Linux users use `localhost:9092` as advertised listener and use the host network namespace instead. Kowl will then be ran as it would be executed on the host machine.

```shell
docker run --network=host -p 8080:8080 -e KAFKA_BROKERS=localhost:9092 quay.io/cloudhut/kowl:master
```

#### Kafka is running remotely

Protected via SASL_SSL and trusted certificates (e.g. Confluent Cloud):

```shell
docker run -p 8080:8080 -e KAFKA_BROKERS=pkc-4r000.europe-west1.gcp.confluent.cloud:9092 -e KAFKA_TLS_ENABLED=true -e KAFKA_SASL_ENABLED=true -e KAFKA_SASL_USERNAME=xxx -e KAFKA_SASL_PASSWORD=xxx quay.io/cloudhut/kowl:master
```

#### I don't have a running Kafka cluster to test against

We maintain a docker-compose file that launches zookeeper, kafka and kowl: [/docs/local](./docs/local).

## Chat with us

We use Discord to communicate. If you are looking for more interactive discussions or support, you are invited to join our Discord server: https://discord.gg/KQj7P6v

## Sponsors

<a href="https://www.rewe-digital.com/" target="_blank"><img src="./docs/assets/sponsors/rewe-digital-logo.png" width="150" /></a>

## License

Kowl is distributed under the [Apache 2.0 License](https://github.com/cloudhut/kowl/blob/master/LICENSE).
