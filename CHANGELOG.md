# Changelog

## Master / unreleased

- [FEATURE] Embed topic documentation using Markdown files from Git repositories ([/docs/features/topic-documentation.md](/docs/features/topic-documentation.md))
- [FEATURE] Add support for message headers
- [FEATURE] Support for hosting under a sub-path ([#107](https://github.com/cloudhut/kowl/issues/107) and [#117](https://github.com/cloudhut/kowl/issues/117))


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
