# Buf Schema Registry (BSR) Integration

This document describes the integration of Buf Schema Registry (BSR) support in Redpanda Console.

## Overview

Redpanda Console now supports deserializing Protobuf messages that use Buf Schema Registry (BSR) for schema management. Unlike Confluent Schema Registry, clients of BSR (including Bufstream) stores message type and commit information in Kafka record headers rather than embedding schema IDs in the message payload.

## Wire Format

BSR Kafka clients use a different wire format compared to Confluent Schema Registry:

- **Confluent Schema Registry**: `[magic_byte][schema_id][index_array][protobuf_payload]`
- **BSR Kafka clients**: Plain protobuf payload with metadata in headers

### Record Headers

BSR Kafka clieints stores schema information in Kafka record headers:

- **`buf.registry.value.schema.message`**: Fully qualified message name (e.g., `com.example.EmailUpdated`)
- **`buf.registry.value.schema.commit`**: BSR commit ID for the schema version

## Configuration

To enable BSR support, add the following configuration to your `config.yaml`:

```yaml
bsr:
  enabled: true
  url: "https://buf.build"  # or your BSR instance URL
  token: "your-bsr-auth-token"
```

### Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | Enable BSR integration |
| `url` | string | Yes | BSR API endpoint URL (e.g., `https://buf.build` or `https://demo.buf.dev`) |
| `token` | string | Yes | Authentication token for BSR API |

### Environment Variables

You can also configure BSR using environment variables:

```bash
export CONFIG_BSR_ENABLED=true
export CONFIG_BSR_URL=https://buf.build
export CONFIG_BSR_TOKEN=your-bsr-auth-token
```

## How It Works

### Deserialization Flow

1. **Header Extraction**: When a message is consumed, the BSR serde checks for BSR headers in the Kafka record
2. **Descriptor Lookup**: Using the message name and commit from headers, the BSR client fetches the protobuf descriptor from BSR
3. **Binary Decoding**: The raw protobuf payload is unmarshaled using the fetched descriptor
4. **JSON Conversion**: The protobuf message is converted to JSON for display in the console

### Caching

The BSR client implements intelligent caching to minimize API calls:

- **Positive Cache**: Successfully fetched descriptors are cached for 1 hour
- **Negative Cache**: Failed lookups are cached for 1 minute to avoid repeated failures
- Cache keys are based on `(message_name, commit)` pairs

### API Integration

The integration uses the Buf Connect API:

- **Endpoint**: `/buf.registry.module.v1.FileDescriptorSetService/GetFileDescriptorSet`
- **Protocol**: gRPC via Connect
- **Authentication**: Bearer token in `Authorization` header

## Example Usage

### Producing Messages with BSR Headers

When producing messages, ensure you include the BSR headers:

```go
import (
    "github.com/twmb/franz-go/pkg/kgo"
)

record := &kgo.Record{
    Topic: "my-topic",
    Value: protoBytes, // raw protobuf payload
    Headers: []kgo.RecordHeader{
        {
            Key:   "buf.registry.value.schema.message",
            Value: []byte("com.example.v1.EmailUpdated"),
        },
        {
            Key:   "buf.registry.value.schema.commit",
            Value: []byte("abc123def456"),  // BSR commit ID
        },
    },
}
```

### Viewing Messages in Console

Once configured, messages with BSR headers will automatically be deserialized and displayed as JSON in the Redpanda Console message viewer.

## Implementation Details

### Key Components

1. **`pkg/config/bsr.go`**: BSR configuration structure
2. **`pkg/bsr/client.go`**: BSR API client with caching
3. **`pkg/serde/protobuf_bsr.go`**: BSR deserialization logic
4. **`pkg/serde/service.go`**: Integration with serde service
5. **`pkg/console/service.go`**: Console service initialization

### Serde Priority

BSR serde is registered in the deserialization chain after:
- Null
- JSON
- JSON Schema
- XML
- Avro
- Plain Protobuf (with topic mappings)
- Protobuf Schema Registry

This ensures BSR is only attempted when other formats don't match.

## Comparison with Confluent Schema Registry

| Feature | Confluent Schema Registry | BSR |
|---------|---------------------------|-----|
| Schema ID Location | Embedded in payload | Headers |
| Wire Format | Custom (magic byte + schema ID) | Plain protobuf |
| Message Type Info | Index array in payload | Fully qualified name in header |
| Version Info | Schema ID (integer) | Commit ID (string) |
| Compatibility | Kafka ecosystem standard | Buf ecosystem |

## Troubleshooting

### Messages Not Deserializing

1. **Check Headers**: Ensure messages have both required BSR headers
   ```
   buf.registry.value.schema.message
   buf.registry.value.schema.commit
   ```

2. **Verify Configuration**: Confirm BSR is enabled and credentials are correct
   ```bash
   # Test BSR API access
   curl -H "Authorization: Bearer $TOKEN" \
        "https://buf.build/buf.registry.module.v1.FileDescriptorSetService/GetFileDescriptorSet"
   ```

3. **Check Logs**: Look for BSR-related errors in console logs
   ```
   level=error msg="failed to get message descriptor from BSR"
   ```

### Common Errors

- **"BSR client is not configured"**: BSR is not enabled in config
- **"header not found"**: Message is missing required BSR headers
- **"failed to call BSR API"**: Network or authentication issue
- **"failed to find message descriptor"**: Message type not found in commit

## Limitations

- Only supports value deserialization (not keys) - BSR typically only encodes values
- Requires network access to BSR API
- Serialization support is basic (no automatic header injection)

## Future Enhancements

Potential improvements for future releases:

1. Support for BSR key encoding
2. Automatic header injection during message production
3. Support for BSR modules (not just commit IDs)
4. Configurable cache TTLs
5. Metrics for BSR API calls and cache hit rates

## References

- [Buf Schema Registry Documentation](https://buf.build/docs/bsr)
- [bsr-kafka-serde-go](https://github.com/bufbuild/bsr-kafka-serde-go)
- [Buf Connect Protocol](https://connectrpc.com/)
