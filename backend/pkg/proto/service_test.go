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
	"fmt"
	"reflect"
	"regexp"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/stretchr/testify/assert"
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
		IsRegex:   false,
	}

	strictTopicMapping02 = config.ProtoTopicMapping{
		TopicName: "stritctTopicMapping02",
		IsRegex:   false,
	}

	strictTopicMapping03 = config.ProtoTopicMapping{
		TopicName: "strictTopicMapping03",
		IsRegex:   false,
	}

	regexTopicMapping01 = config.ProtoTopicMapping{
		TopicName: "TopicName",
		IsRegex:   true,
	}
)

func genNTopicMappings(n int, baseName string, isRegex bool) []config.ProtoTopicMapping {
	m := make([]config.ProtoTopicMapping, 0)
	for i := 0; i < n; i++ {
		m = append(m, config.ProtoTopicMapping{
			TopicName: fmt.Sprintf("%v%v", baseName, i),
			IsRegex:   isRegex,
		})
	}

	return m
}

func TestService_getMatchingMapping(t *testing.T) {
	type fields struct {
		strictMappingsByTopic map[string]config.ProtoTopicMapping
		regexMappingsByTopic  map[string]RegexProtoTopicMapping
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
				regexMappingsByTopic: map[string]RegexProtoTopicMapping{
					regexTopicMapping01.TopicName: {
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
				regexMappingsByTopic:  tt.fields.regexMappingsByTopic,
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

func BenchmarkService_getMatchingMapping(b *testing.B) {
	benchs := []struct {
		name       string
		baseName   string
		topicCount int
		iter       int
		ratio      float32 // must be between 0 and 1
	}{
		{
			name:       "Only strict mappings",
			baseName:   "strictMapping",
			topicCount: 100,
			iter:       100,
			ratio:      0.0,
		},
		{
			name:       "10% regex mappings",
			baseName:   "regexMapping",
			topicCount: 100,
			iter:       100,
			ratio:      0.1,
		},
		{
			name:       "50% regex mappings",
			baseName:   "regexMapping",
			topicCount: 100,
			iter:       100,
			ratio:      0.5,
		},
		{
			name:       "90% regex mappings",
			baseName:   "regexMapping",
			topicCount: 100,
			iter:       100,
			ratio:      1.0,
		},
	}
	for _, bench := range benchs {
		b.Run(bench.name, func(b *testing.B) {

			strictTopicMappings := genNTopicMappings(int(float32(bench.topicCount)*(1.0-bench.ratio)), "strictMapping", false)
			regexTopicMappings := genNTopicMappings(int(float32(bench.topicCount)*bench.ratio), "regexMapping", true)

			strictMappingsByTopic, regexMappingsByTopic, err := setMappingsByTopic(append(strictTopicMappings, regexTopicMappings...))
			if err != nil {
				b.Error(err)
			}

			topicNames := make([]string, 0)

			for i := 0; i < bench.topicCount; i++ {
				topicNames = append(topicNames, fmt.Sprintf("%v%v", bench.baseName, i))
			}

			for i := 0; i < b.N; i++ {
				s := &Service{
					strictMappingsByTopic: strictMappingsByTopic,
					regexMappingsByTopic:  regexMappingsByTopic,
				}
				for n := 0; n < bench.iter; n++ {
					for _, topicName := range topicNames {
						_, _ = s.getMatchingMapping(topicName)
					}
				}
			}
		})
	}
}
