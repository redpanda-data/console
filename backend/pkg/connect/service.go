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
	"sync"
	"sync/atomic"

	"go.uber.org/zap"

	con "github.com/cloudhut/connect-client"
)

type Service struct {
	Cfg              Config
	Logger           *zap.Logger
	ClientsByCluster map[ /*ClusterName*/ string]*ClientWithConfig
}

type ClientWithConfig struct {
	Client *con.Client
	Cfg    ConfigCluster
}

func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	logger.Info("creating Kafka connect HTTP clients and testing connectivity to all clusters")

	// 1. Create a client for each configured Connect cluster
	clientsByCluster := make(map[string]*ClientWithConfig)
	for _, clusterCfg := range cfg.Clusters {
		// Create dedicated Connect HTTP Client for each cluster
		childLogger := logger.With(
			zap.String("cluster_name", clusterCfg.Name),
			zap.String("cluster_address", clusterCfg.URL))

		opts := []con.ClientOption{con.WithTimeout(cfg.ReadTimeout), con.WithUserAgent("Kowl")}

		opts = append(opts, con.WithHost(clusterCfg.URL))
		// TLS Config
		tlsCfg, err := clusterCfg.TLS.TLSConfig()
		if err != nil {
			childLogger.Error("failed to create TLS config for Kafka connect HTTP client, fallback to default TLS config", zap.Error(err))
			tlsCfg = &tls.Config{}
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
	}

	// 2. Test connectivity against each cluster concurrently
	shortCtx, cancel := context.WithTimeout(context.Background(), cfg.ConnectTimeout)
	defer cancel()
	svc.TestConnectivity(shortCtx)

	logger.Info("successfully create Kafka connect service")

	return &Service{
		Cfg:              cfg,
		Logger:           logger,
		ClientsByCluster: clientsByCluster,
	}, nil
}

// TestConnectivity will send to each Kafka connect client a request to check if it is reachable. If a cluster is not
// reachable an error log message will be printed.
func (s *Service) TestConnectivity(ctx context.Context) {
	var successfulChecks uint32
	wg := sync.WaitGroup{}
	for _, clientInfo := range s.ClientsByCluster {
		wg.Add(1)
		go func(cfg ConfigCluster, c *con.Client) {
			defer wg.Done()
			_, err := c.GetRoot(ctx)
			if err != nil {
				s.Logger.Warn("connect cluster is not reachable",
					zap.String("cluster_name", cfg.Name),
					zap.String("cluster_address", cfg.URL),
					zap.Error(err))
				return
			}
			atomic.AddUint32(&successfulChecks, 1)
		}(clientInfo.Cfg, clientInfo.Client)
	}
	wg.Wait()
	s.Logger.Info("tested Kafka connect cluster connectivity",
		zap.Uint32("successful_clusters", successfulChecks),
		zap.Uint32("failed_clusters", uint32(len(s.ClientsByCluster))-successfulChecks))
}
