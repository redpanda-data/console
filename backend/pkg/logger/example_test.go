// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package logger_test

import (
	"context"
	"log/slog"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/redpanda-data/console/backend/pkg/logger"
)

type contextKey string

// Example demonstrates basic usage of the logger package.
func Example() {
	// Create a simple logger
	log := logger.NewSlogLogger(
		logger.WithLevel(slog.LevelInfo),
	)

	ctx := context.Background()
	log.InfoContext(ctx, "application started", slog.String("version", "1.0.0"))
}

// Example_withPrometheus demonstrates using the logger with Prometheus metrics.
func Example_withPrometheus() {
	// Create a Prometheus registry
	registry := prometheus.NewRegistry()

	// Create logger with Prometheus metrics
	log := logger.NewSlogLogger(
		logger.WithLevel(slog.LevelInfo),
		logger.WithPrometheusRegistry(registry, "console"),
	)

	ctx := context.Background()
	log.InfoContext(ctx, "server started", slog.Int("port", 8080))
	log.ErrorContext(ctx, "connection failed", slog.String("err", "timeout"))

	// The Prometheus registry now contains metrics about log messages
}

// Example_withContext demonstrates context-aware logging using structured attributes.
func Example_withContext() {
	// Create logger
	log := logger.NewSlogLogger(
		logger.WithLevel(slog.LevelInfo),
	)

	// Create context and log with structured attributes
	ctx := context.Background()

	// Log message with context-related attributes
	log.InfoContext(ctx, "user action performed",
		slog.String("action", "update_profile"),
		slog.String("request_id", "req-123"),
		slog.String("user_id", "user-456"),
	)
}

// Example_enterprise demonstrates how to add custom handlers for enterprise features.
func Example_enterprise() {
	// Custom handler that adds authentication info
	authHandler := func(next slog.Handler) slog.Handler {
		return &customAuthHandler{next: next}
	}

	// Create logger with custom handler
	log := logger.NewSlogLogger(
		logger.WithLevel(slog.LevelInfo),
		logger.WithHandler(authHandler),
	)

	ctx := context.Background()

	log.InfoContext(ctx, "audit event",
		slog.String("resource", "topic"),
		slog.String("action", "created"),
		slog.String("org_id", "org-789"),
	)
}

// Example_structured demonstrates structured logging with various field types.
func Example_structured() {
	log := logger.NewSlogLogger()

	ctx := context.Background()

	// Log with various field types
	log.InfoContext(ctx, "processing complete",
		slog.Int("duration_ms", 250),
		slog.Int("items_processed", 1000),
		slog.Float64("success_rate", 0.98),
		slog.Any("metadata", map[string]any{
			"source":    "kafka",
			"partition": 3,
		}),
		slog.Any("tags", []string{"batch", "async"}),
	)
}

// Example_withDefaultAttrs demonstrates setting default attributes for all log entries.
func Example_withDefaultAttrs() {
	log := logger.NewSlogLogger(
		logger.WithDefaultAttrs(
			slog.String("service", "redpanda-console"),
			slog.String("environment", "production"),
			slog.String("region", "us-west-2"),
		),
	)

	ctx := context.Background()

	// These logs will all include the default fields
	log.InfoContext(ctx, "cache miss", slog.String("key", "user:123"))
	log.WarnContext(ctx, "slow query", slog.Int("duration_ms", 500))
}

// Example_withMode demonstrates different log modes.
func Example_withMode() {
	// JSON mode - structured output for production
	jsonLogger := logger.NewSlogLogger(
		logger.WithFormat(logger.FormatJSON),
		logger.WithLevel(slog.LevelInfo),
	)

	// Text mode - human-readable output for development
	textLogger := logger.NewSlogLogger(
		logger.WithFormat(logger.FormatText),
		logger.WithLevel(slog.LevelInfo),
	)

	// Auto mode - smart detection based on environment
	autoLogger := logger.NewSlogLogger(
		logger.WithLevel(slog.LevelInfo),
		// Default behavior auto-detects mode based on environment
	)

	ctx := context.Background()

	// JSON output: {"time":"...","level":"INFO","msg":"server started","port":8080}
	jsonLogger.InfoContext(ctx, "server started", slog.Int("port", 8080))

	// Text output: time=2023-01-01T12:00:00Z level=INFO msg="server started" port=8080
	textLogger.InfoContext(ctx, "server started", slog.Int("port", 8080))

	// Auto mode: JSON in production, text in development
	autoLogger.InfoContext(ctx, "server started", slog.Int("port", 8080))
}

