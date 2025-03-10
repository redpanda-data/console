// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package logging

import "go.uber.org/zap/zapcore"

// FilterLevel wraps an existing zap.Core but logs at a different level.
// This function can be used to create child loggers which should print
// only log levels at a different log level than the parent logger.
func FilterLevel(level zapcore.Level) func(zapcore.Core) zapcore.Core {
	return func(c zapcore.Core) zapcore.Core {
		return newLevelFilterCore(c, level)
	}
}

// levelFilterCore allows to change the log level on the fly. This must remain here until
// https://github.com/uber-go/zap/pull/775 is merged and released
type levelFilterCore struct {
	zapcore.Core
	level zapcore.Level
}

func newLevelFilterCore(core zapcore.Core, level zapcore.Level) zapcore.Core {
	return &levelFilterCore{core, level}
}

// Enabled checks if the lvl is to be printed
func (c *levelFilterCore) Enabled(lvl zapcore.Level) bool {
	return lvl >= c.level
}

// Check determines whether the supplied Entry should be logged
func (c *levelFilterCore) Check(ent zapcore.Entry, ce *zapcore.CheckedEntry) *zapcore.CheckedEntry {
	if !c.Enabled(ent.Level) {
		return ce
	}

	return c.Core.Check(ent, ce)
}
