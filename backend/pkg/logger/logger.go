// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package logger provides a structured logging interface based on Go's slog package.
// It supports Prometheus metrics integration, context-aware logging, and extensibility
// through custom handlers.
package logger

import (
	"io"
	"log/slog"
	"os"
	"time"
)

// NewSlogLogger creates a new slog.Logger with the provided options.
// This function configures handlers, output, level, and other settings,
// then returns a standard slog.Logger ready for use.
//
// Options are applied in the order provided; later options override earlier ones.
// For example, WithLevel(slog.LevelDebug) followed by WithLevel(slog.LevelInfo)
// will result in a logger with Info level.
func NewSlogLogger(opts ...Option) *slog.Logger {
	cfg := &config{
		level:      slog.LevelInfo,
		output:     os.Stdout,
		attributes: []slog.Attr{},
		format:     FormatJSON,
	}

	for _, opt := range opts {
		opt(cfg)
	}

	// Create the appropriate handler based on format configuration
	handler := createHandler(cfg)

	// Build handler chain - handlers run in the order they were added
	// Apply handlers in reverse order so the first added handler is the outermost
	for i := len(cfg.handlers) - 1; i >= 0; i-- {
		handler = cfg.handlers[i](handler)
	}

	// Add default attributes if any
	if len(cfg.attributes) > 0 {
		handler = handler.WithAttrs(cfg.attributes)
	}

	return slog.New(handler)
}

// Format represents the logging output format.
type Format int8

const (
	// FormatJSON outputs structured JSON logs, ideal for production environments
	FormatJSON Format = iota
	// FormatText outputs human-readable text logs, ideal for development
	FormatText
)

// HandlerFunc is a function that wraps a slog.Handler to add functionality.
// Handlers are applied in the order they are added, so the first handler
// added will be the first to process log records.
//
// This follows the middleware pattern commonly used in Go (similar to HTTP middleware).
// Each HandlerFunc receives the next handler in the chain and returns a new handler
// that can modify the behavior before/after calling the next handler.
type HandlerFunc func(slog.Handler) slog.Handler

// config holds the configuration for creating a new logger.
type config struct {
	level           slog.Level
	output          io.Writer
	handlers        []HandlerFunc
	attributes      []slog.Attr
	format          Format
	timestampFormat string // empty means default slog format
}

// createHandler creates the appropriate slog.Handler based on the configuration.
func createHandler(cfg *config) slog.Handler {
	handlerOpts := &slog.HandlerOptions{
		Level: cfg.level,
	}

	// If custom timestamp format is specified, use ReplaceAttr to customize the time field
	if cfg.timestampFormat != "" {
		handlerOpts.ReplaceAttr = func(_ []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				return formatTimestamp(a, cfg.timestampFormat)
			}
			return a
		}
	}

	// Create handler based on format
	switch cfg.format {
	case FormatText:
		return slog.NewTextHandler(cfg.output, handlerOpts)
	case FormatJSON:
		return slog.NewJSONHandler(cfg.output, handlerOpts)
	default:
		return slog.NewJSONHandler(cfg.output, handlerOpts)
	}
}

// formatTimestamp formats a time attribute according to the specified format.
func formatTimestamp(attr slog.Attr, format string) slog.Attr {
	t, ok := attr.Value.Any().(time.Time)
	if !ok {
		return attr // Return original if not a time
	}

	// Use the format as a time layout string
	return slog.String(slog.TimeKey, t.Format(format))
}

// FatalStartup logs a fatal startup message and exits. This is used for
// exiting the program before anything could be loaded successfully: we do
// not know how the logger should yet be configured, so we assume production
// defaults and exit.
func FatalStartup(msg string, args ...any) {
	logger := NewSlogLogger(
		WithFormat(FormatJSON),
		WithLevel(slog.LevelInfo),
		WithTimestampFormat(time.RFC3339),
	)
	logger.Error(msg, args...)
	os.Exit(1) //nolint:revive // Fatal functions are intended to exit
}

// Fatal logs at error level using the provided slog.Logger and exits.
// Use this for unrecoverable runtime errors when you already have a logger instance.
func Fatal(logger *slog.Logger, msg string, args ...any) {
	logger.Error(msg, args...)
	os.Exit(1) //nolint:revive // Fatal functions are intended to exit
}

// Named creates a new logger with a "logger" attribute.
// This is the slog equivalent of zap's logger.Named() and maintains
// compatibility with the previous key name standard.
func Named(logger *slog.Logger, name string) *slog.Logger {
	return logger.With(slog.String("logger", name))
}
