# Kowl

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/cloudhut/kowl/blob/master/LICENSE) [![Go Report Card](https://goreportcard.com/badge/github.com/cloudhut/kowl)](https://goreportcard.com/report/github.com/cloudhut/kowl) ![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/cloudhut/kowl?sort=semver) [![Docker Repository on Quay](https://quay.io/repository/cloudhut/kowl/status "Docker Repository on Quay")](https://quay.io/repository/cloudhut/kowl)

Kowl (previously known as Kafka Owl) helps you to explore messages in your cluster's topics and get better insights on what is actually happening in your Kafka cluster in the most comfortable way:

![preview](docs/assets/preview.gif)

## Features

- **Message viewer:** Explore your topics' messages in our message viewer through ad-hoc queries and dynamic filters.
- **Consumer groups:** List all your active consumer groups along with their active group offsets. You can view a visualization of group lags either by topic (sum of all partition lags), single partitions or the sum of all partition lags (group lag)
- **Topic overview:** Browse through the list of your Kafka topics, check their configuration, space usage, list all consumers who consume a single topic or watch partition details (such as low and high water marks, message count, ...).
- **Cluster overview:**: List available brokers, their space usage, rack id and other information to get a high level overview of your brokers in your cluster.

|  | Kowl | Kowl Business |
| :--- | :---: | :---: |
| **Topic Overview** | :white_check_mark: | :white_check_mark:  |
| **Consumer Group Overview** | :white_check_mark: | :white_check_mark:  |
| **Broker/Cluster Overview** | :white_check_mark: | :white_check_mark:  |
| **Message viewer** | :white_check_mark: | :white_check_mark:  |
| **Login System (Google, GitHub OAuth)** | :x: | :white_check_mark:  |
| **RBAC permissions with group syncing** | :x: | :white_check_mark:  |
| **Price**     | Always free / Open source       | $9 per Seat / Month, 2 Seats always free  |

## Install

### Docker images

Docker images are available on [Quay.io](https://quay.io/repository/cloudhut/kowl?tab=tags).
We automatically push a docker images with a unique tag for each new release. Additionally we publish a docker images
after each push to master.

### Helm chart

Kubernetes users may want to use the Helm chart to deploy Kowl: https://github.com/kafka-owl/helm-chart

### Configuration

Kowl can be configured via flags (arguments) and a YAML config file. Flags are only meant to be used to set the
the path to your config file and for sensitive input such as passwords. YAML settings take precedence over flag configs.

#### Flags

| Argument | Description | Default |
| --- | --- | --- |
| --config.filepath | Path to the config file | (No default) |
| --kafka.sasl.password | SASL Password | (No default) |
| --kafka.sasl.gssapi.password | Kerberos password if auth type user auth is used | (No default) |
| --kafka.tls.passphrase | Passphrase to decrypt the TLS key (leave empty for unencrypted key files) | (No default) |

#### YAML Config

You can find a reference of all available config options under [/docs/config/kowl.yaml](docs/config/kowl.yaml)
