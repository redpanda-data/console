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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hamba/avro/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

func TestAvroSerde_DeserializePayload(t *testing.T) {
	// fake schema registry
	schemaStr := `{
		"type": "record",
		"name": "simple",
		"namespace": "org.hamba.avro",
		"fields" : [
			{"name": "a", "type": "long"},
			{"name": "b", "type": "string"}
		]
	}`

	avroSchema, err := avro.Parse(schemaStr)
	require.NoError(t, err)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		switch r.URL.String() {
		case "/schemas/ids/1000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]interface{}{
				"schema": avroSchema.String(),
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			}
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
	}))
	defer ts.Close()

	// setup data
	type SimpleRecord struct {
		A int64  `avro:"a"`
		B string `avro:"b"`
	}

	var srSerde sr.Serde
	srSerde.Register(
		1000,
		&SimpleRecord{},
		sr.EncodeFn(func(v any) ([]byte, error) {
			return avro.Marshal(avroSchema, v.(*SimpleRecord))
		}),
		sr.DecodeFn(func(b []byte, v any) error {
			return avro.Unmarshal(avroSchema, b, v.(*SimpleRecord))
		}),
	)

	var srSerde2 sr.Serde
	srSerde2.Register(
		1001,
		&SimpleRecord{},
		sr.EncodeFn(func(v any) ([]byte, error) {
			return avro.Marshal(avroSchema, v.(*SimpleRecord))
		}),
		sr.DecodeFn(func(b []byte, v any) error {
			return avro.Unmarshal(avroSchema, b, v.(*SimpleRecord))
		}),
	)

	in := SimpleRecord{A: 27, B: "foo"}
	msgData, err := srSerde.Encode(&in)
	require.NoError(t, err)

	msgData2, err := srSerde2.Encode(&in)
	require.NoError(t, err)

	// setup schema service
	logger, _ := zap.NewProduction()
	s, err := schema.NewService(config.Schema{
		Enabled: true,
		URLs:    []string{ts.URL},
	}, logger)
	require.NoError(t, err)

	// serde
	serde := AvroSerde{
		SchemaSvc: s,
	}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "avro in value",
			record: &kgo.Record{
				Value: msgData,
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, PayloadEncodingAvro, payload.Encoding)

				obj, ok := (payload.ParsedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")

				assert.Equal(t, `{"a":27,"b":"foo"}`, string(obj))
			},
		},
		{
			name: "payload too small",
			record: &kgo.Record{
				Value: []byte{0, 1, 2, 3},
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "payload size is < 5", err.Error())
			},
		},
		{
			name: "missing magic byte",
			record: &kgo.Record{
				Value: []byte{1, 2, 3, 4, 5, 6, 7},
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte", err.Error())
			},
		},
		{
			name: "missing schema",
			record: &kgo.Record{
				Value: msgData2,
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "getting avro schema from registry: failed to get schema from registry: get schema by id request failed")
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
