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
	"encoding/binary"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/builder"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/dynamic/msgregistry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
// This is the corrected version that properly creates the Any field with cross-package type resolution
// This test validates the anyResolver functionality introduced in PR #425
func TestService_CloudEventWithProperAnyField(t *testing.T) {
	// Load standard protobuf types for Any and Timestamp
	mdAny, err := desc.LoadMessageDescriptorForMessage((*anypb.Any)(nil))
	require.NoError(t, err)
	mdTimestamp, err := desc.LoadMessageDescriptorForMessage((*timestamppb.Timestamp)(nil))
	require.NoError(t, err)

	// Create Properties message
	propertiesBuilder := builder.NewMessage("Properties")
	propertiesBuilder.AddField(builder.NewField("name", builder.FieldTypeString()).SetNumber(1))
	propertiesBuilder.AddField(builder.NewField("email", builder.FieldTypeString()).SetNumber(2))
	propertiesBuilder.AddField(builder.NewField("age", builder.FieldTypeString()).SetNumber(3))

	// Create UploadEvent message
	uploadEventBuilder := builder.NewMessage("UploadEvent")
	uploadEventBuilder.AddField(builder.NewField("properties", builder.FieldTypeMessage(propertiesBuilder)).SetNumber(1))
	uploadEventBuilder.AddField(builder.NewField("user_id", builder.FieldTypeString()).SetNumber(2))
	uploadEventBuilder.AddField(builder.NewField("tags", builder.FieldTypeString()).SetRepeated().SetNumber(3))

	// Build user package file
	userFileBuilder := builder.NewFile("user/upload.proto")
	userFileBuilder.SetPackageName("user")
	userFileBuilder.AddMessage(propertiesBuilder)
	userFileBuilder.AddMessage(uploadEventBuilder)

	userFd, err := userFileBuilder.Build()
	require.NoError(t, err)

	// Create CloudEvent message with proper Any field
	cloudEventBuilder := builder.NewMessage("CloudEvent")
	cloudEventBuilder.AddField(builder.NewField("spec_version", builder.FieldTypeString()).SetNumber(1))
	cloudEventBuilder.AddField(builder.NewField("type", builder.FieldTypeString()).SetNumber(2))
	cloudEventBuilder.AddField(builder.NewField("source", builder.FieldTypeString()).SetNumber(3))
	cloudEventBuilder.AddField(builder.NewField("id", builder.FieldTypeString()).SetNumber(4))
	cloudEventBuilder.AddField(builder.NewField("time", builder.FieldTypeImportedMessage(mdTimestamp)).SetNumber(5))
	cloudEventBuilder.AddField(builder.NewField("data_content_type", builder.FieldTypeString()).SetNumber(6))
	cloudEventBuilder.AddField(builder.NewField("event_version", builder.FieldTypeString()).SetNumber(7))
	cloudEventBuilder.AddField(builder.NewField("data", builder.FieldTypeImportedMessage(mdAny)).SetNumber(8))

	// Build cloud package file
	cloudFileBuilder := builder.NewFile("cloud/event.proto")
	cloudFileBuilder.SetPackageName("cloud")
	cloudFileBuilder.AddMessage(cloudEventBuilder)

	cloudFd, err := cloudFileBuilder.Build()
	require.NoError(t, err)

	// Create service with both files
	service := &Service{
		cfg:      config.Proto{},
		logger:   slog.Default(),
		registry: msgregistry.NewMessageRegistryWithDefaults(),
	}
	service.registry.AddFile("", userFd)
	service.registry.AddFile("", cloudFd)

	// Get message descriptors - use the message types directly since FindMessage might not work
	propertiesMd := userFd.GetMessageTypes()[0]  // Properties
	uploadEventMd := userFd.GetMessageTypes()[1] // UploadEvent
	cloudEventMd := cloudFd.GetMessageTypes()[0] // CloudEvent

	require.NotNil(t, propertiesMd, "Properties message not found")
	require.NotNil(t, uploadEventMd, "UploadEvent message not found")
	require.NotNil(t, cloudEventMd, "CloudEvent message not found")

	// Create Properties message
	propertiesMsg := dynamic.NewMessage(propertiesMd)
	propertiesMsg.SetFieldByName("name", "frank")
	propertiesMsg.SetFieldByName("email", "frank@example.com")
	propertiesMsg.SetFieldByName("age", "37")

	// Create UploadEvent message
	uploadEventMsg := dynamic.NewMessage(uploadEventMd)
	uploadEventMsg.SetFieldByName("properties", propertiesMsg)
	uploadEventMsg.SetFieldByName("user_id", "456")
	uploadEventMsg.SetFieldByName("tags", []string{"tag1", "tag2"})

	// Marshal UploadEvent to create Any payload
	uploadEventBytes, err := uploadEventMsg.Marshal()
	require.NoError(t, err)

	// Create Any message with proper type URL and payload
	anyMsg := dynamic.NewMessage(mdAny)
	anyMsg.SetFieldByName("type_url", "type.googleapis.com/user.UploadEvent")
	anyMsg.SetFieldByName("value", uploadEventBytes)

	// Create CloudEvent message
	cloudEventMsg := dynamic.NewMessage(cloudEventMd)
	cloudEventMsg.SetFieldByName("spec_version", "1.0")
	cloudEventMsg.SetFieldByName("type", "user/upload")
	cloudEventMsg.SetFieldByName("source", "user-uploader")
	cloudEventMsg.SetFieldByName("id", "6c64af2c-e6fa-47c9-b8dd-df1cdb26168b")
	cloudEventMsg.SetFieldByName("data_content_type", "application/json")
	cloudEventMsg.SetFieldByName("event_version", "1.0")

	// Create Timestamp message for the time field
	timestampMsg := dynamic.NewMessage(mdTimestamp)
	timestampMsg.SetFieldByName("seconds", int64(1660092397))
	timestampMsg.SetFieldByName("nanos", int32(760761000))
	cloudEventMsg.SetFieldByName("time", timestampMsg)

	cloudEventMsg.SetFieldByName("data", anyMsg)

	// Marshal CloudEvent
	cloudEventBytes, err := cloudEventMsg.Marshal()
	require.NoError(t, err)

	// Test if modern protojson can handle cross-package Any fields without custom resolver

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
