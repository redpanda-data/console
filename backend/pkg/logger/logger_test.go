// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewSlogLogger(t *testing.T) {
	tests := []struct {
		name    string
		opts    []Option
		wantErr bool
	}{
		{
			name: "default logger",
			opts: nil,
		},
		{
			name: "with debug level",
			opts: []Option{WithLevel(slog.LevelDebug)},
		},
		{
			name: "with custom output",
			opts: []Option{WithOutput(&bytes.Buffer{})},
		},
		{
			name: "with default attributes",
			opts: []Option{
				WithDefaultAttrs(
					slog.String("service", "test"),
					slog.String("version", "1.0.0"),
				),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger := NewSlogLogger(tt.opts...)
			assert.NotNil(t, logger)
		})
	}
}

func TestLoggerMethods(t *testing.T) {
	tests := []struct {
		name     string
		logFunc  func(*slog.Logger, context.Context, string, ...any)
		level    string
		expected string
	}{
		{
			name:     "debug",
			logFunc:  (*slog.Logger).DebugContext,
			level:    "debug",
			expected: "DEBUG",
		},
		{
			name:     "info",
			logFunc:  (*slog.Logger).InfoContext,
			level:    "info",
			expected: "INFO",
		},
		{
			name:     "warn",
			logFunc:  (*slog.Logger).WarnContext,
			level:    "warn",
			expected: "WARN",
		},
		{
			name:     "error",
			logFunc:  (*slog.Logger).ErrorContext,
			level:    "error",
			expected: "ERROR",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := NewSlogLogger(
				WithOutput(&buf),
				WithFormat(FormatJSON),     // Explicitly use JSON mode for predictable output
				WithLevel(slog.LevelDebug), // Set to debug to capture all levels
			)

			tt.logFunc(logger, t.Context(), "test message", slog.String("key", "value"))

			output := buf.String()
			assert.Contains(t, output, "test message")
			assert.Contains(t, output, `"key":"value"`)
			assert.Contains(t, output, tt.expected)
		})
	}
}

func TestWithLevel(t *testing.T) {
	tests := []struct {
		name      string
		level     slog.Level
		shouldLog map[string]bool
	}{
		{
			name:  "debug level logs all",
			level: slog.LevelDebug,
			shouldLog: map[string]bool{
				"debug": true,
				"info":  true,
				"warn":  true,
				"error": true,
			},
		},
		{
			name:  "info level",
			level: slog.LevelInfo,
			shouldLog: map[string]bool{
				"debug": false,
				"info":  true,
				"warn":  true,
				"error": true,
			},
		},
		{
			name:  "warn level",
			level: slog.LevelWarn,
			shouldLog: map[string]bool{
				"debug": false,
				"info":  false,
				"warn":  true,
				"error": true,
			},
		},
		{
			name:  "error level",
			level: slog.LevelError,
			shouldLog: map[string]bool{
				"debug": false,
				"info":  false,
				"warn":  false,
				"error": true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := NewSlogLogger(
				WithOutput(&buf),
				WithLevel(tt.level),
			)

			// Test each log level
			logger.DebugContext(t.Context(), "debug message")
			debugLogged := strings.Contains(buf.String(), "debug message")
			assert.Equal(t, tt.shouldLog["debug"], debugLogged, "debug level mismatch")
			buf.Reset()

			logger.Info("info message")
			infoLogged := strings.Contains(buf.String(), "info message")
			assert.Equal(t, tt.shouldLog["info"], infoLogged, "info level mismatch")
			buf.Reset()

			logger.Warn("warn message")
			warnLogged := strings.Contains(buf.String(), "warn message")
			assert.Equal(t, tt.shouldLog["warn"], warnLogged, "warn level mismatch")
			buf.Reset()

			logger.Error("error message")
			errorLogged := strings.Contains(buf.String(), "error message")
			assert.Equal(t, tt.shouldLog["error"], errorLogged, "error level mismatch")
		})
	}
}

