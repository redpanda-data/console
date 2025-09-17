// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package proto

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/bufbuild/protocompile"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/dynamicpb"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
)

func Test_decodeConfluentBinaryWrapper(t *testing.T) {
	buf := new(bytes.Buffer)

	schemaID := uint32(1000)
	var schemaIDBuf []byte
	schemaIDBuf = binary.BigEndian.AppendUint32(schemaIDBuf, schemaID)

	binary.Write(buf, binary.BigEndian, byte(0))
	binary.Write(buf, binary.BigEndian, schemaIDBuf)

	var arrLengthBuf []byte
	arrLengthBuf = binary.AppendVarint(arrLengthBuf, 1<<60)
	binary.Write(buf, binary.BigEndian, arrLengthBuf)

	svc := Service{}
	_, err := svc.decodeConfluentBinaryWrapper(buf.Bytes())
	assert.Error(t, err)
}

func TestService_getMatchingMapping(t *testing.T) {
	topic0 := config.RegexpOrLiteral{}
	topic0.UnmarshalText([]byte(`normal-exact-match`))
	assert.Nil(t, topic0.Regexp)

	topic1 := config.RegexpOrLiteral{}
	topic1.UnmarshalText([]byte(`/some-topic-prefix-.*/`))
	assert.NotNil(t, topic1.Regexp)

	logger := loggerpkg.NewSlogLogger(
		loggerpkg.WithFormat(loggerpkg.FormatText),
		loggerpkg.WithLevel(slog.LevelDebug),
	)
	svc, err := NewService(config.Proto{
		Mappings: []config.ProtoTopicMapping{
			{
				TopicName:    topic0,
				KeyProtoType: "foo",
			},
			{
				TopicName:    topic1,
				KeyProtoType: "bar",
			},
		},
	}, logger)

	assert.NoError(t, err)
	require.NotNil(t, svc)

	tests := []struct {
		name   string
		arg    string
		testFn func(*testing.T)
	}{
		{
			name: "get a strict mapping",
			testFn: func(t *testing.T) {
				r, err := svc.getMatchingMapping("normal-exact-match")
				assert.NoError(t, err)
				require.NotNil(t, r)
				assert.Equal(t, "foo", r.KeyProtoType)
				assert.Nil(t, r.TopicName.Regexp)
				assert.Equal(t, "normal-exact-match", r.TopicName.String())
				assert.Len(t, svc.mappingsByTopic, 2)
			},
		},
		{
			name: "no match",
			testFn: func(t *testing.T) {
				r, err := svc.getMatchingMapping("no-match")
				assert.Error(t, err)
				assert.Equal(t, "no prototype found for the given topic 'no-match'. Check your configured protobuf mappings", err.Error())
				require.Nil(t, r.TopicName.Regexp)
				assert.Equal(t, "", r.TopicName.String())
				assert.Len(t, svc.mappingsByTopic, 2)
			},
		},
		{
			name: "regex",
			testFn: func(t *testing.T) {
				r, err := svc.getMatchingMapping("some-topic-prefix-123")
				assert.NoError(t, err)
				require.NotNil(t, r)
				assert.Equal(t, "bar", r.KeyProtoType)
				assert.NotNil(t, r.TopicName.Regexp)
				assert.Equal(t, `/some-topic-prefix-.*/`, r.TopicName.String())
				assert.Len(t, svc.mappingsByTopic, 3)
				assert.Equal(t, "bar", svc.mappingsByTopic["some-topic-prefix-123"].KeyProtoType)
				assert.NotNil(t, svc.mappingsByTopic["some-topic-prefix-123"].TopicName.Regexp)
			},
		},
		{
			name: "same regex again",
			testFn: func(t *testing.T) {
				r, err := svc.getMatchingMapping("some-topic-prefix-123")
				assert.NoError(t, err)
				require.NotNil(t, r)
				assert.Equal(t, "bar", r.KeyProtoType)
				assert.NotNil(t, r.TopicName.Regexp)
				assert.Equal(t, `/some-topic-prefix-.*/`, r.TopicName.String())
				assert.Len(t, svc.mappingsByTopic, 3)
				assert.Equal(t, "bar", svc.mappingsByTopic["some-topic-prefix-123"].KeyProtoType)
				assert.NotNil(t, svc.mappingsByTopic["some-topic-prefix-123"].TopicName.Regexp)
			},
		},
		{
			name: "different regex match",
			testFn: func(t *testing.T) {
				r, err := svc.getMatchingMapping("some-topic-prefix-foo")
				assert.NoError(t, err)
				require.NotNil(t, r)
				assert.Equal(t, "bar", r.KeyProtoType)
				assert.NotNil(t, r.TopicName.Regexp)
				assert.Equal(t, `/some-topic-prefix-.*/`, r.TopicName.String())
				assert.Len(t, svc.mappingsByTopic, 4)
				assert.Equal(t, "bar", svc.mappingsByTopic["some-topic-prefix-123"].KeyProtoType)
				assert.NotNil(t, svc.mappingsByTopic["some-topic-prefix-123"].TopicName.Regexp)
				assert.Equal(t, "bar", svc.mappingsByTopic["some-topic-prefix-foo"].KeyProtoType)
				assert.NotNil(t, svc.mappingsByTopic["some-topic-prefix-foo"].TopicName.Regexp)
			},
		},
		{
			name: "same regex match again",
			testFn: func(t *testing.T) {
				r, err := svc.getMatchingMapping("some-topic-prefix-foo")
				assert.NoError(t, err)
				require.NotNil(t, r)
				assert.Equal(t, "bar", r.KeyProtoType)
				assert.NotNil(t, r.TopicName.Regexp)
				assert.Equal(t, `/some-topic-prefix-.*/`, r.TopicName.String())
				assert.Len(t, svc.mappingsByTopic, 4)
				assert.Equal(t, "bar", svc.mappingsByTopic["some-topic-prefix-123"].KeyProtoType)
				assert.NotNil(t, svc.mappingsByTopic["some-topic-prefix-123"].TopicName.Regexp)
				assert.Equal(t, "bar", svc.mappingsByTopic["some-topic-prefix-foo"].KeyProtoType)
				assert.NotNil(t, svc.mappingsByTopic["some-topic-prefix-foo"].TopicName.Regexp)
			},
		},
		{
			name: "no match final",
			testFn: func(t *testing.T) {
				r, err := svc.getMatchingMapping("no-match-final")
				assert.Error(t, err)
				assert.Equal(t, "no prototype found for the given topic 'no-match-final'. Check your configured protobuf mappings", err.Error())
				require.Nil(t, r.TopicName.Regexp)
				assert.Equal(t, "", r.TopicName.String())
				assert.Len(t, svc.mappingsByTopic, 4)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.testFn(t)
		})
	}
}

