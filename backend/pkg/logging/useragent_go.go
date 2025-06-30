// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package logging

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

func TestUserAgentMiddleware(t *testing.T) {
	tests := []struct {
		name        string
		userAgent   string
		expectedUA  string
		description string
	}{
		{
			name:        "with valid user agent",
			userAgent:   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			expectedUA:  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			description: "should preserve the actual user agent when present",
		},
		{
			name:        "with empty user agent",
			userAgent:   "",
			expectedUA:  "unknown",
			description: "should set to 'unknown' when user agent is empty",
		},
		{
			name:        "with custom user agent",
			userAgent:   "MyApp/1.0",
			expectedUA:  "MyApp/1.0",
			description: "should preserve custom user agent when present",
		},
		{
			name:        "with whitespace only user agent",
			userAgent:   "   ",
			expectedUA:  "   ",
			description: "should preserve whitespace-only user agent (not considered empty)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create an observed logger to capture log entries
			observedZapCore, observedLogs := observer.New(zap.InfoLevel)
			logger := zap.New(observedZapCore)

			// Create a context with the logger
			ctx := ContextWithLogger(context.Background(), logger)

			// Create a test handler that verifies the logger was updated
			var capturedLogger *zap.Logger
			testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				capturedLogger = FromContext(r.Context())
				w.WriteHeader(http.StatusOK)
			})

			// Wrap the test handler with the middleware
			middleware := UserAgentMiddleware(testHandler)

			// Create a test request with the specified user agent
			req := httptest.NewRequest("GET", "/test", nil)
			req = req.WithContext(ctx)
			if tt.userAgent != "" {
				req.Header.Set("User-Agent", tt.userAgent)
			}

			// Create a response recorder
			rr := httptest.NewRecorder()

			// Execute the middleware
			middleware.ServeHTTP(rr, req)

			// Verify the response
			assert.Equal(t, http.StatusOK, rr.Code)

			// Verify that the logger was captured and is not nil
			require.NotNil(t, capturedLogger, "logger should be present in context")

			// Test that the logger has the user_agent field by logging something
			capturedLogger.Info("test log entry")

			// Verify that the log entry contains the expected user agent
			require.Equal(t, 1, observedLogs.Len(), "should have one log entry")
			logEntry := observedLogs.All()[0]

			// Find the user_agent field in the log entry
			var userAgentField zap.Field
			var foundUserAgent bool
			for _, field := range logEntry.Context {
				if field.Key == "user_agent" {
					userAgentField = field
					foundUserAgent = true
					break
				}
			}

			require.True(t, foundUserAgent, "user_agent field should be present in log context")
			assert.Equal(t, tt.expectedUA, userAgentField.String, "user agent should match expected value")
		})
	}
}

func TestUserAgentMiddleware_ContextPropagation(t *testing.T) {
	// Test that the context is properly propagated through the middleware chain
	observedZapCore, _ := observer.New(zap.InfoLevel)
	logger := zap.New(observedZapCore)
	ctx := ContextWithLogger(context.Background(), logger)

	var receivedContext context.Context
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedContext = r.Context()
		w.WriteHeader(http.StatusOK)
	})

	middleware := UserAgentMiddleware(testHandler)
	req := httptest.NewRequest("GET", "/test", nil)
	req = req.WithContext(ctx)
	req.Header.Set("User-Agent", "TestAgent/1.0")
	rr := httptest.NewRecorder()

	middleware.ServeHTTP(rr, req)

	// Verify context was received
	require.NotNil(t, receivedContext, "context should be propagated to next handler")

	// Verify logger is present in context
	contextLogger := FromContext(receivedContext)
	require.NotNil(t, contextLogger, "logger should be present in propagated context")
}

func TestUserAgentMiddleware_NoUserAgentHeader(t *testing.T) {
	// Test behavior when User-Agent header is completely absent
	observedZapCore, observedLogs := observer.New(zap.InfoLevel)
	logger := zap.New(observedZapCore)
	ctx := ContextWithLogger(context.Background(), logger)

	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logger := FromContext(r.Context())
		logger.Info("test message")
		w.WriteHeader(http.StatusOK)
	})

	middleware := UserAgentMiddleware(testHandler)
	req := httptest.NewRequest("GET", "/test", nil)
	req = req.WithContext(ctx)
	// Don't set User-Agent header at all
	rr := httptest.NewRecorder()

	middleware.ServeHTTP(rr, req)

	// Verify the log entry
	require.Equal(t, 1, observedLogs.Len())
	logEntry := observedLogs.All()[0]

	var userAgentField zap.Field
	var foundUserAgent bool
	for _, field := range logEntry.Context {
		if field.Key == "user_agent" {
			userAgentField = field
			foundUserAgent = true
			break
		}
	}

	require.True(t, foundUserAgent, "user_agent field should be present")
	assert.Equal(t, "unknown", userAgentField.String, "user agent should be 'unknown' when header is absent")
}
