//go:build integration

package console

import (
	"context"
	"net"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func Test_GetClusterInfo(t *testing.T) {
	ctx := context.Background()
	log, err := zap.NewProduction()
	assert.NoError(t, err)

	cfg := config.Config{}
	cfg.SetDefaults()

	cfg.MetricsNamespace = metricNameForTest("get_cluster_info")
	cfg.Kafka.Brokers = []string{testSeedBroker}

	kafkaSvc, err := kafka.NewService(&cfg, log, cfg.MetricsNamespace)
	assert.NoError(t, err)

	svc, err := NewService(cfg.Console, log, kafkaSvc, nil, nil)
	assert.NoError(t, err)

	defer svc.kafkaSvc.KafkaClient.Close()

	info, err := svc.GetClusterInfo(ctx)
	assert.NoError(t, err)
	assert.NotNil(t, info)

	assert.Equal(t, "unknown custom version at least v0.10.2", info.KafkaVersion)
	assert.Len(t, info.Brokers, 1)
	assert.NotEmpty(t, info.Brokers[0])

	expectedAddr, expectedPort, err := net.SplitHostPort(testSeedBroker)
	assert.NoError(t, err)

	actualAddr, actualPort, err := net.SplitHostPort(testSeedBroker)
	assert.NoError(t, err)

	assert.Equal(t, expectedAddr, actualAddr)
	assert.Equal(t, expectedPort, actualPort)
}
