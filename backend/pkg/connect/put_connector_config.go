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
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	con "github.com/cloudhut/connect-client"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// PutConnectorConfig overwrites an existent connector config.
func (s *Service) PutConnectorConfig(ctx context.Context, clusterName string, connectorName string, req con.PutConnectorConfigOptions) (con.ConnectorInfo, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return con.ConnectorInfo{}, restErr
	}

	className, ok := req.Config["connector.class"].(string)
	if !ok || className == "" {
		return con.ConnectorInfo{}, &rest.Error{
			Err:      fmt.Errorf("connector class is not set"),
			Status:   http.StatusBadRequest,
			Message:  "Connector class is not set",
			IsSilent: false,
		}
	}
	req.Config = s.Interceptor.ConsoleToKafkaConnect(className, req.Config)

	cInfo, err := c.Client.PutConnectorConfig(ctx, connectorName, req)
	connectorClass := getMapValueOrString(cInfo.Config, "connector.class", "unknown")
	cInfo = con.ConnectorInfo{
		Name:   cInfo.Name,
		Config: s.Interceptor.KafkaConnectToConsole(connectorClass, cInfo.Config),
		Tasks:  cInfo.Tasks,
		Type:   cInfo.Type,
	}

	if err != nil {
		return con.ConnectorInfo{}, &rest.Error{
			Err:          fmt.Errorf("failed to patch connector config: %w", err),
			Status:       http.StatusOK,
			Message:      fmt.Sprintf("Failed to patch Connector config: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector_name", connectorName)},
			IsSilent:     false,
		}
	}

	return cInfo, nil
}
