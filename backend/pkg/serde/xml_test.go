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
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
)

func TestXMLSerde_DeserializePayload(t *testing.T) {
	serde := XMLSerde{}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "Valid XML Object in value",
			record: &kgo.Record{
				Value: []byte(`<?xml version="1.0" encoding="UTF-8"?><name>John</name><age>30</age>`),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingXML, payload.Encoding)

				// serialization can be non-deterministic in order of properties
				// so lets check general format of string
				normalizedPayload := string(payload.NormalizedPayload)
				assert.True(t, strings.HasPrefix(normalizedPayload, "{"))
				assert.True(t, strings.HasSuffix(normalizedPayload, "}\n"))
				assert.Contains(t, normalizedPayload, `"name": "John"`)
				assert.Contains(t, normalizedPayload, `"age": "30"`)

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, "John", obj["name"])
				assert.EqualValues(t, "30", obj["age"])
			},
		},
		{
			name: "Valid XML Object in key",
			record: &kgo.Record{
				Key: []byte(`<?xml version="1.0" encoding="UTF-8"?><name>John</name><age>30</age>`),
			},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingXML, payload.Encoding)
			},
		},
		{
			name: "Invalid XML",
			record: &kgo.Record{
				Value: []byte(`this is no valid XML`),
			},
			payloadType: PayloadTypeValue,
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

func TestXMLSerde_SerializeObject(t *testing.T) {
	serde := XMLSerde{}

	tests := []struct {
		name           string
		input          any
		payloadType    PayloadType
		options        []SerdeOpt
		validationFunc func(*testing.T, []byte, error)
	}{
		{
			name:        "empty byte",
			input:       []byte(""),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "not empty byte",
			input:       []byte("asdf"),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "first byte indicates this it not valid XML", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "empty string",
			input:       "",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "after trimming whitespaces there were no characters left", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "not empty string",
			input:       "asdf",
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "first byte indicates this it not valid XML", err.Error())
				assert.Nil(t, res)
			},
		},
		{
			name:        "invalid type",
			input:       map[string]interface{}{},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				require.Error(t, err)
				assert.Equal(t, "unsupported type map[string]interface {} for XML serialization", err.Error())
			},
		},
		{
			name:        "valid string",
			input:       `<?xml version="1.0" encoding="UTF-8"?><name>John</name><age>30</age>`,
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`<?xml version="1.0" encoding="UTF-8"?><name>John</name><age>30</age>`), res)
			},
		},
		{
			name:        "valid byte",
			input:       []byte(`<?xml version="1.0" encoding="UTF-8"?><name>John</name><age>30</age>`),
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, res []byte, err error) {
				assert.NoError(t, err)
				assert.Equal(t, []byte(`<?xml version="1.0" encoding="UTF-8"?><name>John</name><age>30</age>`), res)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := serde.SerializeObject(test.input, test.payloadType, test.options...)
			test.validationFunc(t, data, err)
		})
	}
}
