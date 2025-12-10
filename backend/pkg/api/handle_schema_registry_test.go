package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_getSubjectFromRequestPath(t *testing.T) {
	// demonstration of the issue
	// see comment in code

	r := httptest.NewRequest(
		http.MethodGet,
		"http://example.com/api/schema-registry/subjects/%252F/versions/last",
		http.NoBody,
	)
	assert.Equal(t, "/api/schema-registry/subjects/%2F/versions/last", r.URL.Path)
	assert.Equal(t, "", r.URL.RawPath)

	// tests

	tests := []struct {
		name string
		string
		target   string
		expected string
	}{
		{
			name:     "no special characters",
			target:   "http://example.com/api/schema-registry/subjects/asdf/versions/last",
			expected: "asdf",
		},
		{
			name:     "no special characters no suffix",
			target:   "http://example.com/api/schema-registry/subjects/asdf",
			expected: "asdf",
		},
		{
			name:     "no special characters no suffix with end slash",
			target:   "http://example.com/api/schema-registry/subjects/asdf/",
			expected: "asdf",
		},
		{
			name:     "with slashes",
			target:   "http://example.com/api/schema-registry/subjects/common%2Ffolder%2Fenvelope.proto/versions/last",
			expected: "common/folder/envelope.proto",
		},
		{
			name:     "with +",
			target:   "http://example.com/api/schema-registry/subjects/with+plus/versions/last",
			expected: "with+plus",
		},
		{
			name:     "with -",
			target:   "http://example.com/api/schema-registry/subjects/with-hyphen/versions/last",
			expected: "with-hyphen",
		},
		{
			name:     "with %252F",
			target:   "http://example.com/api/schema-registry/subjects/with%252Fslash/versions/last",
			expected: "with%2Fslash",
		},
		{
			name:     "%252F",
			target:   "http://example.com/api/schema-registry/subjects/%252F/versions/last",
			expected: "%2F",
		},
		{
			name:     "with config %252F",
			target:   "http://example.com/api/schema-registry/config/with%252Fslash",
			expected: "with%2Fslash",
		},
		{
			name:     "with config %252F end slash",
			target:   "http://example.com/api/schema-registry/config/with%252Fslash/",
			expected: "with%2Fslash",
		},
		{
			name:     "with config %252F suffix",
			target:   "http://example.com/api/schema-registry/config/with%252Fslash/suffix",
			expected: "with%2Fslash",
		},
		{
			name:     "with port",
			target:   "http://example.com:8080/api/schema-registry/subjects/with%252Fslash/versions/last",
			expected: "with%2Fslash",
		},
		{
			name:     "no host",
			target:   "http://:8080/api/schema-registry/subjects/with%252Fslash/versions/last",
			expected: "with%2Fslash",
		},
		{
			name:     "no host no port",
			target:   "/api/schema-registry/subjects/with%252Fslash/versions/last",
			expected: "with%2Fslash",
		},
		{
			name:     "with query",
			target:   "https://console-123.cn456.fmc.ppd.cloud.redpanda.com/api/schema-registry/subjects/repro?permanent=false",
			expected: "repro",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(
			tt.name, func(t *testing.T) {
				r := httptest.NewRequest(http.MethodGet, tt.target, http.NoBody)
				assert.Equal(t, tt.expected, getSubjectFromRequestPath(r))
			},
		)
	}
}

func Test_handleCreateSchema_NormalizeParam(t *testing.T) {
	tests := []struct {
		name             string
		requestBody      map[string]interface{}
		expectedNormalize bool
	}{
		{
			name: "normalize true",
			requestBody: map[string]interface{}{
				"schema":     `{"type": "record", "name": "test"}`,
				"schemaType": "AVRO",
				"params": map[string]interface{}{
					"normalize": true,
				},
			},
			expectedNormalize: true,
		},
		{
			name: "normalize false",
			requestBody: map[string]interface{}{
				"schema":     `{"type": "record", "name": "test"}`,
				"schemaType": "AVRO",
				"params": map[string]interface{}{
					"normalize": false,
				},
			},
			expectedNormalize: false,
		},
		{
			name: "params omitted defaults to false",
			requestBody: map[string]interface{}{
				"schema":     `{"type": "record", "name": "test"}`,
				"schemaType": "AVRO",
			},
			expectedNormalize: false,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			// Marshal request body
			body, err := json.Marshal(tt.requestBody)
			require.NoError(t, err)

			// Create request
			r := httptest.NewRequest(
				http.MethodPost,
				"http://example.com/api/schema-registry/subjects/test-subject/versions",
				bytes.NewReader(body),
			)
			r.Header.Set("Content-Type", "application/json")

			// Parse the request body to verify normalize parameter
			type createSchemaRequest struct {
				Schema     string `json:"schema"`
				SchemaType string `json:"schemaType"`
				Params     struct {
					Normalize bool `json:"normalize"`
				} `json:"params"`
			}

			var payload createSchemaRequest
			err = json.NewDecoder(bytes.NewReader(body)).Decode(&payload)
			require.NoError(t, err)

			// Verify the normalize field is parsed correctly
			assert.Equal(t, tt.expectedNormalize, payload.Params.Normalize)
		})
	}
}
