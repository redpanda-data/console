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
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	schemafactory "github.com/redpanda-data/console/backend/pkg/factory/schema"
	"github.com/redpanda-data/console/backend/pkg/schema"
	shopv1 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/shop/v1"
)

func TestProtobufSchemaSerde_DeserializePayload(t *testing.T) {
	protoFile, err := os.ReadFile("testdata/proto/shop/v1/order.proto")
	require.NoError(t, err)

	// schema registry API server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		switch r.URL.String() {
		case "/schemas/ids/1000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]any{
				"schema":     string(protoFile),
				"schemaType": "PROTOBUF",
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case "/schemas/ids/1001":
			http.Error(w, `{"error_code":40403,"message":"Schema 1001 not found"}`, http.StatusNotFound)
			return
		case srListSchemaTypesPath:
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"PROTOBUF"}
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
					Schema:   string(protoFile),
					Type:     "PROTOBUF",
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
			resp := []string{"test-subject-shop-order-v1"}
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

	// Set up Serde
	var srSerde sr.Serde
	srSerde.Register(
		1000,
		&shopv1.Order{},
		sr.EncodeFn(func(v any) ([]byte, error) {
			return proto.Marshal(v.(*shopv1.Order))
		}),
		sr.DecodeFn(func(b []byte, v any) error {
			return proto.Unmarshal(b, v.(*shopv1.Order))
		}),
		sr.Index(0),
	)

	var srSerde2 sr.Serde
	srSerde2.Register(
		1001,
		&shopv1.Order{},
		sr.EncodeFn(func(v any) ([]byte, error) {
			return proto.Marshal(v.(*shopv1.Order))
		}),
		sr.DecodeFn(func(b []byte, v any) error {
			return proto.Unmarshal(b, v.(*shopv1.Order))
		}),
		sr.Index(0),
	)

	orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
	msg := shopv1.Order{
		Id:        "111",
		CreatedAt: timestamppb.New(orderCreatedAt),
	}

	msgData, err := srSerde.Encode(&msg)
	require.NoError(t, err)

	orderCreatedAt = time.Date(2023, time.June, 10, 14, 0, 0, 0, time.UTC)
	msg = shopv1.Order{
		Id:        "222",
		CreatedAt: timestamppb.New(orderCreatedAt),
	}
	msgData2, err := srSerde2.Encode(&msg)
	require.NoError(t, err)

	// serde
	singleClientProvider, err := schemafactory.NewSingleClientProvider(&config.Config{
		SchemaRegistry: config.Schema{
			Enabled: true,
			URLs:    []string{ts.URL},
		},
	})
	require.NoError(t, err)
	schemaCachedClient, err := schema.NewCachedClient(singleClientProvider, func(context.Context) (string, error) {
		return "single/", nil
	})
	require.NoError(t, err)
	serde := ProtobufSchemaSerde{
		schemaClient: schemaCachedClient,
	}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    PayloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "protobuf in value",
			record: &kgo.Record{
				Value: msgData,
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Equal(t, uint32(1000), *payload.SchemaID)
				assert.Equal(t, PayloadEncodingProtobuf, payload.Encoding)

				// Remove whitespaces from result because of randomization in protojson output, see:
				// https://github.com/golang/protobuf/issues/1082
				resultWithoutWhitespace := strings.ReplaceAll(string(payload.NormalizedPayload), `, "`, `,"`)
				assert.Equal(t, `{"id":"111","createdAt":"2023-06-10T13:00:00Z"}`, resultWithoutWhitespace)

				obj, ok := (payload.DeserializedPayload).(map[string]any)
				require.Truef(t, ok, "parsed payload is not of type map[string]any")

				assert.Equal(t, `111`, obj["id"])
			},
		},
		{
			name: "payload too small",
			record: &kgo.Record{
				Value: []byte{0, 1, 2, 3},
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "payload size is <= 5", err.Error())
			},
		},
		{
			name: "missing magic byte",
			record: &kgo.Record{
				Value: []byte{1, 2, 3, 4, 5, 6, 7},
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				assert.Error(t, err)
				assert.Equal(t, "incorrect magic byte for protobuf schema", err.Error())
			},
		},
		{
			name: "missing schema",
			record: &kgo.Record{
				Value: msgData2,
			},
			payloadType: PayloadTypeValue,
			validationFunc: func(t *testing.T, _ RecordPayload, err error) {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "Schema 1001 not found")
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

//nolint:gocognit,cyclop // complexity in a test
func TestProtobufSchemaSerde_SerializeObject(t *testing.T) {
	protoFile, err := os.ReadFile("testdata/proto/shop/v1/order.proto")
	require.NoError(t, err)

	protoFile2, err := os.ReadFile("testdata/proto/index/v1/data.proto")
	require.NoError(t, err)

	// schema registry API server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		switch r.URL.String() {
		case "/schemas/ids/5000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]any{
				"schema": string(protoFile),
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case "/schemas/ids/2000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]any{
				"schema": string(protoFile2),
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}
			return
		case "/schemas/ids/1001":
			http.Error(w, `{"error_code":40403,"message":"Schema 1001 not found"}`, http.StatusNotFound)
			return
		case "/schemas/types":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"PROTOBUF"}
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
					SchemaID: 5000,
					Version:  1,
					Schema:   string(protoFile),
					Type:     "PROTOBUF",
				},
				{
					Subject:  "test-subject-shop-data-v1",
					SchemaID: 2000,
					Version:  1,
					Schema:   string(protoFile),
					Type:     "PROTOBUF",
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
			resp := []string{"test-subject-shop-order-v1", "test-subject-shop-data-v1"}
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

	// serde dependencies
	singleClientProvider, err := schemafactory.NewSingleClientProvider(&config.Config{
		SchemaRegistry: config.Schema{
			Enabled: true,
			URLs:    []string{ts.URL},
		},
	})
	require.NoError(t, err)
	schemaCachedClient, err := schema.NewCachedClient(singleClientProvider, func(context.Context) (string, error) {
		return "single/", nil
	})
	require.NoError(t, err)

	t.Run("v2proto", func(t *testing.T) {
		orderCreatedAt := time.Date(2023, time.June, 10, 13, 0, 0, 0, time.UTC)
		msg := &shopv1.Order{
			Id:        "111",
			CreatedAt: timestamppb.New(orderCreatedAt),
		}

		serde := ProtobufSchemaSerde{}

		actualData, err := serde.SerializeObject(context.Background(), msg, PayloadTypeValue)
		assert.NoError(t, err)

		expectData, err := proto.Marshal(msg)
		require.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("dynamic", func(t *testing.T) {
		imports := []string{"testdata/proto/shop/v1"}
		protoPath := "order.proto"

		p := &protoparse.Parser{ImportPaths: imports}
		fds, err := p.ParseFiles(protoPath)
		require.NoError(t, err)

		typeName := "shop.v1.Order"
		var md *desc.MessageDescriptor
		for _, fd := range fds {
			for _, mt := range fd.GetMessageTypes() {
				if mt.GetFullyQualifiedName() == typeName {
					md = mt
					break
				}
			}

			if md != nil {
				break
			}
		}

		require.NotNil(t, md)

		msg := dynamic.NewMessage(md)
		err = msg.UnmarshalJSON([]byte(`{"id":"222"}`))
		require.NoError(t, err)
		assert.Equal(t, "222", msg.GetFieldByName("id").(string))

		expectData, err := msg.Marshal()
		require.NoError(t, err)

		serde := ProtobufSchemaSerde{}

		actualData, err := serde.SerializeObject(context.Background(), msg, PayloadTypeValue)
		assert.NoError(t, err)

		assert.Equal(t, expectData, actualData)
	})

	t.Run("map type", func(t *testing.T) {
		t.Run("valid no index", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "333",
			}

			var srSerde sr.Serde
			srSerde.Register(
				5000,
				&shopv1.Order{},
				sr.EncodeFn(func(v any) ([]byte, error) {
					return proto.Marshal(v.(*shopv1.Order))
				}),
				sr.DecodeFn(func(b []byte, v any) error {
					return proto.Unmarshal(b, v.(*shopv1.Order))
				}),
				sr.Index(0),
			)

			expectData, err := srSerde.Encode(msg)
			require.NoError(t, err)

			data := map[string]any{
				"id": "333",
			}

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(5000))
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})

		t.Run("invalid schema id", func(t *testing.T) {
			data := map[string]any{
				"id": "333",
			}

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(1001))
			require.Error(t, err)
			assert.Contains(t, err.Error(), "Schema 1001 not found")
			assert.Nil(t, actualData)
		})
	})

	t.Run("json string", func(t *testing.T) {
		t.Run("valid", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "333",
			}

			var srSerde sr.Serde
			srSerde.Register(
				5000,
				&shopv1.Order{},
				sr.EncodeFn(func(v any) ([]byte, error) {
					return proto.Marshal(v.(*shopv1.Order))
				}),
				sr.DecodeFn(func(b []byte, v any) error {
					return proto.Unmarshal(b, v.(*shopv1.Order))
				}),
				sr.Index(0),
			)

			expectData, err := srSerde.Encode(msg)
			require.NoError(t, err)

			data := `{"id":"333"}`

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(5000))
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})

		t.Run("invalid schema id", func(t *testing.T) {
			data := `{"id":"3333"}`

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(1001))
			require.Error(t, err)
			assert.Contains(t, err.Error(), "Schema 1001 not found")
			assert.Nil(t, actualData)
		})

		t.Run("invalid input", func(t *testing.T) {
			data := `notjson`
			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(5000))
			assert.Error(t, err)
			assert.Equal(t, "first byte indicates this it not valid JSON, expected brackets", err.Error())
			assert.Nil(t, actualData)
		})
	})

	t.Run("byte json", func(t *testing.T) {
		t.Run("valid", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "444",
			}

			var srSerde sr.Serde
			srSerde.Register(
				5000,
				&shopv1.Order{},
				sr.EncodeFn(func(v any) ([]byte, error) {
					return proto.Marshal(v.(*shopv1.Order))
				}),
				sr.DecodeFn(func(b []byte, v any) error {
					return proto.Unmarshal(b, v.(*shopv1.Order))
				}),
				sr.Index(0),
			)

			expectData, err := srSerde.Encode(msg)
			require.NoError(t, err)

			data := []byte(`{"id":"444"}`)

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(5000))
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})

		t.Run("invalid schema id", func(t *testing.T) {
			data := []byte(`{"id":"3333"}`)

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(1001))
			require.Error(t, err)
			assert.Contains(t, err.Error(), "Schema 1001 not found")
			assert.Nil(t, actualData)
		})
	})

	t.Run("byte", func(t *testing.T) {
		t.Run("valid", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "444",
			}

			var srSerde sr.Serde
			srSerde.Register(
				5000,
				&shopv1.Order{},
				sr.EncodeFn(func(v any) ([]byte, error) {
					return proto.Marshal(v.(*shopv1.Order))
				}),
				sr.DecodeFn(func(b []byte, v any) error {
					return proto.Unmarshal(b, v.(*shopv1.Order))
				}),
				sr.Index(0),
			)

			expectData, err := srSerde.Encode(msg)
			require.NoError(t, err)

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			data, err := protojson.Marshal(msg)
			require.NoError(t, err)

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(5000))
			assert.NoError(t, err)

			assert.Equal(t, expectData, actualData)
		})

		t.Run("no schema id", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "444",
			}

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			data, err := proto.Marshal(msg)
			require.NoError(t, err)

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue)
			assert.Error(t, err)
			assert.Equal(t, "no schema id specified", err.Error())
			assert.Nil(t, actualData)
		})

		t.Run("invalid schema id", func(t *testing.T) {
			msg := &shopv1.Order{
				Id: "444",
			}

			serde := ProtobufSchemaSerde{schemaClient: schemaCachedClient}

			data, err := proto.Marshal(msg)
			require.NoError(t, err)

			actualData, err := serde.SerializeObject(context.Background(), data, PayloadTypeValue, WithSchemaID(1001))
			require.Error(t, err)
			assert.Contains(t, err.Error(), "Schema 1001 not found")
			assert.Nil(t, actualData)
		})
	})
}
