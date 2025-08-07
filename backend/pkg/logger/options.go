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
	"io"
	"log/slog"

	"github.com/prometheus/client_golang/prometheus"
)

// Option is a function that configures a logger.
type Option func(*config)

// WithLevel sets the minimum log level using slog.Level directly.
// This provides type safety and avoids string parsing.
func WithLevel(level slog.Level) Option {
	return func(c *config) {
		c.level = level
	}
}

// WithOutput sets the output writer for the logger.
// Common use cases:
//   - Testing: WithOutput(&bytes.Buffer{}) to capture logs
//   - File logging: WithOutput(file) to write to a file
//   - Custom writers: WithOutput(customWriter) for external systems
func WithOutput(w io.Writer) Option {
	return func(c *config) {
		c.output = w
	}
}

// WithPrometheusRegistry configures the logger to emit metrics to the provided registry.
func WithPrometheusRegistry(reg prometheus.Registerer, metricsNamespace string) Option {
	return func(c *config) {
		// Create and add the Prometheus handler
		promHandler := NewPrometheusHandler(reg, metricsNamespace)
		c.handlers = append(c.handlers, promHandler)
	}
}

// WithHandler adds a custom handler to the handler chain.
// Handlers are applied in the order they are added.
func WithHandler(handler HandlerFunc) Option {
	return func(c *config) {
		c.handlers = append(c.handlers, handler)
	}
}

// WithDefaultAttrs sets default attributes that will be included in all log entries.
func WithDefaultAttrs(attrs ...slog.Attr) Option {
	return func(c *config) {
		c.attributes = append(c.attributes, attrs...)
	}
}

// WithFormat sets the log output format.
// - FormatJSON: Structured JSON output
// - FormatText: Human-readable text format
func WithFormat(format Format) Option {
	return func(c *config) {
		c.format = format
	}
}

// WithTimestampFormat sets a custom timestamp format for log entries.
// Use Go's standard time package constants (time.RFC3339, time.DateTime, etc.)
// or provide a custom Go time layout string.
//
// Examples:
//   - WithTimestampFormat(time.RFC3339) - ISO 8601 format (recommended)
//   - WithTimestampFormat(time.DateTime) - Human-readable format
//   - WithTimestampFormat(time.RFC3339Nano) - ISO 8601 with nanoseconds
//   - WithTimestampFormat("2006-01-02 15:04:05.000") - Custom with milliseconds
//   - WithTimestampFormat("2006-01-02") - Custom date-only format
func WithTimestampFormat(format string) Option {
	return func(c *config) {
		c.timestampFormat = format
	}
}
