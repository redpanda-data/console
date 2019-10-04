package main

import (
	"fmt"

	log "github.com/InVisionApp/go-logger"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type shim struct {
	logger *zap.Logger
}

// GoLoggerShim creates a new shim that presents the given zap.Logger as a go-logger
func newZapShim(logger *zap.Logger) log.Logger {
	return &shim{logger: logger}
}

func (s *shim) Debug(msg ...interface{}) {
	s.logger.Debug(fmt.Sprint(msg...))
}

func (s *shim) Info(msg ...interface{}) {
	s.logger.Info(fmt.Sprint(msg...))
}

func (s *shim) Warn(msg ...interface{}) {
	s.logger.Warn(fmt.Sprint(msg...))
}

func (s *shim) Error(msg ...interface{}) {
	s.logger.Error(fmt.Sprint(msg...))
}

func (s *shim) Debugln(msg ...interface{}) {
	s.logger.Debug(fmt.Sprint(msg...))
}

func (s *shim) Infoln(msg ...interface{}) {
	s.logger.Info(fmt.Sprint(msg...))
}

func (s *shim) Warnln(msg ...interface{}) {
	s.logger.Warn(fmt.Sprint(msg...))
}

func (s *shim) Errorln(msg ...interface{}) {
	s.logger.Error(fmt.Sprint(msg...))
}

func (s *shim) Debugf(format string, args ...interface{}) {
	s.logger.Debug(fmt.Sprintf(format, args...))
}

func (s *shim) Infof(format string, args ...interface{}) {
	s.logger.Info(fmt.Sprintf(format, args...))
}

func (s *shim) Warnf(format string, args ...interface{}) {
	s.logger.Warn(fmt.Sprintf(format, args...))
}

func (s *shim) Errorf(format string, args ...interface{}) {
	s.logger.Error(fmt.Sprintf(format, args...))
}

func (s *shim) WithFields(fields log.Fields) log.Logger {
	var zapFields []zapcore.Field

	for key, value := range fields {
		zf := zap.Any(key, value)
		zapFields = append(zapFields, zf)
	}

	return &shim{
		logger: s.logger.With(zapFields...),
	}
}
