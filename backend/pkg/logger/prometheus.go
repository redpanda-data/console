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
	"context"
	"errors"
	"log/slog"

	"github.com/prometheus/client_golang/prometheus"
)

// PrometheusHandler wraps another slog.Handler and counts log messages by level.
type PrometheusHandler struct {
	slog.Handler
	messageCounterVec *prometheus.CounterVec
}

// Ensure PrometheusHandler implements slog.Handler at compile time
var _ slog.Handler = (*PrometheusHandler)(nil)

// NewPrometheusHandler creates a handler that emits Prometheus metrics for log messages.
// It pre-initializes counters for all log levels to ensure they start at 0.
func NewPrometheusHandler(reg prometheus.Registerer, metricsNamespace string) HandlerFunc {
	return func(next slog.Handler) slog.Handler {
		messageCounterVec := prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Name:      "log_messages_total",
			Help:      "Total number of log messages, labeled by level.",
		}, []string{"level"})

		// Register the counter vector safely
		if err := reg.Register(messageCounterVec); err != nil {
			var alreadyRegisteredError prometheus.AlreadyRegisteredError
			if !errors.As(err, &alreadyRegisteredError) {
				// Log unexpected registration errors for debugging
				// Use slog.Default() to respect any global slog configuration
				slog.Default().Warn("logger: failed to register prometheus metrics", slog.Any("error", err))
			}
		}

		// Pre-initialize counters for all supported log levels so that they expose 0 for each level on startup
		supportedLevels := []slog.Level{
			slog.LevelDebug,
			slog.LevelInfo,
			slog.LevelWarn,
			slog.LevelError,
		}
		for _, level := range supportedLevels {
			messageCounterVec.WithLabelValues(level.String()).Add(0)
		}

		return &PrometheusHandler{
			Handler:           next,
			messageCounterVec: messageCounterVec,
		}
	}
}

// Handle increments the appropriate counter and passes the record to the next handler.
func (h *PrometheusHandler) Handle(ctx context.Context, record slog.Record) error {
	// Increment the counter for this log level
	h.messageCounterVec.WithLabelValues(record.Level.String()).Inc()

	// Pass the record to the next handler in the chain
	return h.Handler.Handle(ctx, record)
}

// Enabled delegates to the wrapped handler.
func (h *PrometheusHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.Handler.Enabled(ctx, level)
}

// WithAttrs returns a new PrometheusHandler that includes the given attributes.
// This ensures the Prometheus counting is preserved when attributes are added.
func (h *PrometheusHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &PrometheusHandler{
		Handler:           h.Handler.WithAttrs(attrs),
		messageCounterVec: h.messageCounterVec, // keep the same counter
	}
}

// WithGroup returns a new PrometheusHandler that includes the given group.
// This ensures the Prometheus counting is preserved when groups are added.
func (h *PrometheusHandler) WithGroup(name string) slog.Handler {
	return &PrometheusHandler{
		Handler:           h.Handler.WithGroup(name),
		messageCounterVec: h.messageCounterVec, // keep the same counter
	}
}
