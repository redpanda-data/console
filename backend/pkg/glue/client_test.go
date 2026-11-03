// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package glue

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/glue"
	gluetypes "github.com/aws/aws-sdk-go-v2/service/glue/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redpanda-data/console/backend/pkg/config"
)

const testAvroSchema = `{"type":"record","name":"SimpleRecord","fields":[{"name":"a","type":"long"}]}`

// fakeGlueAPI is a stub implementation of SchemaVersionGetter that records how
// often it was called and with which schema version id.
type fakeGlueAPI struct {
	out *glue.GetSchemaVersionOutput
	err error

	calls              int
	requestedVersionID string
}

func (f *fakeGlueAPI) GetSchemaVersion(
	_ context.Context,
	params *glue.GetSchemaVersionInput,
	_ ...func(*glue.Options),
) (*glue.GetSchemaVersionOutput, error) {
	f.calls++
	if params.SchemaVersionId != nil {
		f.requestedVersionID = *params.SchemaVersionId
	}
	return f.out, f.err
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func testConfig() config.GlueSchemaRegistry {
	return config.GlueSchemaRegistry{
		Enabled:       true,
		Region:        "us-east-1",
		CacheTTL:      time.Hour,
		ClientTimeout: 10 * time.Second,
	}
}

func avroSchemaVersionOutput(definition string) *glue.GetSchemaVersionOutput {
	return &glue.GetSchemaVersionOutput{
		DataFormat:       gluetypes.DataFormatAvro,
		SchemaDefinition: aws.String(definition),
	}
}

func TestClient_AvroSchemaByVersionID(t *testing.T) {
	tests := []struct {
		name            string
		schemaVersionID string
		api             *fakeGlueAPI
		validationFunc  func(t *testing.T, schemaJSON string, err error)
	}{
		{
			name:            "empty schema version id",
			schemaVersionID: "",
			api:             &fakeGlueAPI{out: avroSchemaVersionOutput(testAvroSchema)},
			validationFunc: func(t *testing.T, _ string, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "schema version id is empty")
			},
		},
		{
			name:            "successful avro schema resolution",
			schemaVersionID: "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11",
			api:             &fakeGlueAPI{out: avroSchemaVersionOutput(testAvroSchema)},
			validationFunc: func(t *testing.T, schemaJSON string, err error) {
				require.NoError(t, err)
				assert.Contains(t, schemaJSON, "SimpleRecord")
			},
		},
		{
			name:            "api error is propagated",
			schemaVersionID: "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11",
			api:             &fakeGlueAPI{err: errors.New("access denied")},
			validationFunc: func(t *testing.T, _ string, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "failed to get schema version")
				assert.Contains(t, err.Error(), "access denied")
			},
		},
		{
			name:            "non avro data format is rejected",
			schemaVersionID: "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11",
			api: &fakeGlueAPI{out: &glue.GetSchemaVersionOutput{
				DataFormat:       gluetypes.DataFormatJson,
				SchemaDefinition: aws.String(testAvroSchema),
			}},
			validationFunc: func(t *testing.T, _ string, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "expected AVRO")
			},
		},
		{
			name:            "nil schema definition is rejected",
			schemaVersionID: "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11",
			api: &fakeGlueAPI{out: &glue.GetSchemaVersionOutput{
				DataFormat: gluetypes.DataFormatAvro,
			}},
			validationFunc: func(t *testing.T, _ string, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "empty schema definition")
			},
		},
		{
			name:            "empty schema definition is rejected",
			schemaVersionID: "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11",
			api:             &fakeGlueAPI{out: avroSchemaVersionOutput("")},
			validationFunc: func(t *testing.T, _ string, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "empty schema definition")
			},
		},
		{
			name:            "unparsable avro schema is rejected",
			schemaVersionID: "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11",
			api:             &fakeGlueAPI{out: avroSchemaVersionOutput(`{"type":"not-a-real-type"}`)},
			validationFunc: func(t *testing.T, _ string, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "failed to parse avro schema")
			},
		},
		{
			// Glue accepts names that the Avro strict name regex rejects, and
			// CDC producers routinely register namespaces derived from database
			// identifiers that contain hyphens.
			name:            "namespace with hyphens is accepted",
			schemaVersionID: "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11",
			api: &fakeGlueAPI{out: avroSchemaVersionOutput(
				`{"type":"record","name":"Envelope","namespace":"some-db.public.some-table-v0",` +
					`"fields":[{"name":"a","type":"long"}]}`)},
			validationFunc: func(t *testing.T, schemaJSON string, err error) {
				require.NoError(t, err)
				assert.Contains(t, schemaJSON, "some-db.public.some-table-v0")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := NewClientWithAPI(tt.api, testConfig(), testLogger())

			sch, err := client.AvroSchemaByVersionID(t.Context(), tt.schemaVersionID)

			var schemaJSON string
			if sch != nil {
				schemaJSON = sch.String()
			}
			tt.validationFunc(t, schemaJSON, err)
		})
	}
}

