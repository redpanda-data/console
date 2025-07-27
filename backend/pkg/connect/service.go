// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import (
	"context"
	"crypto/tls"
	"log/slog"
	"sync"
	"sync/atomic"

	con "github.com/cloudhut/connect-client"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/connector/interceptor"
)

// Service provides the API for interacting with all configured Kafka connect clusters.
type Service struct {
	Cfg    config.KafkaConnect
	Logger *slog.Logger
	// ClientsByCluster holds the Client and config. The key is the clusters' name
	ClientsByCluster map[string]*ClientWithConfig
	Interceptor      *interceptor.Interceptor
}

// ClientWithConfig carries the Kafka KafkaConnect client, along with the configuration
// for a single configured Kafka connect cluster.
type ClientWithConfig struct {
	Client *con.Client
	Cfg    config.KafkaConnectCluster
}

// NewService creates a new connect.Service. It tests the connectivity for each configured
// Kafka connect cluster proactively.
func NewService(cfg config.KafkaConnect, logger *slog.Logger) (*Service, error) {
	clientsByCluster := make(map[string]*ClientWithConfig)

	if len(cfg.Clusters) == 0 {
		return &Service{
			Cfg:              cfg,
			Logger:           logger,
			ClientsByCluster: clientsByCluster,
			Interceptor:      interceptor.NewInterceptor(),
		}, nil
	}

	// 1. Create a client for each configured KafkaConnect cluster
	logger.Info("creating Kafka connect HTTP clients and testing connectivity to all clusters")

	for _, clusterCfg := range cfg.Clusters {
		// Create dedicated KafkaConnect HTTP Client for each cluster
		childLogger := logger.With(
			slog.String("cluster_name", clusterCfg.Name),
			slog.String("cluster_address", clusterCfg.URL))

		opts := []con.ClientOption{
			con.WithTimeout(cfg.ReadTimeout),
			con.WithUserAgent("Redpanda Console"),
		}

		opts = append(opts, con.WithHost(clusterCfg.URL))
		// TLS Config
		tlsCfg, err := clusterCfg.TLS.TLSConfig()
		if err != nil {
			childLogger.Error("failed to create TLS config for Kafka connect HTTP client, fallback to default TLS config", slog.Any("error", err))
			tlsCfg = &tls.Config{MinVersion: tls.VersionTLS12}
		}
		opts = append(opts, con.WithTLSConfig(tlsCfg))

		// Basic Auth
		if clusterCfg.Username != "" {
			opts = append(opts, con.WithBasicAuth(clusterCfg.Username, clusterCfg.Password))
		}

		// Bearer Token
		if clusterCfg.Token != "" {
			opts = append(opts, con.WithAuthToken(clusterCfg.Token))
		}

		// Create client
		client := con.NewClient(opts...)
		clientsByCluster[clusterCfg.Name] = &ClientWithConfig{
			Client: client,
			Cfg:    clusterCfg,
		}
	}

	svc := &Service{
		Cfg:              cfg,
		Logger:           logger,
		ClientsByCluster: clientsByCluster,
		Interceptor:      interceptor.NewInterceptor(),
	}

	// 2. Test connectivity against each cluster concurrently
	shortCtx, cancel := context.WithTimeout(context.Background(), cfg.ConnectTimeout)
	defer cancel()
	svc.TestConnectivity(shortCtx)

	logger.Info("successfully create Kafka connect service")

	return svc, nil
}

// TestConnectivity will send to each Kafka connect client a request to check if it is reachable. If a cluster is not
// reachable an error log message will be printed.
func (s *Service) TestConnectivity(ctx context.Context) {
	var successfulChecks uint32
	wg := sync.WaitGroup{}
	for _, clientInfo := range s.ClientsByCluster {
		wg.Add(1)
		go func(cfg config.KafkaConnectCluster, c *con.Client) {
			defer wg.Done()
			_, err := c.GetRoot(ctx)
			if err != nil {
				s.Logger.WarnContext(ctx, "connect cluster is not reachable",
					slog.String("cluster_name", cfg.Name),
					slog.String("cluster_address", cfg.URL),
					slog.Any("error", err))
				return
			}
			atomic.AddUint32(&successfulChecks, 1)
		}(clientInfo.Cfg, clientInfo.Client)
	}
	wg.Wait()
	s.Logger.InfoContext(ctx, "tested Kafka connect cluster connectivity",
		slog.Int("successful_clusters", int(successfulChecks)),
		slog.Int("failed_clusters", len(s.ClientsByCluster)-int(successfulChecks)))
}