func TestLoggerWith(t *testing.T) {
	var buf bytes.Buffer
	logger := NewSlogLogger(
		WithOutput(&buf),
		WithFormat(FormatJSON), // Explicitly use JSON mode for predictable output
	)

	// Create a child logger with additional fields
	childLogger := logger.With(slog.String("request_id", "123"), slog.String("user", "test-user"))

	childLogger.Info("child logger message")

	output := buf.String()
	assert.Contains(t, output, `"request_id":"123"`)
	assert.Contains(t, output, `"user":"test-user"`)
	assert.Contains(t, output, "child logger message")
}

func TestStructuredLogging(t *testing.T) {
	var buf bytes.Buffer
	logger := NewSlogLogger(
		WithOutput(&buf),
		WithFormat(FormatJSON), // Explicitly use JSON mode for predictable output
	)

	logger.Info("structured log",
		slog.String("string", "value"),
		slog.Int("int", 42),
		slog.Float64("float", 3.14),
		slog.Bool("bool", true),
		slog.Any("nested", map[string]any{
			"key": "value",
		}),
	)

	// Parse the JSON output
	var logEntry map[string]any
	err := json.Unmarshal(buf.Bytes(), &logEntry)
	require.NoError(t, err)

	assert.Equal(t, "structured log", logEntry["msg"])
	assert.Equal(t, "value", logEntry["string"])
	assert.Equal(t, float64(42), logEntry["int"]) // JSON numbers are float64
	assert.Equal(t, 3.14, logEntry["float"])
	assert.Equal(t, true, logEntry["bool"])
}

func TestWithFormat(t *testing.T) {
	tests := []struct {
		name      string
		format    Format
		message   string
		checkJSON bool
	}{
		{
			name:      "explicit json format",
			format:    FormatJSON,
			message:   "test message",
			checkJSON: true,
		},
		{
			name:      "explicit text format",
			format:    FormatText,
			message:   "test message",
			checkJSON: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := NewSlogLogger(
				WithOutput(&buf),
				WithFormat(tt.format),
			)

			logger.Info(tt.message, slog.String("key", "value"))

			output := buf.String()
			require.NotEmpty(t, output)
			assert.Contains(t, output, tt.message)

			if tt.checkJSON {
				// JSON format should contain quotes around keys and values
				assert.Contains(t, output, `"msg":"test message"`)
				assert.Contains(t, output, `"key":"value"`)
			} else {
				// Text format should be more human-readable
				assert.Contains(t, output, "test message")
				assert.Contains(t, output, "key=value")
			}
		})
	}
}

func TestDefaultFormat(t *testing.T) {
	// Test that the default logger uses JSON format
	var buf bytes.Buffer
	logger := NewSlogLogger(
		WithOutput(&buf),
	)

	logger.Info("test message", slog.String("key", "value"))

	output := buf.String()
	require.NotEmpty(t, output)

	// Default should be JSON format
	assert.Contains(t, output, `"msg":"test message"`)
	assert.Contains(t, output, `"key":"value"`)
}

func TestFormatOverride(t *testing.T) {
	tests := []struct {
		name           string
		format         Format
		expectedFormat string
		description    string
	}{
		{
			name:           "explicit JSON mode",
			format:         FormatJSON,
			expectedFormat: "json",
			description:    "should use JSON format when explicitly set",
		},
		{
			name:           "explicit text mode",
			format:         FormatText,
			expectedFormat: "text",
			description:    "should use text format when explicitly set",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := NewSlogLogger(
				WithOutput(&buf),
				WithFormat(tt.format),
			)

			logger.Info("test message", slog.String("key", "value"))

			output := buf.String()
			require.NotEmpty(t, output)

			if tt.expectedFormat == "json" {
				assert.Contains(t, output, `"msg":"test message"`)
				assert.Contains(t, output, `"key":"value"`)
			} else {
				assert.Contains(t, output, "test message")
				assert.Contains(t, output, "key=value")
			}
		})
	}
}
