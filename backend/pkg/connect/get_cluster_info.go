package connect

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/connect-client"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"net/http"
)

type ClusterInfo struct {
	Name    string                        `json:"clusterName"`
	Host    string                        `json:"host"`
	Version string                        `json:"clusterVersion"`
	Plugins []connect.ConnectorPluginInfo `json:"plugins"`
}

func (s *Service) GetClusterInfo(ctx context.Context, clusterName string) (ClusterInfo, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return ClusterInfo{}, restErr
	}

	rootInfo, err := c.Client.GetRoot(ctx)
	if err != nil {
		return ClusterInfo{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get cluster info: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
			IsSilent:     false,
		}
	}

	plugins, err := c.Client.GetConnectorPlugins(ctx)
	if err != nil {
		return ClusterInfo{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get cluster plugins: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
			IsSilent:     false,
		}
	}

	return ClusterInfo{
		Name:    c.Cfg.Name,
		Host:    c.Cfg.URL,
		Version: rootInfo.Version,
		Plugins: plugins,
	}, nil
}
