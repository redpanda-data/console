package kafka

import (
	"time"

	prometheusmetrics "github.com/deathowl/go-metrics-prometheus"
	"github.com/prometheus/client_golang/prometheus"
)

// RegisterMetrics periodically updates all sarama/client Kafka metrics and exposes them
// on the default prometheus registry.
func (s *Service) RegisterMetrics() {
	pClient := prometheusmetrics.NewPrometheusProvider(
		s.Client.Config().MetricRegistry,
		s.MetricsNamespace,
		"sarama",
		prometheus.DefaultRegisterer,
		5*time.Second)
	go pClient.UpdatePrometheusMetrics()
}