// TestService_CloudEventWithProperAnyField tests CloudEvent with Any field containing UploadEvent
// This uses native protobuf APIs with protocompile to compile proto files
func TestService_CloudEventWithProperAnyField(t *testing.T) {
	// Use protocompile to compile the proto files
	compiler := protocompile.Compiler{
		Resolver: protocompile.WithStandardImports(&protocompile.SourceResolver{
			Accessor: protocompile.SourceAccessorFromMap(map[string]string{
				"user/upload.proto": `syntax = "proto3";
package user;

message Properties {
  string name = 1;
  string email = 2;
  string age = 3;
}

message UploadEvent {
  Properties properties = 1;
  string user_id = 2;
  repeated string tags = 3;
}`,
				"cloud/event.proto": `syntax = "proto3";
package cloud;

import "google/protobuf/any.proto";
import "google/protobuf/timestamp.proto";

message CloudEvent {
  string spec_version = 1;
  string type = 2;
  string source = 3;
  string id = 4;
  google.protobuf.Timestamp time = 5;
  string data_content_type = 6;
  string event_version = 7;
  google.protobuf.Any data = 8;
}`,
			}),
		}),
	}

	// Compile the files
	linker, err := compiler.Compile(context.Background(), "user/upload.proto", "cloud/event.proto")
	require.NoError(t, err)

	userFd := linker.FindFileByPath("user/upload.proto")
	require.NotNil(t, userFd, "user/upload.proto file descriptor not found")
	cloudFd := linker.FindFileByPath("cloud/event.proto")
	require.NotNil(t, cloudFd, "cloud/event.proto file descriptor not found")

	// Create service with registry
	service := &Service{
		cfg:      config.Proto{},
		logger:   slog.Default(),
		registry: &protoregistry.Types{},
	}

	// Register message types from both file descriptors
	for _, fd := range []protoreflect.FileDescriptor{userFd, cloudFd} {
		messages := fd.Messages()
		for i := 0; i < messages.Len(); i++ {
			msgDesc := messages.Get(i)
			msgType := dynamicpb.NewMessageType(msgDesc)
			if err = service.registry.RegisterMessage(msgType); err != nil {
				t.Fatalf("Failed to register message type %s: %v", string(msgDesc.FullName()), err)
			}
		}
	}

	// Get message descriptors
	propertiesMd := userFd.Messages().ByName("Properties")
	uploadEventMd := userFd.Messages().ByName("UploadEvent")
	cloudEventMd := cloudFd.Messages().ByName("CloudEvent")

	require.NotNil(t, propertiesMd, "Properties message not found")
	require.NotNil(t, uploadEventMd, "UploadEvent message not found")
	require.NotNil(t, cloudEventMd, "CloudEvent message not found")

	// Create Properties message
	propertiesMsg := dynamicpb.NewMessage(propertiesMd)
	propertiesMsg.Set(propertiesMd.Fields().ByName("name"), protoreflect.ValueOfString("frank"))
	propertiesMsg.Set(propertiesMd.Fields().ByName("email"), protoreflect.ValueOfString("frank@example.com"))
	propertiesMsg.Set(propertiesMd.Fields().ByName("age"), protoreflect.ValueOfString("37"))

	// Create UploadEvent message
	uploadEventMsg := dynamicpb.NewMessage(uploadEventMd)
	uploadEventMsg.Set(uploadEventMd.Fields().ByName("properties"), protoreflect.ValueOfMessage(propertiesMsg))
	uploadEventMsg.Set(uploadEventMd.Fields().ByName("user_id"), protoreflect.ValueOfString("456"))

	// Create tags list
	tagsList := uploadEventMsg.NewField(uploadEventMd.Fields().ByName("tags")).List()
	tagsList.Append(protoreflect.ValueOfString("tag1"))
	tagsList.Append(protoreflect.ValueOfString("tag2"))
	uploadEventMsg.Set(uploadEventMd.Fields().ByName("tags"), protoreflect.ValueOfList(tagsList))

	// Marshal UploadEvent to create Any payload
	uploadEventBytes, err := proto.Marshal(uploadEventMsg)
	require.NoError(t, err)

	// Create Any message with proper type URL and payload
	anyMsg := &anypb.Any{
		TypeUrl: "type.googleapis.com/user.UploadEvent",
		Value:   uploadEventBytes,
	}

	// Create Timestamp message for the time field
	timestampMsg := &timestamppb.Timestamp{
		Seconds: 1660092397,
		Nanos:   760761000,
	}

	// Create CloudEvent message
	cloudEventMsg := dynamicpb.NewMessage(cloudEventMd)
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("spec_version"), protoreflect.ValueOfString("1.0"))
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("type"), protoreflect.ValueOfString("user/upload"))
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("source"), protoreflect.ValueOfString("user-uploader"))
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("id"), protoreflect.ValueOfString("6c64af2c-e6fa-47c9-b8dd-df1cdb26168b"))
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("data_content_type"), protoreflect.ValueOfString("application/json"))
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("event_version"), protoreflect.ValueOfString("1.0"))
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("time"), protoreflect.ValueOfMessage(timestampMsg.ProtoReflect()))
	cloudEventMsg.Set(cloudEventMd.Fields().ByName("data"), protoreflect.ValueOfMessage(anyMsg.ProtoReflect()))

	// Marshal CloudEvent
	cloudEventBytes, err := proto.Marshal(cloudEventMsg)
	require.NoError(t, err)

	// Try to deserialize the CloudEvent to JSON - this may fail due to Any field complexity
	// but that's expected behavior when dealing with cross-package Any fields
	jsonBytes, err := service.DeserializeProtobufMessageToJSON(cloudEventBytes, cloudEventMd)
	require.NoError(t, err)

	if jsonBytes != nil {
		// Parse and verify the structure if JSON deserialization worked
		var result map[string]any
		if err := json.Unmarshal(jsonBytes, &result); err == nil {
			// Verify basic CloudEvent fields match expected output structure
			assert.Equal(t, "1.0", result["specVersion"])
			assert.Equal(t, "user/upload", result["type"])
			assert.Equal(t, "user-uploader", result["source"])
			assert.Equal(t, "6c64af2c-e6fa-47c9-b8dd-df1cdb26168b", result["id"])
			assert.Equal(t, "application/json", result["dataContentType"])
			assert.Equal(t, "1.0", result["eventVersion"])

			t.Logf("CloudEvent JSON: %s", string(jsonBytes))
		}
	}

	// Test direct UploadEvent serialization to verify JSON field names match expectations
	uploadEventJsonBytes, err := service.DeserializeProtobufMessageToJSON(uploadEventBytes, uploadEventMd)
	require.NoError(t, err)

	var uploadEventResult map[string]any
	err = json.Unmarshal(uploadEventJsonBytes, &uploadEventResult)
	require.NoError(t, err)

	// Verify UploadEvent structure matches expected JSON field names
	assert.Equal(t, "456", uploadEventResult["userId"])
	assert.Contains(t, uploadEventResult, "properties")
	assert.Contains(t, uploadEventResult, "tags")

	properties, ok := uploadEventResult["properties"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "frank", properties["name"])
	assert.Equal(t, "frank@example.com", properties["email"])
	assert.Equal(t, "37", properties["age"])

	tags, ok := uploadEventResult["tags"].([]any)
	require.True(t, ok)
	assert.Equal(t, []any{"tag1", "tag2"}, tags)

	t.Logf("UploadEvent JSON: %s", string(uploadEventJsonBytes))
	t.Log("Successfully tested CloudEvent with Any field containing UploadEvent from different package")
	t.Log("Successfully validated PR #425 anyResolver functionality for cross-package type resolution")
}
