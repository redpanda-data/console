---
title: Protobuf Deserialization
path: /docs/features/protobuf
---

# Protobuf Deserialization

If you have one or more topics with Protobuf serialized messages you can configure Kowl to deserialize
the binary content into JSON, so that it will be human readable and can also be used in the filter engine
like a JavaScript object.

To deserialize the binary content Kowl needs access to the used .proto files, as well as a mapping what
Prototype (not file!) to use for each Kafka topic. The .proto files can be provided via the local filesystem
or a Git repository that is cloned and periodically pulled again to make sure it'll remain up to date.

## Preparation

### Local Filesystem

Put all of your required .proto files into a git repository. It doesn't matter in what directory you put them,
but the files' extension must be `.proto`. You can configure Kowl to search one or more paths for proto files:

```yaml
kafka:
  protobuf:
    enabled: true
    mappings: []
      - topicName: xy
        valueProtoType: fake_model.Order # You can specify the proto type for the record key and/or value (just one will work too)
        keyProtoType: package.Type
    fileSystem:
      enabled: true
      refreshInterval: 5m # 5min is the default refresh interval
      paths:
        - /etc/protos
```

### Git repository

If you want to provide the files via a git repository, put all of your required .proto files in there.
It doesn't matter in what directory as Kowl will search for all files with the file extension `.proto`
in your repository up to a directory depth of 5 levels. All files with other file extensions will be ignored.

```yaml
kafka:
  protobuf:
    enabled: true
    mappings: []
      - topicName: xy
        valueProtoType: fake_model.Order # You can specify the proto type for the record key and/or value (just one will work too)
        keyProtoType: package.Type
    git:
      enabled: true
      refreshInterval: 5m
      repository:
        url: https://github.com/cloudhut/owlshop-protos.git
      basicAuth:
        enabled: true
        username: token # Uses an API token via basic auth
        password: redacted
```

### Imports

In order to support imports all prototypes will first be registered in a proto registry so that your
imports can be resolved. Therefore you have to make sure that all imported proto types are part of
the repository. Standard types (such as Google's timestamp type) are included by default so that you
don't need to worry about these.

## Configuration

### Topic mappings

In the configuration you need to provide a list of all mappings between the Kafka Topic (key/value)
and the Prototype that shall be used to deserialize the payload. Let's assume you have a Kafka topic
called `address-v1` and the respective `address.proto` file in your repository which looks like this:

```proto
syntax = "proto3";
package fake_models;

option go_package = "pkg/protobuf";

message Address {
  int32 version = 1;
  string id = 2;
  message Customer {
    string customer_id = 1;
    string customer_type = 2;
  }
}
```

The required configuration would look like this

```yaml
mappings:
  - topicName: address-v1
    valueProtoType: fake_model.Address # The full prototype URL is required
    # keyProtoType: The key is a plain string in Kafka, hence we don't have a prototype for the record's key
```

### Full configuration

Take a look at the reference config how to configure Protobuf in Kowl: [/docs/config/kowl.yaml](https://github.com/cloudhut/kowl/blob/master/docs/config/kowl.yaml)
