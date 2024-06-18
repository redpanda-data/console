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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
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

	logger, _ := zap.NewProduction()
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
	}, logger, nil)

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
