// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/console"
)

func (s *APIIntegrationTestSuite) TestValidateSchema() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("happy path (protobuf)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		schemaStr := "syntax = \"proto3\";\n\npackage shop.v1;\n\nimport \"google/protobuf/timestamp.proto\";\n\nmessage Address {\n  int32 version = 1;\n  string id = 2;\n  message Customer {\n    string customer_id = 1;\n    string customer_type = 2;\n  }\n  Customer customer = 3;\n  string type = 4;\n  string first_name = 5;\n  string last_name = 6;\n  string state = 7;\n  string house_number = 8;\n  string city = 9;\n  string zip = 10;\n  float latitude = 11;\n  float longitude = 12;\n  string phone = 13;\n  string additional_address_info = 14;\n  google.protobuf.Timestamp created_at = 15;\n  int32 revision = 16;\n}\n"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   sr.TypeProtobuf.String(),
		}
		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/new-schema/versions/latest/validate", req)
		require.Equal(200, res.StatusCode)

		validationResponse := console.SchemaRegistrySchemaValidation{}
		err := json.Unmarshal(body, &validationResponse)
		require.NoError(err)

		assert.True(validationResponse.IsValid)
		assert.Empty(validationResponse.ParsingError, "parsing error should not be set")
	})

	t.Run("happy path (avro)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		schemaStr := "{\r\n  \"type\": \"record\",\r\n  \"name\": \"Address\",\r\n  \"namespace\": \"com.shop.v1.avro\",\r\n  \"doc\": \"Address is a customer's address that can be selected for deliveries or invoices\",\r\n  \"fields\": [\r\n    {\r\n      \"name\": \"version\",\r\n      \"type\": \"int\"\r\n    },\r\n    {\r\n      \"name\": \"id\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"customer\",\r\n      \"type\": {\r\n        \"name\": \"AddressCustomer\",\r\n        \"type\": \"record\",\r\n        \"fields\": [\r\n          {\r\n            \"name\": \"id\",\r\n            \"type\": \"string\"\r\n          },\r\n          {\r\n            \"name\": \"type\",\r\n            \"type\": \"string\"\r\n          }\r\n        ]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"type\",\r\n      \"type\": {\r\n        \"name\": \"AddressType\",\r\n        \"type\": \"enum\",\r\n        \"symbols\": [\"INVOICE\", \"DELIVERY\"]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"firstName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"lastName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"state\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"street\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"houseNumber\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"city\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"zip\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"latitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"longitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"phone\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"additionalAddressInfo\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"createdAt\",\r\n      \"type\": {\"type\": \"int\", \"logicalType\": \"date\"}\r\n    },\r\n    {\r\n      \"name\": \"revision\",\r\n      \"type\": \"int\"\r\n    }\r\n  ]\r\n}"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   sr.TypeAvro.String(),
		}
		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/new-schema/versions/latest/validate", req)
		require.Equal(200, res.StatusCode)

		validationResponse := console.SchemaRegistrySchemaValidation{}
		err := json.Unmarshal(body, &validationResponse)
		require.NoError(err)

		assert.True(validationResponse.IsValid)
		assert.Empty(validationResponse.ParsingError, "parsing error should not be set")
	})

	t.Run("malformed schema (protobuf)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		// This schema uses the type "int" instead of "int32"
		schemaStr := "syntax = \"proto3\";\n\npackage shop.v1;\n\nimport \"google/protobuf/timestamp.proto\";\n\nmessage Address {\n  int version = 1;\n  string id = 2;\n  message Customer {\n    string customer_id = 1;\n    string customer_type = 2;\n  }\n  Customer customer = 3;\n  string type = 4;\n  string first_name = 5;\n  string last_name = 6;\n  string state = 7;\n  string house_number = 8;\n  string city = 9;\n  string zip = 10;\n  float latitude = 11;\n  float longitude = 12;\n  string phone = 13;\n  string additional_address_info = 14;\n  google.protobuf.Timestamp created_at = 15;\n  int32 revision = 16;\n}\n"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   sr.TypeProtobuf.String(),
		}
		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/new-schema/versions/latest/validate", req)
		require.Equal(200, res.StatusCode)

		validationResponse := console.SchemaRegistrySchemaValidation{}
		err := json.Unmarshal(body, &validationResponse)
		require.NoError(err)

		assert.False(validationResponse.IsValid)
		assert.NotEmpty(validationResponse.ParsingError, "parsing error should be set")
	})

	t.Run("malformed schema (avro)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		// Schema is missing the name property
		schemaStr := "{\r\n  \"type\": \"record\",\r\n  \"namespace\": \"com.shop.v1.avro\",\r\n  \"doc\": \"Address is a customer's address that can be selected for deliveries or invoices\",\r\n  \"fields\": [\r\n    {\r\n      \"name\": \"version\",\r\n      \"type\": \"int\"\r\n    },\r\n    {\r\n      \"name\": \"id\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"customer\",\r\n      \"type\": {\r\n        \"name\": \"AddressCustomer\",\r\n        \"type\": \"record\",\r\n        \"fields\": [\r\n          {\r\n            \"name\": \"id\",\r\n            \"type\": \"string\"\r\n          },\r\n          {\r\n            \"name\": \"type\",\r\n            \"type\": \"string\"\r\n          }\r\n        ]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"type\",\r\n      \"type\": {\r\n        \"name\": \"AddressType\",\r\n        \"type\": \"enum\",\r\n        \"symbols\": [\"INVOICE\", \"DELIVERY\"]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"firstName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"lastName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"state\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"street\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"houseNumber\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"city\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"zip\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"latitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"longitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"phone\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"additionalAddressInfo\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"createdAt\",\r\n      \"type\": {\"type\": \"int\", \"logicalType\": \"date\"}\r\n    },\r\n    {\r\n      \"name\": \"revision\",\r\n      \"type\": \"int\"\r\n    }\r\n  ]\r\n}"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   sr.TypeAvro.String(),
		}
		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/new-schema/versions/latest/validate", req)
		require.Equal(200, res.StatusCode)

		validationResponse := console.SchemaRegistrySchemaValidation{}
		err := json.Unmarshal(body, &validationResponse)
		require.NoError(err)

		assert.False(validationResponse.IsValid)
		assert.NotEmpty(validationResponse.ParsingError, "parsing error should be set")
	})

	t.Run("incompatible schema change (protobuf)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		// First, register a schema with string year field
		originalSchema := "syntax = \"proto3\";\n\npackage test.v1;\n\nmessage Car {\n  string make = 1;\n  string model = 2;\n  string year = 3;\n}\n"
		registerReq := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: originalSchema,
			Type:   sr.TypeProtobuf.String(),
		}
		registerRes, _ := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-car-compat/versions", registerReq)
		require.Equal(200, registerRes.StatusCode)

		// Now try to validate an incompatible change: year field changed from string to int32
		incompatibleSchema := "syntax = \"proto3\";\n\npackage test.v1;\n\nmessage Car {\n  string make = 1;\n  string model = 2;\n  int32 year = 3;\n}\n"
		validateReq := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: incompatibleSchema,
			Type:   sr.TypeProtobuf.String(),
		}
		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-car-compat/versions/latest/validate", validateReq)
		require.Equal(200, res.StatusCode)

		validationResponse := console.SchemaRegistrySchemaValidation{}
		err := json.Unmarshal(body, &validationResponse)
		require.NoError(err)

		// Schema should parse correctly but fail compatibility check
		assert.False(validationResponse.IsValid, "schema should be invalid due to compatibility")
		assert.Empty(validationResponse.ParsingError, "parsing error should not be set for valid protobuf")
		assert.False(validationResponse.Compatibility.IsCompatible, "schema should not be compatible")
		assert.NotEmpty(validationResponse.Compatibility.Error.ErrorType, "error type should be set")
		assert.NotEmpty(validationResponse.Compatibility.Error.Description, "error description should be set")
		assert.Contains(validationResponse.Compatibility.Error.ErrorType, "FIELD_SCALAR_KIND_CHANGED", "error type should indicate field type change")
	})
}