func TestClient_AvroSchemaByVersionID_ForwardsVersionID(t *testing.T) {
	api := &fakeGlueAPI{out: avroSchemaVersionOutput(testAvroSchema)}
	client := NewClientWithAPI(api, testConfig(), testLogger())

	const versionID = "00112233-4455-6677-8899-aabbccddeeff"
	_, err := client.AvroSchemaByVersionID(t.Context(), versionID)

	require.NoError(t, err)
	assert.Equal(t, versionID, api.requestedVersionID)
}

func TestClient_AvroSchemaByVersionID_CachesSchemas(t *testing.T) {
	api := &fakeGlueAPI{out: avroSchemaVersionOutput(testAvroSchema)}
	client := NewClientWithAPI(api, testConfig(), testLogger())

	const versionID = "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11"
	first, err := client.AvroSchemaByVersionID(t.Context(), versionID)
	require.NoError(t, err)

	second, err := client.AvroSchemaByVersionID(t.Context(), versionID)
	require.NoError(t, err)

	assert.Equal(t, 1, api.calls, "expected the second lookup to be served from the cache")
	assert.Same(t, first, second)
}

func TestClient_AvroSchemaByVersionID_DoesNotCacheAcrossVersionIDs(t *testing.T) {
	api := &fakeGlueAPI{out: avroSchemaVersionOutput(testAvroSchema)}
	client := NewClientWithAPI(api, testConfig(), testLogger())

	_, err := client.AvroSchemaByVersionID(t.Context(), "b7f9c0ce-4e4b-4a3f-9a0b-2c7d1e5f8a11")
	require.NoError(t, err)

	_, err = client.AvroSchemaByVersionID(t.Context(), "00112233-4455-6677-8899-aabbccddeeff")
	require.NoError(t, err)

	assert.Equal(t, 2, api.calls, "each distinct schema version id should be fetched once")
}

func TestNewClient(t *testing.T) {
	tests := []struct {
		name           string
		cfg            config.GlueSchemaRegistry
		validationFunc func(t *testing.T, client *Client, err error)
	}{
		{
			name: "disabled registry returns an error",
			cfg:  config.GlueSchemaRegistry{Enabled: false},
			validationFunc: func(t *testing.T, client *Client, err error) {
				require.Error(t, err)
				assert.Nil(t, client)
				assert.Contains(t, err.Error(), "not enabled")
			},
		},
		{
			name: "enabled registry without a region is rejected",
			cfg:  config.GlueSchemaRegistry{Enabled: true},
			validationFunc: func(t *testing.T, client *Client, err error) {
				require.Error(t, err)
				assert.Nil(t, client)
				assert.Contains(t, err.Error(), "invalid AWS Glue Schema Registry config")
			},
		},
		{
			name: "negative cache ttl is rejected",
			cfg: config.GlueSchemaRegistry{
				Enabled:  true,
				Region:   "us-east-1",
				CacheTTL: -time.Second,
			},
			validationFunc: func(t *testing.T, client *Client, err error) {
				require.Error(t, err)
				assert.Nil(t, client)
				assert.Contains(t, err.Error(), "cacheTtl must not be negative")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewClient(t.Context(), tt.cfg, testLogger())
			tt.validationFunc(t, client, err)
		})
	}
}
