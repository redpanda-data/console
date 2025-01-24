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
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

func TestJsonSchemaSerde_DeserializePayload(t *testing.T) {
	serde := JSONSchemaSerde{}

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
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
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
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte for json schema", err.Error())
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
			"minimum": 1
		},
		"tags": {
			"description": "Tags for the product",
			"type": "array",
			"items": {
				"type": "string"
			},
			"minItems": 1,
			"uniqueItems": true
		},
		"dimensions": {
			"type": "object",
			"properties": {
				"length": {
					"type": "number"
				},
				"width": {
					"type": "number"
				},
				"height": {
					"type": "number"
				}
			},
			"required": [
				"length",
				"width",
				"height"
			]
		}
	},
	"required": [
		"productId",
		"productName"
	],
	"additionalProperties": false
}`

	schemaStr2 := strings.ReplaceAll(schemaStr, `"additionalProperties": false`, `"additionalProperties": true`)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		switch r.URL.String() {
		case "/schemas/ids/1000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]any{
				"schema": schemaStr,
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case "/schemas/ids/1001":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]any{
				"schema": schemaStr2,
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case srListSchemaTypesPath:
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"JSON"}
			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case srListSchemasPath, srListSchemasPath + "?deleted=true":
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
					Schema:   schemaStr,
					Type:     "JSON",
				},
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case srListSubjectsPath, srListSubjectsPath + "?deleted=true":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"test-subject-json-v1"}
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

	type Dimensions struct {
		Length int `json:"length"`
		Width  int `json:"width"`
		Height int `json:"height"`
	}

	type ProductRecord struct {
		ProductID   int         `json:"productId"`
		ProductName string      `json:"productName,omitempty"`
		Price       float32     `json:"price"`
		Tags        []string    `json:"tags,omitempty"`
		Dimensions  *Dimensions `json:"dimensions,omitempty"`
	}

	t.Run("no schema id", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), ProductRecord{ProductID: 11, ProductName: "foo"}, PayloadTypeValue)
		require.Error(t, err)
		assert.Equal(t, "no schema id specified", err.Error())
		assert.Nil(t, b)
	})

	t.Run("invalid schema id", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), ProductRecord{ProductID: 11, ProductName: "foo"}, PayloadTypeValue, WithSchemaID(5567))
		require.Error(t, err)
		assert.Equal(t, "getting JSON schema from registry: failed to get schema from registry: get schema by id request failed: Status code 404", err.Error())
		assert.Nil(t, b)
	})

	t.Run("dynamic validation error", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		actualData, err := serde.SerializeObject(context.Background(), ProductRecord{ProductID: 11, ProductName: "foo"}, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Nil(t, actualData)
		assert.Equal(t, "error validating json schema: jsonschema: '/price' does not validate with https://example.com/product.schema.json#/properties/price/minimum: must be >= 1 but found 0", err.Error())
	})

	t.Run("dynamic", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

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

		actualData, err := serde.SerializeObject(context.Background(), ProductRecord{ProductID: 11, ProductName: "foo", Price: 10.25}, PayloadTypeValue, WithSchemaID(1000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("string json", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

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

		actualData, err := serde.SerializeObject(context.Background(), `{"productId":11,"productName":"foo","price":10.25}`, PayloadTypeValue, WithSchemaID(1000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("string json extra properties invalid", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		actualData, err := serde.SerializeObject(context.Background(), `{"productId":11,"productName":"foo","price":10.25,"another":{"objectId":1234}}`, PayloadTypeValue, WithSchemaID(1000))
		assert.Error(t, err)
		assert.Empty(t, actualData)
		assert.Contains(t, err.Error(), "error validating json schema: jsonschema")
		assert.Contains(t, err.Error(), "additionalProperties 'another' not allowed")
	})

	t.Run("string json extra properties valid", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		type ProductRecordAdd struct {
			ProductRecord

			Extra   string         `json:"extra,omitempty"`
			Another map[string]any `json:"another,omitempty"`
		}

		var srSerde sr.Serde
		srSerde.Register(
			1001,
			&ProductRecordAdd{},
			sr.EncodeFn(func(v any) ([]byte, error) {
				return json.Marshal(v.(*ProductRecordAdd))
			}),
			sr.DecodeFn(func(b []byte, v any) error {
				return json.Unmarshal(b, v.(*ProductRecordAdd))
			}),
		)
		another := map[string]any{"objectId": 1234}

		expectData, err := srSerde.Encode(&ProductRecordAdd{
			ProductRecord: ProductRecord{
				ProductID:   11,
				ProductName: "foo",
				Price:       10.25,
				Tags:        []string{"tag0", "tag1"},
				Dimensions:  &Dimensions{Length: 10, Width: 11, Height: 12},
			},
			Extra:   "prop",
			Another: another,
		})
		require.NoError(t, err)

		actualData, err := serde.SerializeObject(context.Background(), `{"productId":11,"productName":"foo","price":10.25,"tags":["tag0","tag1"],"dimensions":{"length":10,"width":11,"height":12},"extra":"prop","another":{"objectId":1234}}`, PayloadTypeValue, WithSchemaID(1001))
		assert.NoError(t, err)
		assert.Equal(t, expectData, actualData)
	})

	t.Run("string invalid json", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), `{"productId":11,"price":10.25}`, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `error validating json schema: jsonschema: '' does not validate with https://example.com/product.schema.json#/required: missing properties: 'productName'`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("string empty", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), ``, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `payload is empty after trimming whitespace`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("string trim", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), "\r\n", PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `payload is empty after trimming whitespace`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("string invalid format", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), `foo`, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `first byte indicates this it not valid JSON, expected brackets`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte json", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

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

		actualData, err := serde.SerializeObject(context.Background(), []byte(`{"productId":11,"productName":"foo","price":10.25}`), PayloadTypeValue, WithSchemaID(1000))
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("byte invalid json", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), []byte(`{"productId":"11","productName":"foo","price":10.25}`), PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `error validating json schema: jsonschema: '/productId' does not validate with https://example.com/product.schema.json#/properties/productId/type: expected integer, but got string`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte empty", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), []byte{}, PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `payload is empty after trimming whitespace`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte trim", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), []byte("\r\n"), PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `payload is empty after trimming whitespace`, err.Error())
		assert.Nil(t, b)
	})

	t.Run("byte invalid format", func(t *testing.T) {
		serde := JSONSchemaSerde{SchemaSvc: schemaSvc}

		b, err := serde.SerializeObject(context.Background(), []byte("foo"), PayloadTypeValue, WithSchemaID(1000))
		require.Error(t, err)
		assert.Equal(t, `first byte indicates this it not valid JSON, expected brackets`, err.Error())
		assert.Nil(t, b)
	})
}
