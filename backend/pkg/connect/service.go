package connect

import (
	"context"
	"crypto/tls"
	"fmt"
	"github.com/cloudhut/common/rest"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

type Service struct {
	Cfg              Config
	Logger           *zap.Logger
	ClientsByCluster map[ /*ClusterName*/ string]*ClientWithConfig
}

type ClientWithConfig struct {
	Client *Client
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

type GetClusterShard struct {
	ClusterName    string       `json:"clusterName"`
	ClusterAddress string       `json:"clusterAddress"`
	ClusterInfo    RootResource `json:"clusterInfo"`
	Error          string       `json:"error,omitempty"`
}

// GetClusters returns the merged root responses across all configured Connect clusters. Requests will be
// sent concurrently. Context timeout should be configured correctly in order to not await responses from offline clusters
// for too long.
func (s *Service) GetClusters(ctx context.Context) []GetClusterShard {
	ch := make(chan GetClusterShard, len(s.ClientsByCluster))
	for _, cluster := range s.ClientsByCluster {
		go func(cfg ConfigCluster, c *Client) {
			clusterInfo, err := c.GetRoot(ctx)
			errMsg := ""
			if err != nil {
				s.Logger.Warn("failed to get cluster info from Kafka connect cluster",
					zap.String("cluster_name", cfg.Name), zap.String("cluster_address", cfg.URL), zap.Error(err))
				errMsg = err.Error()
			}
			ch <- GetClusterShard{
				ClusterName:    cfg.Name,
				ClusterAddress: cfg.URL,
				ClusterInfo:    clusterInfo,
				Error:          errMsg,
			}
		}(cluster.Cfg, cluster.Client)
	}

	shards := make([]GetClusterShard, cap(ch))
	for i := 0; i < cap(ch); i++ {
		shards[i] = <-ch
	}
	return shards
}

type GetConnectorsShard struct {
	ClusterName    string                         `json:"clusterName"`
	ClusterAddress string                         `json:"clusterAddress"`
	Connectors     ListConnectorsResponseExpanded `json:"connectors"`
	Error          string                         `json:"error,omitempty"`
}

// GetConnectors returns the merged GET /connectors responses across all configured Connect clusters. Requests will be
// sent concurrently. Context timeout should be configured correctly in order to not await responses from offline clusters
// for too long.
func (s *Service) GetConnectors(ctx context.Context) []GetConnectorsShard {
	ch := make(chan GetConnectorsShard, len(s.ClientsByCluster))
	for _, cluster := range s.ClientsByCluster {
		go func(cfg ConfigCluster, c *Client) {
			connectors, err := c.ListConnectorsExpanded(ctx, ListConnectorsOptions{ExpandInfo: true, ExpandStatus: true})
			errMsg := ""
			if err != nil {
				s.Logger.Warn("failed to list connectors from Kafka connect cluster",
					zap.String("cluster_name", cfg.Name), zap.String("cluster_address", cfg.URL), zap.Error(err))
				errMsg = err.Error()
			}

			ch <- GetConnectorsShard{
				ClusterName:    cfg.Name,
				ClusterAddress: cfg.URL,
				Connectors:     connectors,
				Error:          errMsg,
			}
		}(cluster.Cfg, cluster.Client)
	}

	shards := make([]GetConnectorsShard, cap(ch))
	for i := 0; i < cap(ch); i++ {
		shards[i] = <-ch
	}
	return shards
}

func (s *Service) GetClusterConnectors(ctx context.Context, clusterName string) (GetConnectorsShard, *rest.Error) {
	c, exists := s.ClientsByCluster[clusterName]
	if !exists {
		return GetConnectorsShard{}, &rest.Error{
			Err:     fmt.Errorf("requested connect cluster with that name does not exist"),
			Status:  http.StatusNotFound,
			Message: fmt.Sprintf("No connect cluster with the given cluster name '%v' exists", clusterName),
		}
	}

	connectors, err := c.Client.ListConnectorsExpanded(ctx, ListConnectorsOptions{ExpandInfo: true, ExpandStatus: true})
	errMsg := ""
	if err != nil {
		s.Logger.Warn("failed to list connectors from Kafka connect cluster",
			zap.String("cluster_name", c.Cfg.Name), zap.String("cluster_address", c.Cfg.URL), zap.Error(err))
		errMsg = err.Error()
	}

	return GetConnectorsShard{
		ClusterName:    c.Cfg.Name,
		ClusterAddress: c.Cfg.URL,
		Connectors:     connectors,
		Error:          errMsg,
	}, nil
}

type ConnectorInfoWithStatus struct {
	ConnectorStateInfo
	Config map[string]string `json:"config"`
}

// GetConnector requests the connector info as well as the status info and merges both information together. If either
// request fails an error will be returned.
func (s *Service) GetConnector(ctx context.Context, clusterName string, connector string) (ConnectorInfoWithStatus, *rest.Error) {
	c, exists := s.ClientsByCluster[clusterName]
	if !exists {
		return ConnectorInfoWithStatus{}, &rest.Error{
			Err:          fmt.Errorf("a client for the given cluster name does not exist"),
			Status:       http.StatusNotFound,
			Message:      "There's no configured cluster with the given connect cluster name",
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	cInfo, err := c.Client.GetConnector(ctx, connector)
	if err != nil {
		return ConnectorInfoWithStatus{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get connector info: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	stateInfo, err := c.Client.GetConnectorStatus(ctx, connector)
	if err != nil {
		return ConnectorInfoWithStatus{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get connector state: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return ConnectorInfoWithStatus{
		ConnectorStateInfo: stateInfo,
		Config:             cInfo.Config,
	}, nil
}

// PauseConnector pauses the connector and its tasks, which stops message processing until the connector is resumed.
// This call asynchronous and the tasks will not transition to PAUSED state at the same time.
func (s *Service) PauseConnector(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, exists := s.ClientsByCluster[clusterName]
	if !exists {
		return &rest.Error{
			Err:          fmt.Errorf("a client for the given cluster name does not exist"),
			Status:       http.StatusNotFound,
			Message:      "There's no configured cluster with the given connect cluster name",
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	err := c.Client.PauseConnector(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to pause connector: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}

// ResumeConnector resumes a paused connector or do nothing if the connector is not paused.
// This call asynchronous and the tasks will not transition to RUNNING state at the same time.
func (s *Service) ResumeConnector(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, exists := s.ClientsByCluster[clusterName]
	if !exists {
		return &rest.Error{
			Err:          fmt.Errorf("a client for the given cluster name does not exist"),
			Status:       http.StatusNotFound,
			Message:      "There's no configured cluster with the given connect cluster name",
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	err := c.Client.ResumeConnector(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to pause connector: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}

// RestartConnector restarts the connector. Return 409 (Conflict) if rebalance is in process.
// No tasks are restarted as a result of a call to this endpoint. To restart tasks, see restart task.
func (s *Service) RestartConnector(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, exists := s.ClientsByCluster[clusterName]
	if !exists {
		return &rest.Error{
			Err:          fmt.Errorf("a client for the given cluster name does not exist"),
			Status:       http.StatusNotFound,
			Message:      "There's no configured cluster with the given connect cluster name",
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	err := c.Client.RestartConnector(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to pause connector: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}

// DeleteConnector deletes a connector, halting all tasks and deleting its configuration.
// Returns 409 (Conflict) if a rebalance is in process.
func (s *Service) DeleteConnector(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, exists := s.ClientsByCluster[clusterName]
	if !exists {
		return &rest.Error{
			Err:          fmt.Errorf("a client for the given cluster name does not exist"),
			Status:       http.StatusNotFound,
			Message:      "There's no configured cluster with the given connect cluster name",
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	err := c.Client.DeleteConnector(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to delete connector: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}

// TestConnectivity will send to each Kafka connect client a request to check if it is reachable. If a cluster is not
// reachable an error log message will be printed.
func (s *Service) TestConnectivity(ctx context.Context) {
	var successfulChecks uint32
	wg := sync.WaitGroup{}
	for _, clientInfo := range s.ClientsByCluster {
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
		}(clientInfo.Cfg, clientInfo.Client)
	}
	wg.Wait()
	s.Logger.Info("tested Kafka connect cluster connectivity",
		zap.Uint32("successful_clusters", successfulChecks),
		zap.Uint32("failed_clusters", uint32(len(s.ClientsByCluster))-successfulChecks))
}
