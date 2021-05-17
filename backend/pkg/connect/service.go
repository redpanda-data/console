package connect

import (
	"context"
	"crypto/tls"
	"go.uber.org/zap"
	"sync"
	"sync/atomic"
	"time"
)

type Service struct {
	Cfg              Config
	Logger           *zap.Logger
	ClientsByCluster map[ConfigCluster]*Client
}

func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	logger.Info("creating Kafka connect HTTP clients and testing connectivity to all clusters")

	// 1. Create a client for each configured Connect cluster
	clientsByCluster := make(map[ConfigCluster]*Client)
	for _, clusterCfg := range cfg.Clusters {
		// Create dedicated Connect HTTP Client for each cluster
		childLogger := logger.With(
			zap.String("cluster_name", clusterCfg.Name),
			zap.String("cluster_address", clusterCfg.URL))

		opts := []ClientOption{WithTimeout(60 * time.Second), WithUserAgent("Kowl")}

		opts = append(opts, WithHost(clusterCfg.URL))
		// TLS Config
		tlsCfg, err := clusterCfg.TLS.TLSConfig()
		if err != nil {
			childLogger.Error("failed to create TLS config for Kafka connect HTTP client, fallback to default TLS config", zap.Error(err))
			tlsCfg = &tls.Config{}
		}
		opts = append(opts, WithTLSConfig(tlsCfg))

		// Basic Auth
		if clusterCfg.Username != "" {
			opts = append(opts, WithBasicAuth(clusterCfg.Username, clusterCfg.Password))
		}

		// Bearer Token
		if clusterCfg.Token != "" {
			opts = append(opts, WithAuthToken(clusterCfg.Token))
		}

		// Create client
		client := NewClient(opts...)
		clientsByCluster[clusterCfg] = client
	}
	svc := &Service{
		Cfg:              cfg,
		Logger:           logger,
		ClientsByCluster: clientsByCluster,
	}

	// 2. Test connectivity against each cluster concurrently
	shortCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
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
	for cfg, client := range s.ClientsByCluster {
		wg.Add(1)
		go func(cfg ConfigCluster, c *Client) {
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
		}(cfg, client)
	}
	wg.Wait()
	s.Logger.Info("tested Kafka connect cluster connectivity",
		zap.Uint32("successful_clusters", successfulChecks),
		zap.Uint32("failed_clusters", uint32(len(s.ClientsByCluster))-successfulChecks))
}
