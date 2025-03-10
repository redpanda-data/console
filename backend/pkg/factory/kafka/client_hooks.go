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
	"net"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
)

var ( // interface checks to ensure we implement the hooks properly
	_ kgo.HookBrokerConnect    = (*clientHooks)(nil)
	_ kgo.HookBrokerDisconnect = (*clientHooks)(nil)
	_ kgo.HookBrokerWrite      = (*clientHooks)(nil)
	_ kgo.HookBrokerRead       = (*clientHooks)(nil)
)

// clientHooks implements the various hook interfaces from the franz-go (kafka) library. We can use these hooks to
// log additional information, collect Prometheus metrics and similar.
type clientHooks struct {
	logger *zap.Logger

	requestSentCount prometheus.Counter
	bytesSent        prometheus.Counter

	requestsReceivedCount prometheus.Counter
	bytesReceived         prometheus.Counter
}

var (
	// We may need to initialize client hooks with different
	// loggers multiple times, but we can only register the same
	// Prometheus metrics in the default registry once. Therefore,
	// we store these metrics at the package level and initialize
	// them only once.
	promInitOnce         sync.Once
	promRequestSent      prometheus.Counter
	promBytesSent        prometheus.Counter
	promRequestsReceived prometheus.Counter
	promBytesReceived    prometheus.Counter
)

func newClientHooks(logger *zap.Logger, metricsNamespace string) *clientHooks {
	promInitOnce.Do(func() {
		promRequestSent = promauto.NewCounter(prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: "kafka",
			Name:      "requests_sent_total",
		})
		promBytesSent = promauto.NewCounter(prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: "kafka",
			Name:      "sent_bytes",
		})

		promRequestsReceived = promauto.NewCounter(prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: "kafka",
			Name:      "requests_received_total",
		})
		promBytesReceived = promauto.NewCounter(prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: "kafka",
			Name:      "received_bytes",
		})
	})

	return &clientHooks{
		logger: logger,

		requestSentCount: promRequestSent,
		bytesSent:        promBytesSent,

		requestsReceivedCount: promRequestsReceived,
		bytesReceived:         promBytesReceived,
	}
}

// OnBrokerConnect is called when the client connects to any node of the target
// Kafka cluster.
func (c clientHooks) OnBrokerConnect(meta kgo.BrokerMetadata, dialDur time.Duration, _ net.Conn, err error) {
	if err != nil {
		c.logger.Debug("kafka connection failed", zap.String("broker_host", meta.Host), zap.Error(err))
		return
	}
	c.logger.Debug("kafka connection succeeded",
		zap.String("host", meta.Host),
		zap.Duration("dial_duration", dialDur))
}

// OnBrokerDisconnect is called when the client disconnects from any node of the target
// Kafka cluster.
func (c clientHooks) OnBrokerDisconnect(meta kgo.BrokerMetadata, _ net.Conn) {
	c.logger.Debug("kafka broker disconnected",
		zap.String("host", meta.Host))
}

// OnBrokerRead is passed the broker metadata, the key for the response that
// was read, the number of bytes read, how long the client waited
// before reading the response, how long it took to read the response,
// and any error.
//
// The bytes written does not count any tls overhead.
// OnRead is called after a read from a broker.
func (c clientHooks) OnBrokerRead(_ kgo.BrokerMetadata, _ int16, bytesRead int, _, _ time.Duration, _ error) {
	c.requestsReceivedCount.Inc()
	c.bytesReceived.Add(float64(bytesRead))
}

// OnBrokerWrite is passed the broker metadata, the key for the request that
// was written, the number of bytes written, how long the request
// waited before being written, how long it took to write the request,
// and any error.
//
// The bytes written does not count any tls overhead.
// OnWrite is called after a write to a broker.
func (c clientHooks) OnBrokerWrite(_ kgo.BrokerMetadata, _ int16, bytesWritten int, _, _ time.Duration, _ error) {
	c.requestSentCount.Inc()
	c.bytesSent.Add(float64(bytesWritten))
}
