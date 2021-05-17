package connect

import (
	"context"
	"crypto/tls"
	"go.uber.org/zap"
	"time"
)

type Service struct {
	Cfg              Config
	Logger           *zap.Logger
	ClientsByCluster map[string]*Client
}

func NewService(cfg Config, logger *zap.Logger) (*Service, error) {
	clients := make(map[string]*Client)

	logger.Info("creating Kafka connect service and testing cluster connectivity")
	clustersWithConnectivity := 0

	shortCtx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	// TODO: Check connectivity concurrently?
	for _, clusterCfg := range cfg.Clusters {
		// Create dedicated Connect HTTP Client for each cluster
		childLogger := logger.With(
			zap.String("cluster_name", clusterCfg.Name),
			zap.String("address", clusterCfg.URL))

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
		_, err = client.GetRoot(shortCtx)
		if err != nil {
			childLogger.Error("failed to check connect cluster HTTP connectivity", zap.Error(err))
		} else {
			clustersWithConnectivity++
		}
	}
	logger.Info("successfully tested Kafka connect cluster connectivity",
		zap.Int("connected_clusters", clustersWithConnectivity),
		zap.Int("failed_clusters", len(cfg.Clusters)-clustersWithConnectivity))

	return &Service{
		Cfg:              cfg,
		Logger:           logger,
		ClientsByCluster: clients,
	}, nil
}
