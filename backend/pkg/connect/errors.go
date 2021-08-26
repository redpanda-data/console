package connect

import "github.com/pkg/errors"

var (
	ErrKafkaConnectNotConfigured = errors.New("kafka connect not configured")
)
