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
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
)

func TestSmileSerde_DeserializePayload(t *testing.T) {
	serde := SmileSerde{}

	smileData, err := os.ReadFile("testdata/test2.smile")
	assert.NoError(t, err)
	assert.NotEmpty(t, smileData)

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    payloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "Valid Smile Object in value",
			record: &kgo.Record{
				Value: smileData,
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, payloadEncodingSmile, payload.Encoding)

				fmt.Printf("type:%+T\n", payload.ParsedPayload)
				fmt.Printf("value:%#v\n", payload.ParsedPayload)

				jsonBytes, err := json.Marshal(payload.ParsedPayload)
				require.NoError(t, err)
				assert.Equal(t, `{"\"abKey\"":3,"foo":false}`, string(jsonBytes))

				obj, ok := (payload.ParsedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, false, obj["foo"])
			},
		},
		{
			name: "Invalid Smile",
			record: &kgo.Record{
				Value: []byte(`this is no valid Smile`),
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
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
