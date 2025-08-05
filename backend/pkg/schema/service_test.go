// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

import (
	"context"
	"net/http"
	"testing"

	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/config"
)

func TestService_GetAvroSchemaByID(t *testing.T) {
	baseURL := testSchemaRegistryBaseURL
	logger, _ := zap.NewProduction()
	s, _ := NewService(config.Schema{
		Enabled: true,
		URLs:    []string{baseURL},
	}, logger)

	httpClient := (*s.registryClient.client).GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	// Parent schema with reference to another schema
	schemaStr := "{\"type\": \"record\", \"name\": \"parent.schema\", \"fields\": [{\"name\": \"reference\", \"type\": \"referenced.schema\"}]}"
	httpmock.RegisterResponder("GET", baseURL+"/schemas/ids/1000",
		func(*http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, map[string]any{
				"schema": schemaStr,
				"references": []map[string]any{{
					"name":    "referenced.schema",
					"subject": "referenced.schema",
					"version": 1,
				}},
				"schemaType": "AVRO",
			})
		})

	// Simple referenced subject to resolve
	referencedSchemaStr := "{\"type\": \"enum\", \"name\": \"referenced.schema\", \"symbols\": [\"FOO\"]}"
	httpmock.RegisterResponder("GET", baseURL+"/subjects/referenced.schema/versions/1",
		func(*http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, map[string]any{
				"schema":     referencedSchemaStr,
				"subject":    "referenced.schema",
				"version":    1,
				"schemaType": "AVRO",
				"id":         1001,
			})
		})

	actual, err := s.GetAvroSchemaByID(context.Background(), 1000)
	expectedSchemaString := "{\"name\":\"parent.schema\",\"type\":\"record\",\"fields\":[{\"name\":\"reference\",\"type\":{\"name\":\"referenced.schema\",\"type\":\"enum\",\"symbols\":[\"FOO\"]}}]}"
	assert.NoError(t, err, "expected no error when fetching avro schema by id")
	assert.Equal(t, actual.String(), expectedSchemaString)
}

func TestService_GetProtoDescriptors_ShouldContinueWithValidSchemasWhenSomeHaveBrokenReferences(t *testing.T) {
	baseURL := testSchemaRegistryBaseURL

	service, err := NewService(config.Schema{
		Enabled: true,
		URLs:    []string{baseURL},
	}, zap.NewNop())
	require.NoError(t, err)

	httpClient := service.registryClient.client.GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	// Mock /schemas endpoint to return mixed valid and invalid schemas
	httpmock.RegisterResponder("GET", baseURL+"/schemas",
		func(*http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, []map[string]any{
				{
					"subject":    "user-events-value",
					"version":    1,
					"id":         100,
					"schema":     "syntax = \"proto3\";\npackage example;\n\nmessage UserEvent {\n  string user_id = 1;\n  string event_type = 2;\n  string payload = 3;\n}",
					"schemaType": "PROTOBUF",
				},
				{
					"subject":    "order-events-value",
					"version":    1,
					"id":         200,
					"schema":     "syntax = \"proto3\";\npackage example;\n\nimport \"common/shared.proto\";\n\nmessage OrderEvent {\n  string order_id = 1;\n  SharedMetadata metadata = 2;\n}",
					"schemaType": "PROTOBUF",
					"references": []map[string]any{{
						"name":    "common/shared.proto",
						"subject": "common-shared-proto",
						"version": 1,
					}},
				},
			})
		})

	// Mock the missing reference to simulate soft-deleted schema
	httpmock.RegisterResponder("GET", baseURL+"/subjects/common-shared-proto/versions/1",
		func(*http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusNotFound, map[string]any{
				"error_code": 40401,
				"message":    "Subject 'common-shared-proto' version '1' not found.",
			})
		})

	// Test the desired behavior: should succeed with valid schemas, skip broken ones
	descriptors, err := service.GetProtoDescriptors(context.Background())

	// Should succeed even when some schemas have broken references
	assert.NoError(t, err, "should succeed even when some schemas have broken references")
	assert.NotNil(t, descriptors, "should return valid descriptors")
	assert.Len(t, descriptors, 1, "should have 1 valid descriptor (broken ones skipped)")
	assert.Contains(t, descriptors, 100, "should contain the valid UserEvent schema")
	// Schema 200 (order-events-value) should be skipped due to broken reference
}
