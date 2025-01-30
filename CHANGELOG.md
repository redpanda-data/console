# Changelog

## v2.8.2 / 2025-01-10

- [SECURITY] Update `github.com/go-git/go-git/v5` to fix security issue [CVE-2025-21614](https://nvd.nist.gov/vuln/detail/CVE-2025-21614).

## v2.8.1 / 2024-12-18

- [SECURITY] Built with Go 1.23.4 to fix [CVE-2024-45337](https://nvd.nist.gov/vuln/detail/CVE-2024-45337).
- [IMPROVEMENT] Add "Try Again" button if debug bundle creation failed.
- [BUFGIX] Properly handle paths that require escaping in environments that use URL rewriting [1526](https://github.com/redpanda-data/console/pull/1526). 

## v2.8.0 / 2024-12-03

- [FEATURE] Add debug bundle support, enabling Console to now generate cluster wide debug bundles on Redpanda clusters.
- [IMPROVEMENT] Add support for CBOR payload deserialization.
- [IMPROVEMENT] Make git max clone depth configurable.
- [IMPROVEMENT] Redpanda Connect in Cloud functionality and usability improvements.
- [IMPROVEMENT] Relax regex restriction to allow greater set of characters for Role names.
- [CHANGE] Ability to upload Redpanda enterprise licenses via Console, as well as loading licenses from a Redpanda cluster.
- [BUFGIX] Fix the grammar in the partition error message
- [BUFGIX] Fix a rendering error if schemaVersion is requested but not supported.
- [BUFGIX] Fix a bug with topic creation under certain scenarios.
- [BUFGIX] Fix topic list sorting to use partition count.
- [SECURITY] Update elliptic package in frontend.

## v2.7.2 / 2024-09-06

- [SECURITY] Built with Go 1.23.1 which comes with secure CipherSuites by default.
- [IMPROVEMENT] Minor visual improvements (e.g. padding on the loading spinner in the breadcrumb).
- [BUGFIX] When updating or creating ACLs in some cases the Update/Create button remained disabled due to invalid form validation.
- [BUGFIX] Fix resize loop of the Monacco editor in Safari.
- [BUGFIX] Editing a consumer group by timestamp wasn't possible due to a z-index issue with the datepicker.

## v2.7.1 / 2024-08-12

- [IMPROVEMENT] Improve descriptions and columns on Users, ACLs, Roles and Permissions List tab on the security page.
- [BUGFIX] List all ACL and role permissions in user details page. It used to be permissions inherited via roles only.
- [BUGFIX] Selecting a specific deserializer shows a proper error message if it fails.
- [BUGFIX] Fix deserializer for the `__consumer_offsets` topic.

## v2.7.0 / 2024-08-01

- [FEATURE] Add support for managing data transforms in Redpanda.
- [IMPROVEMENT] Reworked message viewer UX to streamline inspecting Kafka records and also fit well for smaller screen sizes.
- [IMPROVEMENT] Improved statistics bar on topics details page.
- [IMPROVEMENT] Better handling for very long resource names such as topic names across all pages.
- [IMPROVEMENT] Add support for mapping protobuf types to topic names in a more flexible fashion using regex.
- [IMPROVEMENT] Add hint that the message count is just an estimate and not guaranteed to be accurate.
- [IMPROVEMENT] Still render the schema registry pages when Console is running with a schema registry that does not support the /types endpoint.
- [IMPROVEMENT] Add support for submodules when using Git as a source for protobuf schemas.
- [IMPROVEMENT] Seperate users and ACLs in the security pages to avoid confusion between users and principals.
- [CHANGE] Remove external news / links from the resources section on the overview page.
- [BUGFIX] Refresh AWS credentials after token expiration when using MSK IAM Auth.
- [BUGFIX] Fix size calculation for log dirs when using shared storages such as S3 / GCS. Applies to topic sizes and broker log dir sizes.
- [BUGFIX] In rare cases decoding Avro records caused a panic. This was fixed by updating the Avro library.
- [BUGFIX] The frontend application used to request a non-existent schema with id: 0 causing an unnecessary backend request.
- [BUGFIX] On the create schema page the Create button was sometimes not disabled even though required field input was not yet provided.
- [BUGFIX] Exponentionally backoff Redpanda adminapi requests if the API is unreachable.
- [BUGFIX] Fix datepicker conversion between UTC and Local times for listing messages and editing group offsets by timestamp.
- [BUGFIX] Schema validation errors were not surfaced in the UI.

## v2.6.1 / 2024-07-10

- [SECURITY] update gorilla/schema to address CVE-2024-37298.
- [SECURITY] update grpc to v1.65.0 to avoid OSV:GHSA-XR7Q-JX4M-X55M.
- [SECURITY] new build to address CVE-2024-6387.

## v2.6.0 / 2024-05-30

- [FEATURE] Add Redpanda Connect management.

## v2.5.2 / 2024-04-30

- [CHANGE] Update dependencies.

## v2.5.1 / 2024-04-26

- [SECURITY] Update Go to version 1.22.2.

## v2.5.0 / 2024-04-26

- [FEATURE] Add Redpanda Role management.

## v2.4.7 / 2024-04-23

- [CHANGE] Update dependencies.
- [BUGFIX] Allow `ListMessages` and `PublishMessage` calls in non-Cloud deployments.

## v2.4.6 / 2024-04-09

- [SECURITY] Update Go to v1.22.2 to address [CVE-2023-45288]([https://nvd.nist.gov/vuln/detail](https://nvd.nist.gov/vuln/detail)/CVE-2023-45288)
- [SECURITY] Authenticated Console users with assigned viewer permissions were able to successfully perform operations that would require admin permissions (e.g. creating ACLs). This does not affect users in Redpanda Cloud.
- [BUGFIX] Fix empty toast feedback when reassigning partitions in the UI.
- [IMPROVEMENT] Surface dynamic broker error messages in the UI if operations such as creating topics failed.

## v2.4.5 / 2024-03-06

- [SECURITY] Update Go to v1.22.1 to address multiple [CVEs](https://groups.google.com/g/golang-announce/c/5pwGVUPoMbg).
- [IMPROVEMENT] Wrap long topic names instead of truncating them in the topics list [#1159](https://github.com/redpanda-data/console/pull/1159).

## v2.4.4 / 2024-03-04

- [BUGFIX] Fix for glob patterns for adapting the preview in the list messages table [#1116](https://github.com/redpanda-data/console/pull/1116).
- [BUGFIX] Show last available page in paginated search results to avoid blank page content [#1121](https://github.com/redpanda-data/console/pull/1121).
- [BUGFIX] Send heartbeats in HTTP stream to load messages to avoid idle timeouts from LoadBalancers and reverse proxies [#1109](https://github.com/redpanda-data/console/pull/1109).
- [IMPROVEMENT] Better handling for long resource names (e.g. topic names) in the UI [#1124](https://github.com/redpanda-data/console/pull/1124).
- [IMPROVEMENT] Add option to download messages that are too large to be displayed by default [#1129](https://github.com/redpanda-data/console/pull/1129).
- [IMPROVEMENT] Add `offset.lag.max` option to advanced configuration in the MirrorMaker2 connector setup [#1131](https://github.com/redpanda-data/console/pull/1131).

## v2.4.3 / 2024-02-08

- [BUGFIX] Persist pagination settings in local storage [#1095](https://github.com/redpanda-data/console/pull/1095).
- [BUGFIX] Re-add search bar to filter connectors by their name [#1094](https://github.com/redpanda-data/console/pull/1094).
- [BUGFIX] Only update the custom offset in the message search if it's a number [#1092](https://github.com/redpanda-data/console/pull/1092).
- [BUGFIX] Pushdown filters no longer failed to match when plain strings in key or value were used [#1093](https://github.com/redpanda-data/console/pull/1093).
- [IMPROVEMENT] Cache custom offset input in message search [#1092](https://github.com/redpanda-data/console/pull/1092).

## v2.4.2 / 2024-02-06

- [BUGFIX] Fix pagination issue in frontend.
- [BUGFIX] Fix regex filtering issue in ACL screen in frontend [#1080](https://github.com/redpanda-data/console/issues/1080).
- [BUGFIX] Fix inconsistent filtering issue with list messages API when using pushdown filters [#1073](https://github.com/redpanda-data/console/issues/1073).
- [IMPROVEMENT] Optimize schema registry protobuf refresh to reduce memory usage [#1040](https://github.com/redpanda-data/console/pull/1040).

## v2.4.1 / 2024-02-02

- [BUGFIX] Fix bug in schema registry URL paths for subject names that used escaping characters (i.e. %2F)
- [BUGFIX] The pagination component to select different pages always shows up now [#1034](https://github.com/redpanda-data/console/issues/1032)
- [BUGFIX] When sorting the Kafka topics by size the order was off, the column ordering is fixed now
- [BUGFIX] Using the "copy value" action for a Kafka record no longer includes the payload property multiple times [#1054](https://github.com/redpanda-data/console/issues/1054)
- [BUGFIX] Selecting the "size" column as the only column to show in the table settings used to throw an exception [#1051](https://github.com/redpanda-data/console/issues/1051)
- [BUGFIX] Fix decoding for msgpack encoded payloads [#1034](https://github.com/redpanda-data/console/issues/1034)
- [BUGFIX] Under certain circumstances the download messages button downloaded an empty JSON array instead of the shown records [#1031](https://github.com/redpanda-data/console/issues/1031)
- [BUGFIX] Searching for topics in the topicslist' quicksearch box using a regex did no longer work [#1026](https://github.com/redpanda-data/console/issues/1026)
- [IMPROVEMENT] Document new `console.maxDeserializationPayloadSize` config to control max message size that is still shown in the frontend

## v2.3.10 / 2024-01-29

- [BUGFIX] Fix bug in schema registry URL paths.
- [CHANGE] Add better error logging for websocket upgrade.

## v2.4.0 / 2024-01-23

- [FEATURE] Specify strategy (e.g. INT8) for decoding messages
- [FEATURE] Show summary of each failed decoding strategy when auto decoding messages fails
- [FEATURE] Full schema management (create, update, delete, compare versions)
- [IMPROVEMENT] Add button to copy password to clipboard after creating a new user
- [IMPROVEMENT] Deprecate Websockets in favour of HTTP streaming for streaming messages
- [IMPROVEMENT] Align UI with Redpanda theme by migrating frontend components from AntD to Redpanda's UI library
- [IMPROVEMENT] Several improvements for existing and new connectors in the Kafka Connect setup wizard

## v2.3.9 / 2024-01-15

- [SECURITY] Update update github.com/go-git/go-git/v5 to address CVE-2023-4956.

## v2.3.8 / 2023-12-06

- [SECURITY] Update a dependency that may allow to run a DoS attack

## v2.3.7 / 2023-11-17

- [SECURITY] Build new Docker image running with the latest openssl/libcrypto3 lib which addresses CVE-2023-5363. The previous v2.3.6 did in fact not fix this CVE.

## v2.3.6 / 2023-11-16

- [SECURITY] ~~Build new Docker image running with the latest openssl/libcrypto3 lib which addresses CVE-2023-5363~~

## v2.3.5 / 2023-10-16

- [BUGFIX] Add commonly pre-registered protobuf types to support automatic deserialization.

## v2.3.4 / 2023-10-10

- [BUGFIX] Build with latest Alpine image to address CVE-2023-38039.

## v2.3.3 / 2023-09-14

- [BUGFIX] Get all schemas for protobuf compilation in order to support records of multiple versions of same schema.
- [IMPROVEMENT] Add numeric values to the deserializer. Console will attempt to deserialize payloads as big endian uints.

## v2.3.2 / 2023-09-05

- [BUGFIX] Fix base64 decoding of 'utf8WithControlChars' in frontend
- [ENHANCEMENT] Update Avro dependency

## v2.3.1 / 2023-08-01

- [BUGFIX] Fix regression with Avro deserialization

## v2.3.0 / 2023-07-21

- [FEATURE] New Kafka connect setup & edit experience
- [ENHANCEMENT] Support for serving Console on HTTPS / TLS Termination
- [ENHANCEMENT] Support deserializing Avro payloads with schema references (by @igormq)
- [ENHANCEMENT] Configurable Kafka connection retry parameters (new config block: `kafka.startup`)
- [BUGFIX] Show correct controllerId on the overview page
- [CHANGE] Run docker container as non-root user
- [CHANGE] Don't log expected error messages for context cancellation on message search

**Enterprise changelog**

- [FEATURE] Support Keycloak as identity provider
- [FEATURE] Support AzureAD as identity provider
- [BUGFIX] Report license expiry time correctly

## v2.2.5 / 2023-07-11

- [SECURITY] Build new Docker image running on latest 3.17 Alpine which addresses CVE-2023-28531
  
## v2.2.4 / 2023-05-03

- [ENHANCEMENT] Set `USER` instruction to `redpandaconsole` in Dockerfile.

## v2.2.3 / 2023-03-22

- [ENHANCEMENT] Build with CGO disabled.
- [ENHANCEMENT] Various improvements to authorization.

## v2.2.2 / 2023-03-03

- [ENHANCEMENT] Report license expiry time.

## v2.2.1 / 2023-03-03

- [ENHANCEMENT] Build with Go v1.20
- [BUGFIX] Show guessed Kafka version on new overview page
- [BUGFIX] Reduce number of properties shown in stats bar topics & consumer groups page to minimize required browser width
- [BUGFIX] Escape all URL & query parameters. Consumer groups or Kafka connectors with special characters will no longer fail in Console

## v2.2.0 / 2023-02-17

- [FEATURE] Editing topic configurations
- [FEATURE] Rework brokers page into a new overview page
- [ENHANCEMENT] Visual update towards a new Redpanda UI theme
- [CHANGE] We removed the support for using encrypted PEM certificates as specified in RFC 1423 because it's insecure by design and should not be used by anyone
- [BUGFIX] Enforce CORS-checks on websocket connection. Defaults to a same-site policy. Allowed origins are configurable via `server.allowedOrigins`
- [BUGFIX] Emit Protobuf default values when viewing the JSON-rendered records in the message viewer
- [BUGFIX] The `server.basePath` option to host Console under a different sub-path was malfunctioning and has been fixed
- [BUGFIX] The schema registry and redpanda admin api client were not using the system's cert pool by default, this has been changed

**Enterprise changelog**

- [FEATURE] We added a new login provider (plain) for username-password authentication
- [BUGFIX] Fix issues with generic OIDC provider when using self-signed or mutual TLS certificates

## v2.1.1 / 2022-12-01

- [ENHANCEMENT] Auto refresh capability in the frontend (via https://github.com/redpanda-data/console/pull/536 by @victorgawk)
- [BUGFIX] Some Avro serialized messages failed to deserialize. We replaced LinkedIn's go-avro library with [hamba/avro](https://github.com/hamba/avro) which supports more types

**Enterprise changelog:**

- [ENHANCEMENT] Add possibility to chunk session cookie into multiple cookies in order to store more data inside of Cookies. Must be enabled via `login.useCookieChunking`
- [BUGFIX] Only refresh session tokens if they are actually about to expire 

## 2.1.0 / 2022-11-15

- [FEATURE] ACL management (create/update/delete ACLs)
- [FEATURE] User management (create/update/delete SASL SCRAM & Redpanda users)
- [FEATURE] Add checkbox to show/hide internal Kafka topics
- [ENHANCEMENT] Improve Kafka connect dialog for MM2 connectors
- [ENHANCEMENT] Show all byte sizes in IEC units such as KiB, MiB etc. (binary prefix)
- [ENHANCEMENT] Split all Kafka connect options in Basic & Advanced properties
- [ENHANCEMENT] Add anonymous usage stats (you can opt out by setting `analytics.enabled` to `false`)
- [ENHANCEMENT] Use separate Kafka API (`DeleteGroups`) to delete consumer groups rather than deleting all its group offsets
- [BUGFIX] Remove default blanklines from editor when producing Kafka records

**Enterprise changelog:**

- [FEATURE] Add support for hot-reloading RBAC role bindings
- [ENHANCEMENT] Support for self-signed TLS certificates when connecting to an OIDC endpoint
- [ENHANCEMENT] Print decoded OIDC token claims if the claim key could not be found for an authenticated user

## 2.0.0 / 2022-08-10

- [CHANGE] We provide a single build for Redpanda Console & Redpanda Console Enterprise, so that you can upgrade versions by just setting a license key.
- [FEATURE] Rebrand Kowl to Redpanda Console
- [FEATURE] Create Topics
- [FEATURE] Publish Kafka records (JSON, Text & Hex/Binary as of today, no schema registry support yet)
- [FEATURE] Add Quotas pages that lists all kinds of configured Kafka Quotas (requires Kafka v2.6+)
- [FEATURE] Add single-binary build, linux packages, ARM-builds for Docker images
- [ENHANCEMENT] Retry connecting if initial bootstrap connection fails with a backoff timer
- [CHANGE] Rename `owl` config property to `console` (breaking change)
- [BUGFIX] Configurations with camel cased YAML properties can now be specified via environment variables as well

**Enterprise changelog:**

- [CHANGE] Breaking changes on the configuration (see documentation for new config structure around RBAC & Login)
- [FEATURE] Introduce support for a generic OpenID Connect provider interface

**Note:** The documentation for Redpanda Console has been moved to Redpanda. You can find the docs here:

- Installation: https://docs.redpanda.com/docs/platform/quickstart/console-installation/
- Configuration: https://docs.redpanda.com/docs/platform/console/

## 1.5.0 / 2021-11-10

- [FEATURE] Add support for deleting topics
- [FEATURE] Add support for deleting records within topics (only possible on topics with cleanup.policy=delete due to limitations in Kafka)
- [FEATURE] Add support for managing multiple Kafka connect clusters via Kowl
- [FEATURE] Create new Kafka connectors via a setup wizard
- [ENHANCEMENT] Highlight leader broker for each partition in the topic's partition table
- [ENHANCEMENT] Embed quicksearch on topic list into table headers (experimental)
- [ENHANCEMENT] List respective ACLs on topic & consumer group detail page
- [ENHANCEMENT] Add Kafka 3.0 support
- [ENHANCEMENT] Broker lists (for example in a topic's 'Partitions' tab) now show which broker is leading the partition
- [ENHANCEMENT] You can now configure the `baseDirectory` for all Git file providers (e.g. topic docs or protobuf source)
- [BUGFIX] Broker page does no longer show an error if a broker failed to respond to a DescribeConfigs request

## 1.4.0 / 2021-05-27

- [FEATURE] Proto files can now be provided via the local file system as well
- [FEATURE] Schema registry support for Protobuf (including auto deserialization)
- [FEATURE] Consumer group offsets can now be edited (copy offsets from other group, set to start/end/timestamp) or deleted
- [ENHANCEMENT] Add two new Kafka SASL Mechanisms: OAuthBearer and AWS MSK IAM
- [ENHANCEMENT] Preview tags in the message viewer can now be named
- [ENHANCEMENT] Maximum string length in JSON viewer has been increased from 40 to 200 characters
- [ENHANCEMENT] CTRL + Click on values in JSON viewer will copy the value into the clipboard
- [ENHANCEMENT] Menu redesigned (profile info for Kowl Business moved to menu bar)
- [ENHANCEMENT] Rework broker & topic config pages; Shows config sources and all inherited config settings with their value
- [ENHANCEMENT] Custom TLS config for schema registry
- [ENHANCEMENT] Estimate topic log dir size if partition replicas are down (if size is estimated a warning is shown in the frontend)
- [ENHANCEMENT] Messages can now be expanded/collapsed by double-clicking a row
- [ENHANCEMENT] Group details page: 'Topics' view now has a 'View Topic' button, and the topic names in the 'Members' view are now clickable (both navigate to the topic details page)
- [BUGFIX] Topicname is now selectable in consumer group details page
- [BUGFIX] Relative timestamp now updates live in message table

## 1.3.0 / 2021-04-13

- [CHANGE] We removed the Kafka library and replaced it with [franz-go](https://github.com/twmb/franz-go). This allows us to add a lot more features in the future.
- [CHANGE] Configuration for the topic documentation feature has changed
- [CHANGE] When the root "value" of a message has 0 bytes, it is now correctly deserialized to `nil` instead of `""`. If you use filters in the frontend to filter tombstones you probably used `value != ""` before, but with this change you'll have to use `value != null`.
- [FEATURE] Support setting the listen adress of the webserver (config entry: `server.http.listen-address`, or flag: `listenAddress`). [#150](https://github.com/cloudhut/kowl/issues/150) 
- **[FEATURE] Add Protobuf support**
- **[FEATURE] Preview Tags has been reworked. Now supports nested tags and autocomplete. Tags can be editted and reordered.**
- **[FEATURE] You can now save messages by clicking the 'Save Messages' button below the message list, or save a single message from its context menu (right-most column of a message row, visible on hover)**
- **[FEATURE] Reassign partitions via setup wizard. Use it to balance partition count, disk usage, move replicas to new brokers or decomission brokers**
- [FEATURE] Add rackId config option to consume from brokers that reside in the same rack if possible (rack aware consuming)
- [FEATURE] Add MessagePack support in deserializer
- [FEATURE] You can now select a date/time as the "start offset" when searching for messages.
- [ENHANCEMENT] Show rebalance protocol and coordinator id in consumer group pages
- [ENHANCEMENT] Kowl can now be configured using environment variables as well
- [ENHANCEMENT] Show Kafka version in Brokers page
- [ENHANCEMENT] Add support for decoding messages in the `__consumer_offsets` topic
- [ENHANCEMENT] Support schema registry with thousands of subjects by reducing the number of information in the schema registry overview page
- [BUGFIX] Deserialize messages with Avro with a higher priority than UTF-8 messages, so that Avro serialized messages will always be recognized correctly
- [BUGFIX] Fix deadlock where schema registry requests against older Schema Registries would time out due to the missing /mode endpoint.
- [BUGFIX] ResourcePatternType is now correctly shown in the ACLs list.


## 1.2.2 / 2020-11-23
- [ENHANCEMENT] Schema registry page has been slightly redesigned so that very complex schemas are more comfortable to inspect
- [BUGFIX] Fixed rendering errors in schema registry page

## 1.2.1 / 2020-11-16
- [ENHANCEMENT] Message headers can be expanded/collapsed now
- [BUGFIX] Kowl now handles message headers containing structured data (JSON) correctly

## 1.2.0 / 2020-11-14

- **[FEATURE] Embed topic documentation using Markdown files from Git repositories ([/docs/features/topic-documentation.md](/docs/features/topic-documentation.md))**
- **[FEATURE] Support for message headers**
- **[FEATURE] UI for schema registry (list all registered schemas including schema history)**
- **[FEATURE] Avro support for deserializing messages**
- [FEATURE] List all Kafka ACLs
- [FEATURE] Business: Support for Okta as an identity provider
- [FEATURE] Support for hosting Kowl under a sub-path ([#107](https://github.com/cloudhut/kowl/issues/107) and [#117](https://github.com/cloudhut/kowl/issues/117))
- [ENHANCEMENT] Possibility to hide the statistics bar
- [ENHANCEMENT] Support custom certificates for schema registry client
- [ENHANCEMENT] Show elapsed time and consumed bytes after filtered message consumption is done
- [BUGFIX] Kowl now shows the error reported by a login provider (should the login fail)
- [BUGFIX] Better handling for broker restarts on consumer groups and topics page
- [BUGFIX] Allow all UTF-8 characters in JavaScript filter code
- [BUGFIX] Inform user about missing clipboard access instead of silent fails on message copy

## 1.1.0 / 2020-08-06

- [CHANGE] Business: Reworked groups syncing (Google + GitHub)
- [CHANGE] Business: GitHub team sync uses uses personal access tokens instead of GitHub apps (better support for multi organization environments)
- [CHANGE] Business: Groups/Teams sync config has changed, see https://github.com/cloudhut/kowl/commit/0f22cd7b18268ecb3be88fe2bc3de8ac9e8febed
- **[FEATURE] Search messages with an arbitrary JavaScript filter (https://github.com/cloudhut/kowl/issues/48)**
- **[FEATURE] Get Kafka messages as they arrive (live tail)**
- [ENHANCEMENT] Message table: You can now select the visible columns and their order (https://github.com/cloudhut/kowl/issues/52)
- [ENHANCEMENT] Message table: The desired timestamp format can be configured (Only date, only time, unix timestamp, relative) (https://github.com/cloudhut/kowl/issues/52)
- [ENHANCEMENT] Message table: The no key icon now shows a tooltip to explain the icon's meaning (https://github.com/cloudhut/kowl/issues/52)
- [ENHANCEMENT] Add endpoint for startup probes (https://github.com/cloudhut/kowl/issues/101)
- [BUGFIX] After clicking the refresh button it didn't always change the state to "Refreshing" (https://github.com/cloudhut/kowl/issues/75)

## 1.0.0 / 2020-06-24

- [CHANGE] Tabs in a topic detail view have been reordered, and the messages tab is now selected by default
- [CHANGE] Deselecting the input field in the "Preview Settings" dialog (or closing the dialog) will be considered as a confirmation now (instead of cancelling the tag that is being added)
- [FEATURE] Additional filter options (case sensitivity and multi results) for field previews
- [ENHANCEMENT] In the message table, long keys will now be truncated (>45 chars). Click on a key to show a dialog containing the full key
- [ENHANCEMENT] Statistics elements will now reduce their size on smaller screens ![image](https://i.imgur.com/18YqrgY.png)
- [ENHANCEMENT] If you are missing some permissions for a topic (for example: can't view config, or can't view messages), there's now an icon that will be shown for that topic in the topic list. Hovering over it will show the permission details.
- [ENHANCEMENT] The 'state' (icon + text) of a consumer-groups now also has a popover that - when hovering over the state - shows a table listing all possible states along with some descriptions. ![image](https://i.imgur.com/OEYwqnN.png)
- [ENHANCEMENT] Topic statistics won't show `retention.bytes`/`retention.ms` for compact topics
- [BUGFIX] Fixed issues with page sizes and column sorting in tables
- [BUGFIX] Fixed the calculation of replicated and total partitions
- [BUGFIX] Preview Tags: properties shown are now in the correct casing (as they are defined in the object)

## 1.0.0-beta1 / 2020-05-24

This is the initial release which comes with all the currently known features.