func (s *APIIntegrationTestSuite) TestCreateSchemaWithNormalize() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("create schema with normalize=false", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		schemaStr := `syntax = "proto3";

enum Level {
  LEVEL_UNSPECIFIED = 0;
  LEVEL_CRITICAL = 2;
  LEVEL_NORMAL = 1;
}`
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
			Params struct {
				Normalize bool `json:"normalize"`
			} `json:"params"`
		}{
			Schema: schemaStr,
			Type:   sr.TypeProtobuf.String(),
		}
		req.Params.Normalize = false

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-normalize-false/versions", req)
		require.Equal(200, res.StatusCode)

		createResponse := struct {
			ID int `json:"id"`
		}{}
		err := json.Unmarshal(body, &createResponse)
		require.NoError(err)
		assert.Greater(createResponse.ID, 0, "schema ID should be returned")
	})

	t.Run("create schema without normalize param (default false)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		schemaStr := `syntax = "proto3";

enum State {
  STATE_UNSPECIFIED = 0;
  STATE_ACTIVE = 1;
}`
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   sr.TypeProtobuf.String(),
		}

		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-normalize-default/versions", req)
		require.Equal(200, res.StatusCode)

		createResponse := struct {
			ID int `json:"id"`
		}{}
		err := json.Unmarshal(body, &createResponse)
		require.NoError(err)
		assert.Greater(createResponse.ID, 0, "schema ID should be returned")
	})

	t.Run("normalize=true prevents duplicates with different enum value order", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		// First schema with enum values in one order [0, 2, 1]
		schema1 := `syntax = "proto3";

enum Role {
  ROLE_UNSPECIFIED = 0;
  ROLE_ADMIN = 2;
  ROLE_USER = 1;
}`

		req1 := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
			Params struct {
				Normalize bool `json:"normalize"`
			} `json:"params"`
		}{
			Schema: schema1,
			Type:   sr.TypeProtobuf.String(),
		}
		req1.Params.Normalize = true

		res1, body1 := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-normalize-enum-order/versions", req1)
		require.Equal(200, res1.StatusCode, "first schema creation with normalize=true should succeed")

		createResponse1 := struct {
			ID int `json:"id"`
		}{}
		err := json.Unmarshal(body1, &createResponse1)
		require.NoError(err)
		firstSchemaID := createResponse1.ID
		assert.Greater(firstSchemaID, 0, "first schema ID should be returned")

		// Second schema with enum values in DIFFERENT order [0, 1, 2]
		schema2 := `syntax = "proto3";

enum Role {
  ROLE_UNSPECIFIED = 0;
  ROLE_USER = 1;
  ROLE_ADMIN = 2;
}`

		req2 := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
			Params struct {
				Normalize bool `json:"normalize"`
			} `json:"params"`
		}{
			Schema: schema2,
			Type:   sr.TypeProtobuf.String(),
		}
		req2.Params.Normalize = true

		res2, body2 := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-normalize-enum-order/versions", req2)
		require.Equal(200, res2.StatusCode, "second schema creation with normalize=true should succeed")

		createResponse2 := struct {
			ID int `json:"id"`
		}{}
		err = json.Unmarshal(body2, &createResponse2)
		require.NoError(err)
		secondSchemaID := createResponse2.ID

		assert.Equal(firstSchemaID, secondSchemaID, "with normalize=true, schemas with different enum value order should produce the same schema ID")
	})

	t.Run("normalize with Protobuf enum value ordering", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		// This test verifies that the normalize parameter works with Protobuf enum value ordering
		// Without normalize, different enum value ordering creates different schema versions

		// First schema with enum values in order [0, 2, 1]
		schema1 := `syntax = "proto3";

enum MyEnumB {
  ENUMB_VALUE0 = 0;
  ENUMB_VALUE2 = 2;
  ENUMB_VALUE1 = 1;
}

enum MyEnumA {
  ENUMA_VALUE0 = 0;
  ENUMA_VALUE2 = 2;
  ENUMA_VALUE1 = 1;
}`

		req1 := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
			Params struct {
				Normalize bool `json:"normalize"`
			} `json:"params"`
		}{
			Schema: schema1,
			Type:   sr.TypeProtobuf.String(),
		}
		req1.Params.Normalize = false

		res1, body1 := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-proto-no-normalize-enum/versions", req1)
		require.Equal(200, res1.StatusCode)

		createResponse1 := struct {
			ID int `json:"id"`
		}{}
		err := json.Unmarshal(body1, &createResponse1)
		require.NoError(err)
		firstSchemaID := createResponse1.ID
		assert.Greater(firstSchemaID, 0, "first schema ID should be returned")

		// Second schema with enum values in DIFFERENT order [0, 1, 2]
		schema2 := `syntax = "proto3";

enum MyEnumB {
  ENUMB_VALUE0 = 0;
  ENUMB_VALUE1 = 1;
  ENUMB_VALUE2 = 2;
}

enum MyEnumA {
  ENUMA_VALUE0 = 0;
  ENUMA_VALUE1 = 1;
  ENUMA_VALUE2 = 2;
}`

		req2 := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
			Params struct {
				Normalize bool `json:"normalize"`
			} `json:"params"`
		}{
			Schema: schema2,
			Type:   sr.TypeProtobuf.String(),
		}
		req2.Params.Normalize = false

		res2, body2 := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-proto-no-normalize-enum/versions", req2)
		require.Equal(200, res2.StatusCode)

		createResponse2 := struct {
			ID int `json:"id"`
		}{}
		err = json.Unmarshal(body2, &createResponse2)
		require.NoError(err)
		secondSchemaID := createResponse2.ID

		// Without normalize, enum value order differences should create different schema IDs
		assert.NotEqual(firstSchemaID, secondSchemaID, "without normalize, schemas with different enum value order should create different schema IDs")

		// Now test the SAME schemas with normalize=true on a different subject
		req3 := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
			Params struct {
				Normalize bool `json:"normalize"`
			} `json:"params"`
		}{
			Schema: schema1,
			Type:   sr.TypeProtobuf.String(),
		}
		req3.Params.Normalize = true

		res3, body3 := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-proto-with-normalize-enum/versions", req3)
		require.Equal(200, res3.StatusCode)

		createResponse3 := struct {
			ID int `json:"id"`
		}{}
		err = json.Unmarshal(body3, &createResponse3)
		require.NoError(err)
		thirdSchemaID := createResponse3.ID
		assert.Greater(thirdSchemaID, 0, "third schema ID should be returned")

		// Same schema with different enum value order but normalize=true
		req4 := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
			Params struct {
				Normalize bool `json:"normalize"`
			} `json:"params"`
		}{
			Schema: schema2,
			Type:   sr.TypeProtobuf.String(),
		}
		req4.Params.Normalize = true

		res4, body4 := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/test-proto-with-normalize-enum/versions", req4)
		require.Equal(200, res4.StatusCode)

		createResponse4 := struct {
			ID int `json:"id"`
		}{}
		err = json.Unmarshal(body4, &createResponse4)
		require.NoError(err)
		fourthSchemaID := createResponse4.ID

		// With normalize=true, they should have the same ID
		assert.Equal(thirdSchemaID, fourthSchemaID, "with normalize=true, schemas with different enum value order should produce the same schema ID")
	})
}
