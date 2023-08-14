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
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/redpanda-data/console/backend/pkg/config"
	protoPkg "github.com/redpanda-data/console/backend/pkg/proto"
	"github.com/redpanda-data/console/backend/pkg/schema"
	shopv1 "github.com/redpanda-data/console/backend/pkg/serde/testdata/proto/gen/shop/v1"
)

func TestProtobufSchemaSerde_DeserializePayload(t *testing.T) {
	protoFile, err := os.ReadFile("testdata/proto/shop/v1/order.proto")
	require.NoError(t, err)

	// NO OP schema registry API server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("!!! request %+v %+v\n", r.Method, r.URL.String())

		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		switch r.URL.String() {
		case "/schemas/ids/1000":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")

			resp := map[string]interface{}{
				"schema": string(protoFile),
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			}
			return
		case "/schemas/types":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"PROTOBUF"}
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
					Schema:   string(protoFile),
					Type:     "PROTOBUF",
				},
			}

			enc := json.NewEncoder(w)
			if enc.Encode(resp) != nil {
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			}
			return
		case "/subjects":
			w.Header().Set("content-type", "application/vnd.schemaregistry.v1+json")
			resp := []string{"test-subject-shop-order-v1"}
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

	protoSvc, err := protoPkg.NewService(config.Proto{
		Enabled: true,
		SchemaRegistry: config.ProtoSchemaRegistry{
			Enabled:         true,
			RefreshInterval: 5 * time.Minute,
		},
	}, logger, schemaSvc)
	require.NoError(t, err)

	err = protoSvc.Start()
	require.NoError(t, err)

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
	serde := ProtobufSchemaSerde{
		ProtoSvc: protoSvc,
	}

	tests := []struct {
		name           string
		record         *kgo.Record
		payloadType    payloadType
		validationFunc func(t *testing.T, payload RecordPayload, err error)
	}{
		{
			name: "protobuf in value",
			record: &kgo.Record{
				Value: msgData,
			},
			payloadType: payloadTypeValue,
			validationFunc: func(t *testing.T, payload RecordPayload, err error) {
				require.NoError(t, err)
				assert.Nil(t, payload.Troubleshooting)
				assert.Nil(t, payload.SchemaID)
				assert.Equal(t, payloadEncodingProtobuf, payload.Encoding)

				obj, ok := (payload.ParsedPayload).([]byte)
				require.Truef(t, ok, "parsed payload is not of type string")

				assert.Equal(t, `{"id":"111","createdAt":"2023-06-10T13:00:00Z"}`, string(obj))
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
				assert.Contains(t, err.Error(), "schema ID 1001 not found")
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
