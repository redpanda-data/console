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
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// GetConnectorConfig gets the connector configuration.
func (s *Service) GetConnectorConfig(ctx context.Context, clusterName string, connector string) (map[string]string, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return map[string]string{}, restErr
	}

	config, err := c.Client.GetConnectorConfig(ctx, connector)

	connectorClass := getMapValueOrString(config, "connector.class", "unknown")

	if err != nil {
		return map[string]string{}, &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusServiceUnavailable),
			Message:      fmt.Sprintf("Failed to pause connector: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}
	return s.Interceptor.KafkaConnectToConsole(connectorClass, config), nil
}
