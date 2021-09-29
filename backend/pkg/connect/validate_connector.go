package connect

import (
	"context"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	con "github.com/cloudhut/connect-client"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func (s *Service) ValidateConnectorConfig(ctx context.Context, clusterName string, pluginClassName string, options con.ValidateConnectorConfigOptions) (con.ConnectorValidationResult, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return con.ConnectorValidationResult{}, restErr
	}

	cValidationResult, err := c.Client.ValidateConnectorConfig(ctx, pluginClassName, options)
	if err != nil {
		return con.ConnectorValidationResult{}, &rest.Error{
			Err:          fmt.Errorf("failed to validate connector config: %w", err),
			Status:       http.StatusOK,
			Message:      fmt.Sprintf("Failed to validate Connector config: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("plugin_class_name", pluginClassName)},
			IsSilent:     false,
		}
	}

	return cValidationResult, nil
}
