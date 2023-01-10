// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

// KgoZapLogger is a franz-go logger adapter for zap.
type KgoZapLogger struct {
	logger *zap.SugaredLogger
}

// Level Implements kgo.Logger interface. It returns the log level to log at.
// We pin this to debug as the zap logger decides what to actually send to the output stream.
func (k KgoZapLogger) Level() kgo.LogLevel {
	return kgo.LogLevelDebug
}

// Log implements kgo.Logger interface
func (k KgoZapLogger) Log(level kgo.LogLevel, msg string, keyvals ...interface{}) {
	switch level {
	case kgo.LogLevelDebug:
		k.logger.Debugw(msg, keyvals...)
	case kgo.LogLevelInfo:
		k.logger.Infow(msg, keyvals...)
	case kgo.LogLevelWarn:
		k.logger.Warnw(msg, keyvals...)
	case kgo.LogLevelError:
		k.logger.Errorw(msg, keyvals...)
	}
}
