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
	"log/slog"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPrometheusHandler(t *testing.T) {
	// Create a new registry for testing
	reg := prometheus.NewRegistry()

	var buf bytes.Buffer
	logger := NewSlogLogger(
		WithOutput(&buf),
		WithLevel(slog.LevelDebug),
		WithPrometheusRegistry(reg, "test"),
	)

	// Log messages at different levels
	logger.Debug("debug message")
	logger.Debug("another debug")
	logger.Info("info message")
	logger.Warn("warn message")
	logger.Error("error message")
	logger.Error("another error")
	logger.Error("yet another error")

	// Gather metrics
	metrics, err := reg.Gather()
	require.NoError(t, err)

	// Find our metric
	var logMetric *dto.MetricFamily
	for _, m := range metrics {
		if m.GetName() == "test_log_messages_total" {
			logMetric = m
			break
		}
	}
	require.NotNil(t, logMetric, "test_log_messages_total metric not found")

	// Check metric type and help
	assert.Equal(t, dto.MetricType_COUNTER, *logMetric.Type)
	assert.Equal(t, "Total number of log messages, labeled by level.", *logMetric.Help)

	// Check counters
	counters := make(map[string]float64)
	for _, m := range logMetric.Metric {
		for _, l := range m.Label {
			if *l.Name == "level" {
				counters[*l.Value] = *m.Counter.Value
			}
		}
	}

	// Verify counts
	assert.Equal(t, float64(2), counters["DEBUG"], "debug count mismatch")
	assert.Equal(t, float64(1), counters["INFO"], "info count mismatch")
	assert.Equal(t, float64(1), counters["WARN"], "warn count mismatch")
	assert.Equal(t, float64(3), counters["ERROR"], "error count mismatch")
}

func TestPrometheusHandlerInitialization(t *testing.T) {
	// Create a new registry
	reg := prometheus.NewRegistry()

	// Create logger with Prometheus handler
	var buf bytes.Buffer
	_ = NewSlogLogger(
		WithOutput(&buf),
		WithPrometheusRegistry(reg, "test"),
	)

	// Check that all counters are initialized to 0
	expectedMetrics := `
# HELP test_log_messages_total Total number of log messages, labeled by level.
# TYPE test_log_messages_total counter
test_log_messages_total{level="DEBUG"} 0
test_log_messages_total{level="ERROR"} 0
test_log_messages_total{level="INFO"} 0
test_log_messages_total{level="WARN"} 0
`

	err := testutil.GatherAndCompare(reg, bytes.NewBufferString(expectedMetrics), "test_log_messages_total")
	assert.NoError(t, err)
}

func TestPrometheusHandlerWithGroups(t *testing.T) {
	// Create a new registry
	reg := prometheus.NewRegistry()

	var buf bytes.Buffer
	logger := NewSlogLogger(
		WithOutput(&buf),
		WithPrometheusRegistry(reg, "test"),
	)

	// Create a logger with groups
	groupedLogger := logger.WithGroup("request").With(slog.String("id", "123"))

	ctx := context.Background()
	groupedLogger.InfoContext(ctx, "grouped message")

	// The Prometheus handler should still count the message
	metrics, err := reg.Gather()
	require.NoError(t, err)

	var logMetric *dto.MetricFamily
	for _, m := range metrics {
		if m.GetName() == "test_log_messages_total" {
			logMetric = m
			break
		}
	}
	require.NotNil(t, logMetric)

	// Find info counter
	var infoCount float64
	for _, m := range logMetric.Metric {
		for _, l := range m.Label {
			if *l.Name == "level" && *l.Value == "INFO" {
				infoCount = *m.Counter.Value
			}
		}
	}

	assert.Equal(t, float64(1), infoCount)
}

func TestPrometheusHandlerRegistrationSafety(t *testing.T) {
	// Test that registering the same metric twice doesn't panic
	reg := prometheus.NewRegistry()

	// First logger
	_ = NewSlogLogger(
		WithPrometheusRegistry(reg, "test"),
	)

	// Second logger with the same registry
	// This should not panic due to AlreadyRegisteredError being handled gracefully
	assert.NotPanics(t, func() {
		_ = NewSlogLogger(
			WithPrometheusRegistry(reg, "test"),
		)
	})
}
