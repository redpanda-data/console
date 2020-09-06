package schema

import (
	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"net/http"
	"testing"
)

func TestClient_GetSchemaByID(t *testing.T) {
	baseURL := "https://schema-registry.company.com"
	c := newClient(Config{
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
	c := newClient(Config{
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
	c := newClient(Config{
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
