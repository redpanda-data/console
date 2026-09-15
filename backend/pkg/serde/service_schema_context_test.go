// Copyright 2026 Redpanda Data, Inc.
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
	"net/http"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"
	"github.com/twmb/franz-go/pkg/sr/srfake"

	"github.com/redpanda-data/console/backend/pkg/config"
	schemafactory "github.com/redpanda-data/console/backend/pkg/factory/schema"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

// requestRecorder records the paths requested from the fake schema registry.
type requestRecorder struct {
	mu    sync.Mutex
	paths []string
}

func (r *requestRecorder) intercept(_ http.ResponseWriter, req *http.Request) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.paths = append(r.paths, req.URL.Path)
	return false
}

func (r *requestRecorder) requested(path string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.paths {
		if p == path {
			return true
		}
	}
	return false
}

func newSchemaContextTestService(t *testing.T, registryURL string) *Service {
	t.Helper()

	provider, err := schemafactory.NewSingleClientProvider(&config.Config{
		SchemaRegistry: config.Schema{
			Enabled: true,
			URLs:    []string{registryURL},
		},
	})
	require.NoError(t, err)

	cachedClient, err := schema.NewCachedClient(provider, func(context.Context) (string, error) {
		return "single", nil
	})
	require.NoError(t, err)

	svc, err := NewService(nil, nil, cachedClient, nil, config.Cbor{})
	require.NoError(t, err)
	return svc
}

func TestService_SchemaContext(t *testing.T) {
	const (
		schemaID      = 7
		subject       = ":.outgo:convoy-value"
		schemaContext = ".outgo"
	)
	avroSchema := sr.Schema{
		Type:   sr.TypeAvro,
		Schema: `{"type":"record","name":"Convoy","fields":[{"name":"id","type":"string"},{"name":"qty","type":"int"}]}`,
	}

	// Convoy{id:"abc", qty:7} in Avro binary.
	avroPayload := []byte{0x06, 'a', 'b', 'c', 0x0e}
	var header sr.ConfluentHeader
	wirePayload, err := header.AppendEncode(nil, schemaID, nil)
	require.NoError(t, err)
	wirePayload = append(wirePayload, avroPayload...)

	t.Run("deserialize in the topic's context", func(t *testing.T) {
		registry := srfake.New()
		defer registry.Close()
		registry.SeedSchema(subject, 1, schemaID, avroSchema)
		recorder := &requestRecorder{}
		registry.Intercept(recorder.intercept)

		svc := newSchemaContextTestService(t, registry.URL())
		record := &kgo.Record{Topic: "convoy", Value: wirePayload}

		dr := svc.DeserializeRecord(t.Context(), record, DeserializationOptions{
			SchemaContext: schemaContext,
			Troubleshoot:  true,
		})
		require.NotNil(t, dr)
		assert.Equal(t, PayloadEncodingAvro, dr.Value.Encoding)
		require.NotNil(t, dr.Value.SchemaID)
		assert.Equal(t, uint32(schemaID), *dr.Value.SchemaID)
		assert.JSONEq(t, `{"id":"abc","qty":7}`, string(dr.Value.NormalizedPayload))

		assert.True(t, recorder.requested("/contexts/.outgo/schemas/ids/7"), "requested paths: %v", recorder.paths)
		assert.False(t, recorder.requested("/schemas/ids/7"), "requested paths: %v", recorder.paths)
	})

	t.Run("cache keeps contexts apart", func(t *testing.T) {
		registry := srfake.New()
		defer registry.Close()
		registry.SeedSchema(subject, 1, schemaID, avroSchema)
		recorder := &requestRecorder{}
		registry.Intercept(recorder.intercept)

		svc := newSchemaContextTestService(t, registry.URL())
		record := &kgo.Record{Topic: "convoy", Value: wirePayload}

		svc.DeserializeRecord(t.Context(), record, DeserializationOptions{SchemaContext: schemaContext})
		svc.DeserializeRecord(t.Context(), record, DeserializationOptions{})
		// Other spelling of the same context, served from the cache.
		svc.DeserializeRecord(t.Context(), record, DeserializationOptions{SchemaContext: "outgo"})

		assert.True(t, recorder.requested("/contexts/.outgo/schemas/ids/7"), "requested paths: %v", recorder.paths)
		assert.True(t, recorder.requested("/schemas/ids/7"), "requested paths: %v", recorder.paths)
		assert.Len(t, recorder.paths, 2, "one request per (context, id), got: %v", recorder.paths)
	})

	t.Run("serialize with the payload's context taking precedence over the topic's", func(t *testing.T) {
		registry := srfake.New()
		defer registry.Close()
		registry.SeedSchema(subject, 1, schemaID, avroSchema)
		recorder := &requestRecorder{}
		registry.Intercept(recorder.intercept)

		svc := newSchemaContextTestService(t, registry.URL())

		out, err := svc.SerializeRecord(t.Context(), SerializeInput{
			Topic:         "convoy",
			SchemaContext: ".unrelated",
			Key:           RecordPayloadInput{Encoding: PayloadEncodingNull},
			Value: RecordPayloadInput{
				Encoding:      PayloadEncodingAvro,
				Payload:       `{"id":"abc","qty":7}`,
				Options:       []SerdeOpt{WithSchemaID(schemaID)},
				SchemaContext: schemaContext,
			},
		})
		require.NoError(t, err)
		assert.Equal(t, wirePayload, out.Value.Payload)

		assert.True(t, recorder.requested("/contexts/.outgo/schemas/ids/7"), "requested paths: %v", recorder.paths)
		assert.False(t, recorder.requested("/contexts/.unrelated/schemas/ids/7"), "requested paths: %v", recorder.paths)
	})

	t.Run("serialize falls back to the topic's context", func(t *testing.T) {
		registry := srfake.New()
		defer registry.Close()
		registry.SeedSchema(subject, 1, schemaID, avroSchema)
		recorder := &requestRecorder{}
		registry.Intercept(recorder.intercept)

		svc := newSchemaContextTestService(t, registry.URL())

		out, err := svc.SerializeRecord(t.Context(), SerializeInput{
			Topic:         "convoy",
			SchemaContext: schemaContext,
			Key:           RecordPayloadInput{Encoding: PayloadEncodingNull},
			Value: RecordPayloadInput{
				Encoding: PayloadEncodingAvro,
				Payload:  `{"id":"abc","qty":7}`,
				Options:  []SerdeOpt{WithSchemaID(schemaID)},
			},
		})
		require.NoError(t, err)
		assert.Equal(t, wirePayload, out.Value.Payload)
		assert.True(t, recorder.requested("/contexts/.outgo/schemas/ids/7"), "requested paths: %v", recorder.paths)
	})
}
