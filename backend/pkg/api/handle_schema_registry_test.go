package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func Test_getSubjectFromRequestPath(t *testing.T) {
	// demonstration of the issue
	// see comment in code

	r := httptest.NewRequest("GET", "http://example.com/api/schema-registry/subjects/%252F/versions/last", http.NoBody)
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
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", tt.target, http.NoBody)
			assert.Equal(t, tt.expected, getSubjectFromRequestPath(r))
		})
	}
}
