# Redpanda Console – A UI for Data Streaming

[![Go Report Card](https://goreportcard.com/badge/github.com/cloudhut/kowl)](https://goreportcard.com/report/github.com/cloudhut/kowl)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/redpanda-data/console?sort=semver)
[![Docker Repository](https://img.shields.io/badge/docker%20image-ready-green "Docker Repository")](https://hub.docker.com/r/redpandadata/console/tags)

Redpanda Console (previously known as Kowl) is a web application that helps you manage and debug your Kafka/Redpanda workloads effortlessly.

https://user-images.githubusercontent.com/23424570/220130537-7b0b8596-0a06-4132-90a5-1be3c169e4f4.mp4

## Features

- **Message viewer:** Explore your topics' messages in our message viewer through ad-hoc queries and dynamic filters. Find any message you want using JavaScript functions to filter messages. Supported encodings are: JSON, Avro, Protobuf, XML, MessagePack, Text and Binary (hex view). The used enconding (except Protobuf) is recognized automatically.
- **Consumer groups:** List all your active consumer groups along with their active group offsets, edit group offsets (by group, topic or partition) or delete a consumer group.
- **Topic overview:** Browse through the list of your Kafka topics, check their configuration, space usage, list all consumers who consume a single topic or watch partition details (such as low and high water marks, message count, ...), embed topic documentation from a git repository and more.
- **Cluster overview:** List ACLs, available brokers, their space usage, rack id and other information to get a high level overview of your brokers in your cluster.
- **Schema Registry:** List all Avro, Protobuf or JSON schemas within your schema registry.
- **Kafka connect:** Manage connectors from multiple connect clusters, patch configs, view their current state or restart tasks.

## Getting Started

### Prerequisites

- Redpanda or any Kafka deployment (v1.0.0+) compatible
- Docker runtime (single binary builds will be provided in the future)

### Installing

We offer pre built docker images for RP Console, a Helm chart and a Terraform module to make the installation as comfortable as possible for you. Please take a look at our dedicated [Installation documentation](https://docs.redpanda.com/docs/console/installation/).

### Quick Start

Do you just want to test RP Console against one of your Kafka clusters without spending too much time on the test setup? Here are some docker commands that allow you to run it locally against an existing Redpanda or Kafka cluster:

#### Redpanda/Kafka is running locally

Since Console runs in its own container (which has its own network scope), we have to use host.docker.internal as a bootstrap server. That DNS resolves to the host system's ip address. However since the brokers send a list of all brokers' DNS when a client has connected, you have to make sure your advertised listener is connected accordingly, e.g.: `PLAINTEXT://host.docker.internal:9092`

```shell
docker run -p 8080:8080 -e KAFKA_BROKERS=host.docker.internal:9092 docker.redpanda.com/redpandadata/console:latest
```

Docker supports the `--network=host` option only on Linux. So Linux users use `localhost:9092` as an advertised listener and use the host network namespace instead. Console will then be run as it would be executed on the host machine.

```shell
docker run --network=host -p 8080:8080 -e KAFKA_BROKERS=localhost:9092 docker.redpanda.com/redpandadata/console:latest
```

#### Kafka is running remotely

Protected via SASL_SSL and trusted certificates (e.g. Confluent Cloud):

```shell
docker run -p 8080:8080 -e KAFKA_BROKERS=pkc-4r000.europe-west1.gcp.confluent.cloud:9092 -e KAFKA_TLS_ENABLED=true -e KAFKA_SASL_ENABLED=true -e KAFKA_SASL_USERNAME=xxx -e KAFKA_SASL_PASSWORD=xxx docker.redpanda.com/redpandadata/console:latest
```

#### I don't have a running Kafka cluster to test against

We maintain a docker-compose file that launches Redpanda and Console: [/docs/local](./docs/local).

# Community

[Slack](https://redpanda.com/slack) is the main way the community interacts with one another in real time :)

[GitHub Issues](https://github.com/redpanda-data/console/issues) can be used for issues, questions and feature requests.

[Code of conduct](https://github.com/redpanda-data/redpanda/blob/dev/CODE_OF_CONDUCT.md) code of conduct for the community

[Contributing docs](./CONTRIBUTING.md)

## Companies that use Redpanda Console

- REWE Digital [https://www.rewe-digital.com/]
- Redpanda Data [https://redpanda.com/]
- OPT-NC (Office des Postes et Télécommunications de Nouvelle-Calédonie) [https://office.opt.nc/]