// Example_productionConfiguration demonstrates a typical production setup.
func Example_productionConfiguration() {
	// Production logger: JSON mode, info level, with metrics
	registry := prometheus.NewRegistry()

	log := logger.NewSlogLogger(
		logger.WithFormat(logger.FormatJSON),
		logger.WithLevel(slog.LevelInfo),
		logger.WithPrometheusRegistry(registry, "console"),
		logger.WithDefaultAttrs(
			slog.String("service", "redpanda-console"),
			slog.String("version", "1.0.0"),
			slog.String("environment", "production"),
		),
	)

	log.Info("service started successfully")
	log.Error("connection failed", slog.String("err", "timeout"), slog.Int("retry_count", 3))
}

// Example_developmentConfiguration demonstrates a typical development setup.
func Example_developmentConfiguration() {
	// Development logger: text mode, debug level
	log := logger.NewSlogLogger(
		logger.WithFormat(logger.FormatText),
		logger.WithLevel(slog.LevelDebug),
		logger.WithDefaultAttrs(
			slog.String("service", "redpanda-console"),
			slog.String("version", "dev"),
		),
	)

	ctx := context.Background()
	log.DebugContext(ctx, "starting development server")
	log.InfoContext(ctx, "connected to local kafka", slog.String("brokers", "localhost:9092"))
	log.WarnContext(ctx, "using development configuration")
}

// Example_timestampFormats demonstrates different timestamp formatting options.
func Example_timestampFormats() {
	ctx := context.Background()

	// RFC3339 format (ISO 8601) - using standard time package constant
	rfc3339Logger := logger.NewSlogLogger(
		logger.WithFormat(logger.FormatJSON),
		logger.WithTimestampFormat(time.RFC3339),
	)
	rfc3339Logger.InfoContext(ctx, "Using RFC3339 format", slog.String("service", "api"))

	// Human-readable datetime format - using standard time package constant
	dateTimeLogger := logger.NewSlogLogger(
		logger.WithFormat(logger.FormatJSON),
		logger.WithTimestampFormat(time.DateTime),
	)
	dateTimeLogger.InfoContext(ctx, "Using datetime format", slog.String("service", "api"))

	// Custom format - date only
	customLogger := logger.NewSlogLogger(
		logger.WithFormat(logger.FormatJSON),
		logger.WithTimestampFormat("2006-01-02"),
	)
	customLogger.InfoContext(ctx, "Using custom format", slog.String("service", "api"))

	// Output (approximate):
	// {"time":"2023-12-25T14:30:45Z","level":"INFO","msg":"Using RFC3339 format","service":"api"}
	// {"time":"2023-12-25 14:30:45","level":"INFO","msg":"Using datetime format","service":"api"}
	// {"time":"2023-12-25","level":"INFO","msg":"Using custom format","service":"api"}
}

// customAuthHandler is an example of a custom handler for enterprise features
type customAuthHandler struct {
	next slog.Handler
}

func (h *customAuthHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.next.Enabled(ctx, level)
}

func (h *customAuthHandler) Handle(ctx context.Context, record slog.Record) error {
	// Extract auth info from context and add to record
	if authInfo := ctx.Value(contextKey("auth_info")); authInfo != nil {
		record.AddAttrs(slog.Any("auth", authInfo))
	}
	return h.next.Handle(ctx, record)
}

func (h *customAuthHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &customAuthHandler{next: h.next.WithAttrs(attrs)}
}

func (h *customAuthHandler) WithGroup(name string) slog.Handler {
	return &customAuthHandler{next: h.next.WithGroup(name)}
}
