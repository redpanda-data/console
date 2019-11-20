package logging

import (
	"flag"
	"fmt"
	"strings"

	"go.uber.org/zap"
)

// Config for a zap logger
type Config struct {
	LogLevelInput   string
	LogLevel        zap.AtomicLevel
	PrintAccessLogs bool
}

// RegisterFlags adds the flags required to config the server
func (cfg *Config) RegisterFlags(f *flag.FlagSet) {
	cfg.Set("info")
	f.Var(cfg, "logging.level", "Only log messages with the given severity or above. Valid levels: [debug, info, warn, error]")
	f.BoolVar(&cfg.PrintAccessLogs, "logging.print-access-logs", false, "Whether or not to print access log for each HTTP invocation")
}

// String implements the flag.Value interface
func (cfg *Config) String() string {
	return cfg.LogLevelInput
}

// Set updates the value of the allowed log level by implementing the flag.Value interface
func (cfg *Config) Set(logLevel string) error {
	switch strings.ToLower(logLevel) {
	case "", "info":
		cfg.LogLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
	case "debug":
		cfg.LogLevel = zap.NewAtomicLevelAt(zap.DebugLevel)
	case "warn":
		cfg.LogLevel = zap.NewAtomicLevelAt(zap.WarnLevel)
	case "error":
		cfg.LogLevel = zap.NewAtomicLevelAt(zap.ErrorLevel)
	case "panic":
		cfg.LogLevel = zap.NewAtomicLevelAt(zap.PanicLevel)
	case "fatal":
		cfg.LogLevel = zap.NewAtomicLevelAt(zap.FatalLevel)
	default:
		fmt.Printf("Invalid log level supplied: '%s'. Defaulting to info.", logLevel)
		cfg.LogLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
	}
	cfg.LogLevelInput = logLevel

	return nil
}
