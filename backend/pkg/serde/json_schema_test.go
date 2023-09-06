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

	"github.com/santhosh-tekuri/jsonschema/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

func TestJsonSchemaSerde_DeserializePayload(t *testing.T) {
	serde := JsonSchemaSerde{}

	type Item struct {
		Foo string `json:"foo"`
	}

	in := Item{Foo: "bar"}

	var srSerde sr.Serde
	srSerde.Register(
		1000,
		&Item{},
		sr.EncodeFn(func(v any) ([]byte, error) {
			return json.Marshal(v.(*Item))
		}),
		sr.DecodeFn(func(b []byte, v any) error {
			return json.Unmarshal(b, v.(*Item))
		}),
	)

	msgData, err := srSerde.Encode(&in)
	require.NoError(t, err)

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "Valid JSON Object in value",
			record: &kgo.Record{
				Value: msgData,
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Equal(t, uint32(1000), *payload.SchemaID)
				assert.Equal(t, PayloadEncodingJSON, payload.Encoding)

				assert.Equal(t, `{"foo":"bar"}`, string(payload.NormalizedPayload))

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")
				assert.Equal(t, "bar", obj["foo"])
			},
		},
		{
			name: "Valid JSON Object in key",
			record: &kgo.Record{
				Key: msgData,
			},
			payloadType: PayloadTypeKey,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Equal(t, uint32(1000), *payload.SchemaID)
				assert.Equal(t, PayloadEncodingJSON, payload.Encoding)
			},
		},
		{
			name: "valid json not wrapped",
			record: &kgo.Record{
				Value: []byte(`[10, 20, 30, 40, 50, 60, 70, 80, 90]`),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte for json schema", err.Error())
			},
		},
		{
			name: "Invalid JSON",
			record: &kgo.Record{
				Value: []byte(`this is no valid JSON`),
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte for json schema", err.Error())
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			payload, err := serde.DeserializePayload(test.record, test.payloadType)
			test.validationFunc(t, *payload, err)
		})
	}
}

func TestJsonSchemaSerde_SerializeObject(t *testing.T) {
	schemaStr := `{
		"$id": "https://example.com/product.schema.json",
		"title": "Product",
		"description": "A product from Acme's catalog",
		"type": "object",
		"properties": {
		  "productId": {
			"description": "The unique identifier for a product",
			"type": "integer"
		  },
		  "productName": {
			"description": "Name of the product",
			"type": "string"
		  },
		  "price": {
			"description": "The price of the product",
			"type": "number",
			"exclusiveMinimum": 0
		  }
		},
		"required": [ "productId", "productName" ]
	}`

	sch, err := jsonschema.CompileString("schema.json", schemaStr)
	require.NoError(t, err)
	require.NotNil(t, sch)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		switch r.URL.String() {
		case "/schemas/ids/1000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]interface{}{
				"schema": schemaStr,
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			}
			return
		case "/schemas/types":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"JSON"}
			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			}
			return
		case "/schemas":
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
					SchemaID: 1000,
					Version:  1,
					Schema:   string(schemaStr),
					Type:     "JSON",
				},
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			}
			return
		case "/subjects":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"test-subject-json-v1"}
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

	logger, err := zap.NewProduction()
	require.NoError(t, err)

	schemaSvc, err := schema.NewService(config.Schema{
		Enabled: true,
		URLs:    []string{ts.URL},
	}, logger)
	require.NoError(t, err)

	type ProductRecord struct {
		ProductID   int     `json:"productId"`
		ProductName string  `json:"productName"`
		Price       float32 `json:"price"`
	}

	t.Run("no schema id", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(ProductRecord{ProductID: 11, ProductName: "foo"}, PayloadTypeValue)
		require.Error(t, err)
		assert.Equal(t, "no schema id specified", err.Error())
		assert.Nil(t, b)
	})

	t.Run("invalid schema id", func(t *testing.T) {
		t.Skip("Redpanda schema registry doesn't support JSON schema")

		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(ProductRecord{ProductID: 11, ProductName: "foo"}, PayloadTypeValue, WithSchemaID(5567))
		require.Error(t, err)
		assert.Equal(t, "getting json schema from registry '5567': get schema by id request failed: Status code 404", err.Error())
		assert.Nil(t, b)
	})

	t.Run("dynamic validation error", func(t *testing.T) {
		t.Skip("Redpanda schema registry doesn't support JSON schema")

		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		actualData, err := serde.SerializeObject(ProductRecord{ProductID: 11, ProductName: "foo"}, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Nil(t, actualData)
		assert.Equal(t, "error validating json schema: jsonschema: '/price' does not validate with https://example.com/product.schema.json#/properties/price/exclusiveMinimum: must be > 0 but found 0", err.Error())
	})

	t.Run("dynamic", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		var srSerde sr.Serde
		srSerde.Register(
			1000,
			&ProductRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return json.Marshal(v.(*ProductRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return json.Unmarshal(b, v.(*ProductRecord))
			}),
		)

		expectData, err := srSerde.Encode(&ProductRecord{ProductID: 11, ProductName: "foo", Price: 10.25})
		require.NoError(t, err)

		actualData, err := serde.SerializeObject(ProductRecord{ProductID: 11, ProductName: "foo", Price: 10.25}, PayloadTypeValue, WithSchemaID(1000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("string json", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		var srSerde sr.Serde
		srSerde.Register(
			1000,
			&ProductRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return json.Marshal(v.(*ProductRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return json.Unmarshal(b, v.(*ProductRecord))
			}),
		)

		expectData, err := srSerde.Encode(&ProductRecord{ProductID: 11, ProductName: "foo", Price: 10.25})
		require.NoError(t, err)

		actualData, err := serde.SerializeObject(`{"productId":11,"productName":"foo","price":10.25}`, PayloadTypeValue, WithSchemaID(1000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("string invalid json", func(t *testing.T) {
		t.Skip("Redpanda schema registry doesn't support JSON schema")

		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(`{"productId":11,"price":10.25}`, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `error validating json schema: jsonschema: '' does not validate with https://example.com/product.schema.json#/required: missing properties: 'productName'`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("string empty", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(``, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `after trimming whitespaces there were no characters left`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("string trim", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject("\r\n", PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `after trimming whitespaces there were no characters left`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("string invalid format", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(`foo`, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `first byte indicates this it not valid JSON, expected brackets`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte json", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		var srSerde sr.Serde
		srSerde.Register(
			1000,
			&ProductRecord{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return json.Marshal(v.(*ProductRecord))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return json.Unmarshal(b, v.(*ProductRecord))
			}),
		)

		expectData, err := srSerde.Encode(&ProductRecord{ProductID: 11, ProductName: "foo", Price: 10.25})
		require.NoError(t, err)

		actualData, err := serde.SerializeObject([]byte(`{"productId":11,"productName":"foo","price":10.25}`), PayloadTypeValue, WithSchemaID(1000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("byte invalid json", func(t *testing.T) {
		t.Skip("Redpanda schema registry doesn't support JSON schema")

		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject([]byte(`{"productId":"11","productName":"foo","price":10.25}`), PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `error validating json schema: jsonschema: '/productId' does not validate with https://example.com/product.schema.json#/properties/productId/type: expected integer, but got string`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte empty", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject([]byte{}, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `after trimming whitespaces there were no characters left`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte trim", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject([]byte("\r\n"), PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `after trimming whitespaces there were no characters left`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte invalid format", func(t *testing.T) {
		serde := JsonSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject([]byte("foo"), PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `first byte indicates this it not valid JSON, expected brackets`, err.Error())
		assert.Nil(t, b)
	})
}
