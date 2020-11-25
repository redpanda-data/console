# Kowl

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/cloudhut/kowl/blob/master/LICENSE)
[![Go Report Card](https://goreportcard.com/badge/github.com/cloudhut/kowl)](https://goreportcard.com/report/github.com/cloudhut/kowl)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cloudhut/kowl?sort=semver)
[![Discord Chat](https://img.shields.io/badge/discord-online-brightgreen.svg)](https://discord.gg/KQj7P6v)
[![Docker Repository on Quay](https://img.shields.io/badge/docker%20image-ready-green "Docker Repository on Quay")](https://quay.io/repository/cloudhut/kowl)

Kowl (previously known as Kafka Owl) is a web application that helps you to explore messages in your Apache Kafka cluster and get better insights on what is actually happening in your Kafka cluster in the most comfortable way:

![preview](docs/assets/preview.gif)

## Features

- **Message viewer:** Explore your topics' messages in our message viewer through ad-hoc queries and dynamic filters. Find any message you want using JavaScript functions to filter messages. Supported encodings are: JSON, Avro, XML, Text and Binary (hex view). The used enconding is recognized automatically.
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
| **Login System (Google, GitHub OAuth)** | :x: | :white_check_mark: |
| **RBAC permissions with group syncing** | :x: | :white_check_mark: |
| **Screenshots** | Preview .gif in README | https://cloudhut.dev/ |
| **Price** | Always free / Open source | Free during beta\* |

\*If you want to participate in the free beta sign in here: https://license.cloudhut.dev/ . You'll get a forever free license for 2 seats. If you need more than 2 seats, just drop us an email at info@cloudhut.dev

## Getting Started

### Prerequisites

- Kafka Cluster (v1.0.0+) connectivity
- At least one OAuth app for SSO (Kowl business only)

### Installing

We offer pre built docker images for Kowl (Business), a Helm chart and a Terraform module to make the installation as comfortable as possible for you. Please take a look at our dedicated [Installation documentation](docs/INSTALL.md).

### Docker Compose (running locally)

If you want to run Kowl locally take a look at the docker compose sample: [/docs/local](./docs/local).

## Sponsors

<a href="https://www.rewe-digital.com/" target="_blank"><img src="./docs/assets/sponsors/rewe-digital-logo.png" width="150" /></a>

## License

Kowl is distributed under the [Apache 2.0 License](https://github.com/cloudhut/kowl/blob/master/LICENSE).
