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

func (s *Service) ValidateConnectorConfig(ctx context.Context, clusterName string, pluginClassName string, options con.ValidateConnectorConfigOptions) (con.ConnectorValidationResult, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return con.ConnectorValidationResult{}, restErr
	}

	cValidationResult, err := c.Client.PutValidateConnectorConfig(ctx, pluginClassName, options)
	if err != nil {
		return con.ConnectorValidationResult{}, &rest.Error{
			Err:          fmt.Errorf("failed to validate connector config: %w", err),
			Status:       http.StatusOK,
			Message:      fmt.Sprintf("Failed to validate Connector config: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("plugin_class_name", pluginClassName)},
			IsSilent:     false,
		}
	}

	cValidationResult = s.OverrideSvc.OverrideResults(cValidationResult)

	return cValidationResult, nil
}
