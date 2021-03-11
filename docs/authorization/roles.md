---
title: Roles
path: /docs/authorization/roles
---

# Roles

<p align="center">
<b>:loudspeaker: This page documents Kowl Business exclusive features.</b>
</p>

In Kowl Business we use Role-based access control (RBAC) to regulate what a user is allowed to do. This section describes the RBAC concepts and how you can create Roles.

## Roles

A Role defines a set of allowed permissions. Permissions are purely additive (there are no "deny" rules). Roles can then be bound to one or more users (see [Role Bindings](./role-bindings.md)).

Roles must be defined in it's own YAML file. Each role requires a name and a set of permissions which belong to it:

```yaml
roles:
  - name: developer
    permissions:
      - resource: consumerGroups
        includes: ["/.*/"]
        excludes: []
        allowedActions: ["admin"]
```

A full example can be found [here](../config/kowl-business-roles.yaml).

### Permissions

The `permissions` property is an array of permissions where each item consists 4 subproperties (`resource`, `includes`, `excludes` and `allowedActions`) which we'll explain now:

#### Resource

Specifies the resource kind on which the permissions shall be applied. To date the following resources exist:

| Resource Name | Description |
|---|---|
| application | Kowl specific permissions |
| topics | Kafka topics |
| acls | Kafka ACLs |
| consumerGroups | Kafka consumer groups |
| cluster | Kafka cluster wide actions |

#### Includes

Includes is an array of strings where each string represents a "selector" on which the allowed actions shall be applied. The selector usually refers to the name of the given resource (e. g. Topic Name, Consumer Group ID, ...). If the string is surrounded with `/` the string is interpreted as regex. Example:

```yaml
- resource: topics
  includes: 
    - "/finance-.*/" # Regex, matches all topic names which begin with "finance-"
    - "fin-agg" # Matches topic with the exact name "fin-agg"
  allowedActions: ["seeTopic"]
```

#### Excludes

Excludes work exactly like includes. They can be used to revert / exclude selectors which had been included. Example:

```yaml
- resource: topics
  includes: 
    - "/finance-.*/" # Regex, matches all topic names which begin with "finance-"
  excludes:
    - "finance-sensitive" # Exclude the topic "finance-sensitive", so that no permissions are applied on this topic
  allowedActions: ["seeTopic"]
```

#### Allowed Actions

The array `allowedActions` defines all actions which shall be granted for your permissions block. You can use granular actions such as `seeTopic` or [primitive actions](#primitive-actions) like `viewer`. Depending on the resource you can apply different actions. 
This is an overview of all actions by resource:

##### Resource: Application

`viewConfig` : Allows you to show Roles and resolved role bindings in an admin panel

##### Resource: Topics

`seeTopic` : See a topic in the topic overview list

`viewPartitions` : View partition details (watermarks, message count, partition IDs, ...)

`viewConfig` :  View Kafka topic configuration

`viewMessages` : View messages in a topic

`useSearchFilter` : Allows the user to use the JavaScript interpreter to filter messages with JavaScript code

`viewConsumers` : View all consumers which consume that topic

##### Resource: ACLs

`viewAcl` : List all ACL rules defined in the cluster

##### Resource: Consumer Groups

`seeConsumerGroup` : See a consumer group in the group overview list along with it's lag information

##### Primitive Actions

We regularly add new features and therefore we also add new actions. Every time we add a new action you must allow that action in your role definitions explicitly so that users can use it. This may be annoying if you don't need granular permissions. For this purpose we provide primitive actions for each resource which basically represent a set of actions as follows:

| Resource Name | Primitive Action | Actions |
|---|---|---|
| `application` | `view` | [`viewConfig`]
| `topics` | `view` | [`seeTopic`, `viewPartitions`, `viewConfig`, `viewMessages`, `useSearchFilter`, `viewConsumers`]
| `acls` | `view` | [`viewAcl`]
| `consumerGroups` | `view` | [`seeConsumerGroup`]
| `application`, `topics`, `consumerGroups` | `edit` | [`view`]
| `application`, `topics`, `consumerGroups` | `admin` | [`edit`]

> :triangular_flag_on_post: As of now there are no editing (e.g. edit consumer group offsets) or administrating features (e.g. delete a Kafka topic). The respective primitive actions (editor, admin) do already exist for each resource though.

### Primitive Roles

Kowl Business provides predefined primitive roles such as `viewer`, `editor` and `admin`. Users who do not need granular permissions can use these roles. As the names suggest these roles can contain either all viewing permissions (e.g. viewing topics...), all editing permissions (e.g. edit consumer group offsets) or administrative permissions (e.g. delete topics).