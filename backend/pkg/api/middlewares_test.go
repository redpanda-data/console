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
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rs/cors"
	"github.com/stretchr/testify/require"
)

func TestCreateHSTSHeaderMiddleware(t *testing.T) {
	for _, enabled := range []bool{true, false} {
		t.Run(fmt.Sprintf("%t", enabled), func(t *testing.T) {
			middleware := createHSTSHeaderMiddleware(enabled)
			ts := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Write([]byte("ok"))
			})))

			defer ts.Close()

			resp, err := ts.Client().Get(ts.URL)
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, resp.StatusCode)

			val := resp.Header.Get("Strict-Transport-Security")
			if enabled {
				require.Equal(t, "max-age=31536000", val)
			} else {
				require.Equal(t, "", val)
			}
		})
	}
}

func TestCORSPrivateNetworkAccess(t *testing.T) {
	// Test that rs/cors AllowPrivateNetwork option correctly handles
	// Chrome's Private Network Access preflight requests for BYOC deployments.
	for _, enabled := range []bool{true, false} {
		t.Run(fmt.Sprintf("AllowPrivateNetwork=%t", enabled), func(t *testing.T) {
			c := cors.New(cors.Options{
				AllowedOrigins:      []string{"https://cloud.redpanda.com"},
				AllowedMethods:      []string{"GET", "POST", "OPTIONS"},
				AllowedHeaders:      []string{"*"},
				AllowPrivateNetwork: enabled,
			})

			handler := c.Handler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Write([]byte("ok"))
			}))

			// Simulate Chrome PNA preflight request
			req := httptest.NewRequest(http.MethodOptions, "/", http.NoBody)
			req.Header.Set("Origin", "https://cloud.redpanda.com")
			req.Header.Set("Access-Control-Request-Method", "GET")
			req.Header.Set("Access-Control-Request-Private-Network", "true")

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			val := rec.Header().Get("Access-Control-Allow-Private-Network")
			if enabled {
				require.Equal(t, "true", val, "expected PNA header for BYOC deployments")
			} else {
				require.Empty(t, val, "should not set PNA header when disabled")
			}
		})
	}
}
