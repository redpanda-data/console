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
