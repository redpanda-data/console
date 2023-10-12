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
	"context"
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

const (
	srListSchemasPath     = "/schemas"
	srListSchemaTypesPath = "/schemas/types"
	srListSubjectsPath    = "/subjects"
)

func TestAvroSerde_DeserializePayload(t *testing.T) {
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
		case "/schemas/ids/3000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]interface{}{
				"schema": avroSchema.String(),
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
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
		3000,
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
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Equal(t, uint32(3000), *payload.SchemaID)
				assert.Equal(t, PayloadEncodingAvro, payload.Encoding)

				assert.Equal(t, `{"a":27,"b":"foo"}`, string(payload.NormalizedPayload))

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")

				data, err := avro.Marshal(avroSchema, obj)
				require.NoError(t, err)

				out := SimpleRecord{}
				err = avro.Unmarshal(avroSchema, data, &out)
				require.NoError(t, err)

				assert.Equal(t, int64(27), out.A)
				assert.Equal(t, "foo", out.B)
			},
		},
		{
			name: "payload too small",
			record: &kgo.Record{
				Value: []byte{0, 1, 2, 3},
			},
			payloadType: PayloadTypeValue,
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
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte for avro", err.Error())
			},
		},
		{
			name: "missing schema",
			record: &kgo.Record{
				Value: msgData2,
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "getting avro schema from registry: failed to get schema from registry: get schema by id request failed")
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(context.Background(), test.record, test.payloadType)
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestAvroSerde_SerializeObject(t *testing.T) {
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
		case "/schemas/ids/2000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]interface{}{
				"schema": avroSchema.String(),
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case srListSchemaTypesPath:
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"AVRO"}
			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case srListSchemasPath:
			type SchemaVersionedResponse struct {
				Subject  string `json:"subject"`
				SchemaID int    `json:"id"`
				Version  int    `json:"version"`
				Schema   string `json:"schema"`
				Type     string `json:"schemaType"`
				// References []Reference `json:"references"`
			}

			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []SchemaVersionedResponse{
				{
					Subject:  "test-subject-shop-order-v1",
					SchemaID: 2000,
					Version:  1,
					Schema:   schemaStr,
					Type:     "AVRO",
				},
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case srListSubjectsPath:
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"test-subject-avro-v1"}
			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		default:
			w.WriteHeader(http.StatusNotFound)
			return
		}
	}))
	defer ts.Close()

	logger, err := zap.NewProduction()
	require.NoError(t, err)

	schemaSvc, err := schema.NewService(config.Schema{
		Enabled: true,
		URLs:    []string{ts.URL},
	}, logger)
	require.NoError(t, err)

	type SimpleRecord struct {
		A int64  `avro:"a"`
		B string `avro:"b"`
	}

	t.Run("no schema id", func(t *testing.T) {
		serde := AvroSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), SimpleRecord{A: 27, B: "foo"}, PayloadTypeValue)
		require.Error(t, err)
		assert.Equal(t, "no schema id specified", err.Error())
		assert.Nil(t, b)
	})

	t.Run("invalid schema id", func(t *testing.T) {
		serde := AvroSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), SimpleRecord{A: 27, B: "foo"}, PayloadTypeValue, WithSchemaID(5567))
		require.Error(t, err)
		assert.Equal(t, "getting avro schema from registry: failed to get schema from registry: get schema by id request failed: Status code 404", err.Error())
		assert.Nil(t, b)
	})

	t.Run("dynamic", func(t *testing.T) {
		serde := AvroSerde{SchemaSvc: schemaSvc}

		var srSerde sr.Serde
		srSerde.Register(
			2000,
			&SimpleRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return avro.Marshal(avroSchema, v.(*SimpleRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return avro.Unmarshal(avroSchema, b, v.(*SimpleRecord))
			}),
		)

		expectData, err := srSerde.Encode(&SimpleRecord{A: 27, B: "foo"})
		require.NoError(t, err)

		actualData, err := serde.SerializeObject(context.Background(), SimpleRecord{A: 27, B: "foo"}, PayloadTypeValue, WithSchemaID(2000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("string json", func(t *testing.T) {
		serde := AvroSerde{SchemaSvc: schemaSvc}

		var srSerde sr.Serde
		srSerde.Register(
			2000,
			&SimpleRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return avro.Marshal(avroSchema, v.(*SimpleRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return avro.Unmarshal(avroSchema, b, v.(*SimpleRecord))
			}),
		)

		expectData, err := srSerde.Encode(&SimpleRecord{A: 27, B: "foo"})
		require.NoError(t, err)

		actualData, err := serde.SerializeObject(context.Background(), `{"a":27,"b":"foo"}`, PayloadTypeValue, WithSchemaID(2000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("invalid json", func(t *testing.T) {
		serde := AvroSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), `{"p":"q","r":12}`, PayloadTypeValue, WithSchemaID(2000))
		require.Error(t, err)
		assert.Equal(t, `deserializing avro json: cannot decode textual record "org.hamba.avro.simple": cannot decode textual map: cannot determine codec: "p"`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte json", func(t *testing.T) {
		serde := AvroSerde{SchemaSvc: schemaSvc}

		var srSerde sr.Serde
		srSerde.Register(
			2000,
			&SimpleRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return avro.Marshal(avroSchema, v.(*SimpleRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return avro.Unmarshal(avroSchema, b, v.(*SimpleRecord))
			}),
		)

		expectData, err := srSerde.Encode(&SimpleRecord{A: 12, B: "bar"})
		require.NoError(t, err)

		actualData, err := serde.SerializeObject(context.Background(), []byte(`{"a":12,"b":"bar"}`), PayloadTypeValue, WithSchemaID(2000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})
}
