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
	"net/http"
	"testing"

	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
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
		func(req *http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, map[string]interface{}{
				"schema": schemaStr,
				"references": []map[string]interface{}{{
					"name":    "referenced.schema",
					"subject": "referenced.schema",
					"version": 1,
				}},
			})
		})

	// Simple referenced subject to resolve
	referencedSchemaStr := "{\"type\": \"enum\", \"name\": \"referenced.schema\", \"symbols\": [\"FOO\"]}"
	httpmock.RegisterResponder("GET", baseURL+"/subjects/referenced.schema/versions/1",
		func(req *http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, map[string]interface{}{
				"schema":  referencedSchemaStr,
				"subject": "referenced.schema",
				"version": 1,
				"id":      1001,
			})
		})

	actual, err := s.GetAvroSchemaByID(1000)
	expectedSchemaString := "{\"name\":\"parent.schema\",\"type\":\"record\",\"fields\":[{\"name\":\"reference\",\"type\":{\"name\":\"referenced.schema\",\"type\":\"enum\",\"symbols\":[\"FOO\"]}}]}"
	assert.NoError(t, err, "expected no error when fetching avro schema by id")
	assert.Equal(t, actual.String(), expectedSchemaString)
}
