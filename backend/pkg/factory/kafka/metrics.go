// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"sync"

	"github.com/prometheus/client_golang/prometheus"
)

// FactoryMetrics holds all Kafka client factory metrics
type FactoryMetrics struct {
	ActiveClientsGauge    prometheus.Gauge
	ClientsCreatedCounter prometheus.Counter
	ClientsClosedCounter  prometheus.Counter
}

var (
	factoryMetricsRegistry = make(map[string]*FactoryMetrics)
	factoryMetricsMu       sync.RWMutex
)

// NewFactoryMetrics creates and registers factory metrics for client tracking
// The provided factoryType is added a const label to all emitted metrics.
func NewFactoryMetrics(metricsNamespace string, factoryType string, registry prometheus.Registerer) *FactoryMetrics {
	factoryMetricsMu.Lock()
	defer factoryMetricsMu.Unlock()

	if metrics, exists := factoryMetricsRegistry[factoryType]; exists {
		return metrics
	}

	metrics := &FactoryMetrics{
		ActiveClientsGauge: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: metricsNamespace,
			Subsystem: "kafka_client",
			Name:      "active_total",
			Help:      "Number of active Kafka clients in factory",
			ConstLabels: prometheus.Labels{
				"client_type": factoryType,
			},
		}),
		ClientsCreatedCounter: prometheus.NewCounter(prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: "kafka_client",
			Name:      "created_total",
			Help:      "Total number of Kafka clients created in factory",
			ConstLabels: prometheus.Labels{
				"client_type": factoryType,
			},
		}),
		ClientsClosedCounter: prometheus.NewCounter(prometheus.CounterOpts{
			Namespace: metricsNamespace,
			Subsystem: "kafka_client",
			Name:      "closed_total",
			Help:      "Total number of Kafka clients closed in factory",
			ConstLabels: prometheus.Labels{
				"client_type": factoryType,
			},
		}),
	}

	registry.MustRegister(
		metrics.ActiveClientsGauge,
		metrics.ClientsCreatedCounter,
		metrics.ClientsClosedCounter,
	)

	factoryMetricsRegistry[factoryType] = metrics
	return metrics
}

// IncrementActiveClients increments the active clients counter
func (m *FactoryMetrics) IncrementActiveClients() {
	m.ActiveClientsGauge.Inc()
	m.ClientsCreatedCounter.Inc()
}

// DecrementActiveClients decrements the active clients counter
func (m *FactoryMetrics) DecrementActiveClients() {
	m.ActiveClientsGauge.Dec()
	m.ClientsClosedCounter.Inc()
}
