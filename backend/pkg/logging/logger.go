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
	"os"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/redpanda-data/console/backend/pkg/config"
)

var (
	zapCore      zapcore.Core
	initCoreOnce sync.Once
)

// NewLogger creates a preconfigured global logger and configures the global zap logger
func NewLogger(cfg *config.Logging, metricsNamespace string) *zap.Logger {
	core := getZapCore(cfg.LogLevel, metricsNamespace)
	logger := zap.New(core)
	zap.ReplaceGlobals(logger)

	if zapCore == nil {
		setZapCore(core)
	}

	return logger
}

// prometheusHook is a hook for the zap library which exposes Prometheus counters for various log levels.
func prometheusHook(metricsNamespace string) func(zapcore.Entry) error {
	messageCounterVec := promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricsNamespace,
		Name:      "log_messages_total",
		Help:      "Total number of log messages.",
	}, []string{"level"})

	// Pre-initialize counters for all supported log levels so that they expose 0 for each level on startup
	supportedLevels := []zapcore.Level{
		zapcore.DebugLevel,
		zapcore.InfoLevel,
		zapcore.WarnLevel,
		zapcore.ErrorLevel,
		// Panic and Fatal are pointless since they would always report 0
	}
	for _, level := range supportedLevels {
		messageCounterVec.WithLabelValues(level.String())
	}

	return func(entry zapcore.Entry) error {
		messageCounterVec.WithLabelValues(entry.Level.String()).Inc()
		return nil
	}
}

// setZapCore sets the zap core config with hooks.
// This ensures that they are available as fallbacks when a logger is
// not found on the context.
func setZapCore(core zapcore.Core) {
	initCoreOnce.Do(func() {
		zapCore = core
	})
}

// getZapCore retrieves the initialized zapcore config or creates a new zapcore
// config using your provided log level and metrics namespace.
func getZapCore(logLevel zap.AtomicLevel, metricsNamespace string) zapcore.Core {
	if zapCore != nil {
		return zapCore
	}

	encoderCfg := zap.NewProductionEncoderConfig()
	encoderCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	encoderCfg.EncodeDuration = zapcore.StringDurationEncoder
	core := zapcore.NewCore(
		zapcore.NewJSONEncoder(encoderCfg),
		zapcore.Lock(os.Stdout),
		logLevel,
	)
	core = zapcore.RegisterHooks(core, prometheusHook(metricsNamespace))

	return core
}
