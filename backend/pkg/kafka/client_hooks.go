package kafka

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
	"net"
	"time"
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

func newClientHooks(logger *zap.Logger, metricsNamespace string) *clientHooks {
	requestSentCount := promauto.NewCounter(prometheus.CounterOpts{
		Namespace: metricsNamespace,
		Subsystem: "kafka",
		Name:      "requests_sent_total"})
	bytesSent := promauto.NewCounter(prometheus.CounterOpts{
		Namespace: metricsNamespace,
		Subsystem: "kafka",
		Name:      "sent_bytes",
	})

	requestsReceivedCount := promauto.NewCounter(prometheus.CounterOpts{
		Namespace: metricsNamespace,
		Subsystem: "kafka",
		Name:      "requests_received_total"})
	bytesReceived := promauto.NewCounter(prometheus.CounterOpts{
		Namespace: metricsNamespace,
		Subsystem: "kafka",
		Name:      "received_bytes",
	})

	return &clientHooks{
		logger: logger,

		requestSentCount: requestSentCount,
		bytesSent:        bytesSent,

		requestsReceivedCount: requestsReceivedCount,
		bytesReceived:         bytesReceived,
	}
}

func (c clientHooks) OnConnect(meta kgo.BrokerMetadata, dialDur time.Duration, _ net.Conn, err error) {
	if err != nil {
		c.logger.Debug("kafka connection failed", zap.String("broker_host", meta.Host), zap.Error(err))
		return
	}
	c.logger.Debug("kafka connection succeeded",
		zap.String("host", meta.Host),
		zap.Duration("dial_duration", dialDur))
}

func (c clientHooks) OnDisconnect(meta kgo.BrokerMetadata, _ net.Conn) {
	c.logger.Debug("kafka broker disconnected",
		zap.String("host", meta.Host))
}

// OnRead is passed the broker metadata, the key for the response that
// was read, the number of bytes read, how long the client waited
// before reading the response, how long it took to read the response,
// and any error.
//
// The bytes written does not count any tls overhead.
// OnRead is called after a read from a broker.
func (c clientHooks) OnRead(_ kgo.BrokerMetadata, _ int16, bytesRead int, _, _ time.Duration, _ error) {
	c.requestsReceivedCount.Inc()
	c.bytesReceived.Add(float64(bytesRead))
}

// OnWrite is passed the broker metadata, the key for the request that
// was written, the number of bytes written, how long the request
// waited before being written, how long it took to write the request,
// and any error.
//
// The bytes written does not count any tls overhead.
// OnWrite is called after a write to a broker.
func (c clientHooks) OnWrite(_ kgo.BrokerMetadata, _ int16, bytesWritten int, _, _ time.Duration, _ error) {
	c.requestSentCount.Inc()
	c.bytesSent.Add(float64(bytesWritten))
}
