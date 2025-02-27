// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"flag"
	"fmt"
	"strings"

	"go.uber.org/zap"
)

// Logging config for a zap logger
type Logging struct {
	LogLevelInput string `yaml:"level"`
	LogLevel      zap.AtomicLevel
}

// RegisterFlags adds the flags required to config the server
func (l *Logging) RegisterFlags(f *flag.FlagSet) {
	l.Set("info")
	f.Var(l, "logging.level", "Only log messages with the given severity or above. Valid levels: [debug, info, warn, error]")
}

// String implements the flag.Value interface
func (l *Logging) String() string {
	return l.LogLevelInput
}

// Set updates the value of the allowed log level by implementing the flag.Value interface
func (l *Logging) Set(logLevel string) error {
	switch strings.ToLower(logLevel) {
	case "", "info":
		l.LogLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
	case "debug":
		l.LogLevel = zap.NewAtomicLevelAt(zap.DebugLevel)
	case "warn":
		l.LogLevel = zap.NewAtomicLevelAt(zap.WarnLevel)
	case "error":
		l.LogLevel = zap.NewAtomicLevelAt(zap.ErrorLevel)
	case "panic":
		l.LogLevel = zap.NewAtomicLevelAt(zap.PanicLevel)
	case "fatal":
		l.LogLevel = zap.NewAtomicLevelAt(zap.FatalLevel)
	default:
		fmt.Printf("Invalid log level supplied: '%s'. Defaulting to info.", logLevel)
		l.LogLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
	}
	l.LogLevelInput = logLevel

	return nil
}

// SetDefaults for logging config.
func (l *Logging) SetDefaults() {
	l.LogLevelInput = "info"
	l.LogLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
}
