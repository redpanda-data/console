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

	"go.uber.org/zap"
)

type loggerKey struct{}

// ContextWithLogger returns a new context containing the provided logger.
func ContextWithLogger(ctx context.Context, logger *zap.Logger) context.Context {
	return context.WithValue(ctx, loggerKey{}, logger)
}

// FromContext retrieves the logger stored in the context (if any). If none is
// found, returns a new zap logger that uses the default config.
func FromContext(ctx context.Context) *zap.Logger {
	l, ok := ctx.Value(loggerKey{}).(*zap.Logger)
	if ok && l != nil {
		return l
	}

	// Use pre-initialized (or default) zapcore config.
	core := getZapCore(zap.NewAtomicLevelAt(zap.InfoLevel), "console")

	return zap.New(core)
}
