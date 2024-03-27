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
	"reflect"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"

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

var (
	strictTopicMapping01 = config.ProtoTopicMapping{
		TopicName: "strictTopicMapping01",
	}

	strictTopicMapping02 = config.ProtoTopicMapping{
		TopicName: "stritctTopicMapping02",
	}

	regexTopicMapping01 = config.ProtoTopicMapping{
		TopicName: "TopicName",
	}
)

func TestService_getMatchingMapping(t *testing.T) {
	type fields struct {
		strictMappingsByTopic map[string]config.ProtoTopicMapping
		regexMappingsByTopic  []regexProtoTopicMapping
	}
	type args struct {
		topicName string
	}
	tests := []struct {
		name        string
		fields      fields
		args        args
		wantMapping config.ProtoTopicMapping
		wantErr     bool
	}{
		{
			name: "get a strict mapping",
			fields: fields{
				strictMappingsByTopic: map[string]config.ProtoTopicMapping{
					strictTopicMapping01.TopicName: strictTopicMapping01,
					strictTopicMapping02.TopicName: strictTopicMapping02,
				},
			},
			args: args{
				topicName: strictTopicMapping01.TopicName,
			},
			wantMapping: strictTopicMapping01,
		},
		{
			name: "get a regex mapping",
			fields: fields{
				strictMappingsByTopic: map[string]config.ProtoTopicMapping{
					strictTopicMapping01.TopicName: strictTopicMapping01,
					strictTopicMapping02.TopicName: strictTopicMapping02,
					regexTopicMapping01.TopicName:  regexTopicMapping01,
				},
				regexMappingsByTopic: []regexProtoTopicMapping{
					{
						ProtoTopicMapping: regexTopicMapping01,
						r:                 regexp.MustCompile(regexTopicMapping01.TopicName),
					},
				},
			},
			args: args{
				topicName: "aTopicNameThatMustMatchRegex",
			},
			wantMapping: regexTopicMapping01,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Service{
				strictMappingsByTopic: tt.fields.strictMappingsByTopic,
				mappingsRegex:         tt.fields.regexMappingsByTopic,
			}
			gotMapping, err := s.getMatchingMapping(tt.args.topicName)
			if (err != nil) != tt.wantErr {
				t.Errorf("Service.getMatchingMapping() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !reflect.DeepEqual(gotMapping, tt.wantMapping) {
				t.Errorf("Service.getMatchingMapping() = %v, want %v", gotMapping, tt.wantMapping)
			}
		})
	}
}
