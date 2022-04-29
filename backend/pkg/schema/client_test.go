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
)

func TestClient_GetSchemaByID(t *testing.T) {
	baseURL := "https://schema-registry.company.com"
	c, _ := newClient(Config{
		Enabled: true,
		URLs:    []string{baseURL},
	})

	httpClient := c.client.GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	schemaStr := "{\"type\": \"string\"}"
	httpmock.RegisterResponder("GET", baseURL+"/schemas/ids/1000",
		func(req *http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, map[string]string{
				"schema": schemaStr,
			})
		})

	expected := &SchemaResponse{Schema: schemaStr}
	actual, err := c.GetSchemaByID(1000)
	assert.NoError(t, err, "expected no error when fetching schema by id")
	assert.Equal(t, expected, actual)
}

func TestClient_GetSubjects(t *testing.T) {
	baseURL := "https://schema-registry.company.com"
	c, _ := newClient(Config{
		Enabled: true,
		URLs:    []string{baseURL},
	})

	httpClient := c.client.GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	subjects := []string{"subject1", "subject2"}
	httpmock.RegisterResponder("GET", baseURL+"/subjects",
		func(req *http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, subjects)
		})

	expected := &SubjectsResponse{Subjects: subjects}
	actual, err := c.GetSubjects()
	assert.NoError(t, err, "expected no error when fetching subjects")
	assert.Equal(t, expected, actual)
}

func TestClient_GetSubjectVersions(t *testing.T) {
	baseURL := "https://schema-registry.company.com"
	c, _ := newClient(Config{
		Enabled: true,
		URLs:    []string{baseURL},
	})
	httpClient := c.client.GetClient()
	httpmock.ActivateNonDefault(httpClient)
	defer httpmock.DeactivateAndReset()

	versions := []int{1, 2, 3}
	httpmock.RegisterResponder("GET", baseURL+"/subjects/orders/versions",
		func(req *http.Request) (*http.Response, error) {
			return httpmock.NewJsonResponse(http.StatusOK, versions)
		})

	expected := &SubjectVersionsResponse{Versions: versions}
	actual, err := c.GetSubjectVersions("orders")
	assert.NoError(t, err, "expected no error when fetching subject versions")
	assert.Equal(t, expected, actual)
}
