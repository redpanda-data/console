package connect

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"net/http"
)

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
