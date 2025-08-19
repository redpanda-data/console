// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
)

// TestHandlePutConnectorConfigParsesRequestBody ensures the endpoint properly parses the request body
// This is a regression test for the bug where the endpoint forgot to call rest.Decode(),
// causing all connector configs to be treated as empty and fail with "Connector class is not set"
func TestHandlePutConnectorConfigParsesRequestBody(t *testing.T) {
	// Test that malformed JSON fails at parsing stage (not at service stage)
	t.Run("malformed_json_returns_bad_request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/kafka-connect/clusters/test-cluster/connectors/test-connector", bytes.NewReader([]byte(`{"config": invalid}`)))
		req.Header.Set("Content-Type", "application/json")

		// Setup chi URL params
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("clusterName", "test-cluster")
		rctx.URLParams.Add("connector", "test-connector")
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

		api := &API{
			ConnectSvc: nil, // Should not be reached due to parsing failure
			Logger:     slog.New(slog.NewTextHandler(nil, &slog.HandlerOptions{Level: slog.LevelError + 1})),
		}

		w := httptest.NewRecorder()
		handler := api.handlePutConnectorConfig()
		handler.ServeHTTP(w, req)

		// Should return 400 Bad Request due to JSON parsing error
		// If rest.Decode() was missing, this would cause different behavior
		assert.Equal(t, http.StatusBadRequest, w.Code, "Malformed JSON should return 400 Bad Request")
	})

	// Test that empty request body (no JSON) properly fails at parsing stage
	t.Run("empty_request_body_fails_at_parsing", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/kafka-connect/clusters/test-cluster/connectors/test-connector", bytes.NewReader([]byte("")))
		req.Header.Set("Content-Type", "application/json")

		// Setup chi URL params
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("clusterName", "test-cluster")
		rctx.URLParams.Add("connector", "test-connector")
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

		api := &API{
			ConnectSvc: nil, // Should not be reached due to parsing failure
			Logger:     slog.New(slog.NewTextHandler(nil, &slog.HandlerOptions{Level: slog.LevelError + 1})),
		}

		w := httptest.NewRecorder()
		handler := api.handlePutConnectorConfig()
		handler.ServeHTTP(w, req)

		// Should return 400 Bad Request due to empty/invalid JSON
		// This ensures rest.Decode() is being called
		assert.Equal(t, http.StatusBadRequest, w.Code, "Empty request body should return 400 Bad Request")
	})
}
