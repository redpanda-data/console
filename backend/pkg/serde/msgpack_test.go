// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/vmihailenco/msgpack/v5"

	"github.com/redpanda-data/console/backend/pkg/config"
	ms "github.com/redpanda-data/console/backend/pkg/msgpack"
)

func TestMsgPackSerde_DeserializePayload(t *testing.T) {
	// setup data
	type Item struct {
		Foo string
	}

	in := Item{Foo: "bar"}
	msgData, err := msgpack.Marshal(&in)
	require.NoError(t, err)

	mspPackSvc, err := ms.NewService(config.Msgpack{
		Enabled:    true,
		TopicNames: []string{"msgpack_topic"},
	})
	require.NoError(t, err)

	// serde
	serde := MsgPackSerde{
		MsgPackService: mspPackSvc,
	}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "msgpack in value",
			record: &kgo.Record{
				Value: msgData,
				Topic: "msgpack_topic",
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingMsgPack, payload.Encoding)

				fmt.Printf("%+T\n", payload.ParsedPayload)
				fmt.Printf("%+v\n", payload.ParsedPayload)
				obj, ok := (payload.ParsedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, "bar", obj["Foo"])
			},
		},
		{
			name: "not in topic map",
			record: &kgo.Record{
				Value: msgData,
				Topic: "not_msgpack_topic",
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.Error(t, err)
				assert.Equal(t, "message pack encoding not configured for topic: not_msgpack_topic", err.Error())
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(test.record, test.payloadType)
			test.validationFunc(t, payload, err)
		})
	}
}
