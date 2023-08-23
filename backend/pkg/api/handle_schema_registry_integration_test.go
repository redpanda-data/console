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

	"github.com/redpanda-data/console/backend/pkg/console"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

func (s *APIIntegrationTestSuite) TestValidateSchema() {
	t := s.T()
	require := require.New(t)
	assert := assert.New(t)

	t.Run("happy path (protobuf)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		schemaStr := "syntax = \"proto3\";\n\npackage shop.v1;\n\nimport \"google/protobuf/timestamp.proto\";\n\nmessage Address {\n  int32 version = 1;\n  string id = 2;\n  message Customer {\n    string customer_id = 1;\n    string customer_type = 2;\n  }\n  Customer customer = 3;\n  string type = 4;\n  string first_name = 5;\n  string last_name = 6;\n  string state = 7;\n  string house_number = 8;\n  string city = 9;\n  string zip = 10;\n  float latitude = 11;\n  float longitude = 12;\n  string phone = 13;\n  string additional_address_info = 14;\n  google.protobuf.Timestamp created_at = 15;\n  int32 revision = 16;\n}\n"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   schema.TypeProtobuf.String(),
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
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		schemaStr := "{\r\n  \"type\": \"record\",\r\n  \"name\": \"Address\",\r\n  \"namespace\": \"com.shop.v1.avro\",\r\n  \"doc\": \"Address is a customer's address that can be selected for deliveries or invoices\",\r\n  \"fields\": [\r\n    {\r\n      \"name\": \"version\",\r\n      \"type\": \"int\"\r\n    },\r\n    {\r\n      \"name\": \"id\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"customer\",\r\n      \"type\": {\r\n        \"name\": \"AddressCustomer\",\r\n        \"type\": \"record\",\r\n        \"fields\": [\r\n          {\r\n            \"name\": \"id\",\r\n            \"type\": \"string\"\r\n          },\r\n          {\r\n            \"name\": \"type\",\r\n            \"type\": \"string\"\r\n          }\r\n        ]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"type\",\r\n      \"type\": {\r\n        \"name\": \"AddressType\",\r\n        \"type\": \"enum\",\r\n        \"symbols\": [\"INVOICE\", \"DELIVERY\"]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"firstName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"lastName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"state\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"street\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"houseNumber\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"city\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"zip\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"latitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"longitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"phone\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"additionalAddressInfo\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"createdAt\",\r\n      \"type\": {\"type\": \"int\", \"logicalType\": \"date\"}\r\n    },\r\n    {\r\n      \"name\": \"revision\",\r\n      \"type\": \"int\"\r\n    }\r\n  ]\r\n}"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   schema.TypeAvro.String(),
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
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// This schema uses the type "int" instead of "int32"
		schemaStr := "syntax = \"proto3\";\n\npackage shop.v1;\n\nimport \"google/protobuf/timestamp.proto\";\n\nmessage Address {\n  int version = 1;\n  string id = 2;\n  message Customer {\n    string customer_id = 1;\n    string customer_type = 2;\n  }\n  Customer customer = 3;\n  string type = 4;\n  string first_name = 5;\n  string last_name = 6;\n  string state = 7;\n  string house_number = 8;\n  string city = 9;\n  string zip = 10;\n  float latitude = 11;\n  float longitude = 12;\n  string phone = 13;\n  string additional_address_info = 14;\n  google.protobuf.Timestamp created_at = 15;\n  int32 revision = 16;\n}\n"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   schema.TypeProtobuf.String(),
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
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Schema is missing the name property
		schemaStr := "{\r\n  \"type\": \"record\",\r\n  \"namespace\": \"com.shop.v1.avro\",\r\n  \"doc\": \"Address is a customer's address that can be selected for deliveries or invoices\",\r\n  \"fields\": [\r\n    {\r\n      \"name\": \"version\",\r\n      \"type\": \"int\"\r\n    },\r\n    {\r\n      \"name\": \"id\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"customer\",\r\n      \"type\": {\r\n        \"name\": \"AddressCustomer\",\r\n        \"type\": \"record\",\r\n        \"fields\": [\r\n          {\r\n            \"name\": \"id\",\r\n            \"type\": \"string\"\r\n          },\r\n          {\r\n            \"name\": \"type\",\r\n            \"type\": \"string\"\r\n          }\r\n        ]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"type\",\r\n      \"type\": {\r\n        \"name\": \"AddressType\",\r\n        \"type\": \"enum\",\r\n        \"symbols\": [\"INVOICE\", \"DELIVERY\"]\r\n      }\r\n    },\r\n    {\r\n      \"name\": \"firstName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"lastName\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"state\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"street\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"houseNumber\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"city\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"zip\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"latitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"longitude\",\r\n      \"type\": \"double\"\r\n    },\r\n    {\r\n      \"name\": \"phone\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"additionalAddressInfo\",\r\n      \"type\": \"string\"\r\n    },\r\n    {\r\n      \"name\": \"createdAt\",\r\n      \"type\": {\"type\": \"int\", \"logicalType\": \"date\"}\r\n    },\r\n    {\r\n      \"name\": \"revision\",\r\n      \"type\": \"int\"\r\n    }\r\n  ]\r\n}"
		req := struct {
			Schema string `json:"schema"`
			Type   string `json:"schemaType"`
		}{
			Schema: schemaStr,
			Type:   schema.TypeAvro.String(),
		}
		res, body := s.apiRequest(ctx, http.MethodPost, "/api/schema-registry/subjects/new-schema/versions/latest/validate", req)
		require.Equal(200, res.StatusCode)

		validationResponse := console.SchemaRegistrySchemaValidation{}
		err := json.Unmarshal(body, &validationResponse)
		require.NoError(err)

		assert.False(validationResponse.IsValid)
		assert.NotEmpty(validationResponse.ParsingError, "parsing error should be set")
	})
}
