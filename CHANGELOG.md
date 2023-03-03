# Changelog

## v2.2.1 / 2023-03-03

- [BUGFIX] Show guessed Kafka version on new overview page
- [BUGFIX] Reduce number of properties shown in stats bar topics & consumer groups page to minimize required browser width
- [BUGFIX] Escape all URL & query parameters. Consumer groups or Kafka connectors with special characters will no longer fail in Console

## v2.2.0 / 2023-02-17

- [FEATURE] Editing topic configurations
- [FEATURE] Rework brokers page into a new overview page
- [ENHACEMENT] Visual update towards a new Redpanda UI theme
- [CHANGE] We removed the support for using encrypted PEM certificates as specified in RFC 1423 because it's insecure by design and should not be used by anyone
- [BUGFIX] Enforce CORS-checks on websocket connection. Defaults to a same-site policy. Allowed origins are configurable via `server.allowedOrigins`
- [BUGFIX] Emit Protobuf default values when viewing the JSON-rendered records in the message viewer
- [BUGFIX] The `server.basePath` option to host Console under a different sub-path was malfunctioning and has been fixed
- [BUGFIX] The schema registry and redpanda admin api client were not using the system's cert pool by default, this has been changed

**Enterprise changelog**

- [FEATURE] We added a new login provider (plain) for username-password authentication
- [BUGFIX] Fix issues with generic OIDC provider when using self-signed or mutual TLS certificates

## v2.1.1 / 2022-12-01

- [ENHACEMENT] Auto refresh capability in the frontend (via https://github.com/redpanda-data/console/pull/536 by @victorgawk)
- [BUGFIX] Some Avro serialized messages failed to deserialize. We replaced LinkedIn's go-avro library with [hamba/avro](https://github.com/hamba/avro) which supports more types

**Enterprise changelog:**

- [ENHACEMENT] Add possibility to chunk session cookie into multiple cookies in order to store more data inside of Cookies. Must be enabled via `login.useCookieChunking`
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
