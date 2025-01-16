// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package schema

//nolint:goimports // goimports and gofumpt conflict
import (
	"context"
	"net/http"
	"testing" //nolint:nolintlint,gofumpt // goimports and gofumpt conflict

	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"unique" //nolint:nolintlint,gofumpt // goimports and gofumpt conflict

	"github.com/redpanda-data/console/backend/pkg/config"
)

const (
	testSchemaRegistryBaseURL = "https://schema-registry.company.com"
)

func TestClient_GetSchemaByID(t *testing.T) {
	baseURL := testSchemaRegistryBaseURL
	c, _ := newClient(config.Schema{
		Enabled: true,
		URLs:    []string{baseURL},
	})

	httpClient := c.client.GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	schemaStr := "{\"type\": \"string\"}"
	httpmock.RegisterResponder("GET", baseURL+"/schemas/ids/1000",
		func(*http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, map[string]string{
				"schema": schemaStr,
			})
		})

	expected := &SchemaResponse{Schema: unique.Make(schemaStr)}
	actual, err := c.GetSchemaByID(context.Background(), 1000)
	assert.NoError(t, err, "expected no error when fetching schema by id")
	assert.Equal(t, expected, actual)
}

func TestClient_GetSubjects(t *testing.T) {
	baseURL := testSchemaRegistryBaseURL
	c, _ := newClient(config.Schema{
		Enabled: true,
		URLs:    []string{baseURL},
	})

	httpClient := c.client.GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	subjects := []string{"subject1", "subject2"}
	httpmock.RegisterResponder("GET", baseURL+"/subjects",
		func(*http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, subjects)
		})

	expected := &SubjectsResponse{Subjects: subjects}
	actual, err := c.GetSubjects(context.Background(), false)
	assert.NoError(t, err, "expected no error when fetching subjects")
	assert.Equal(t, expected, actual)
}

func TestClient_GetSubjectVersions(t *testing.T) {
	baseURL := testSchemaRegistryBaseURL
	c, _ := newClient(config.Schema{
		Enabled: true,
		URLs:    []string{baseURL},
	})
	httpClient := c.client.GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	versions := []int{1, 2, 3}
	httpmock.RegisterResponder("GET", baseURL+"/subjects/orders/versions",
		func(_ *http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, versions)
		})

	expected := &SubjectVersionsResponse{Versions: versions}
	actual, err := c.GetSubjectVersions(context.Background(), "orders", false)
	assert.NoError(t, err, "expected no error when fetching subject versions")
	assert.Equal(t, expected, actual)
}
