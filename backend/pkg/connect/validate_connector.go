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

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

// ValidateConnectorConfig validates a given connector's configuration that is sent by the frontend.
// The response contains all available fields along with potential configuration errors such as a
// missing value for a required configuration. This is used by the frontend to dynamically render
// the configuration form in the frontend.
//
// This function overrides some validation results, so that we can modify what is rendered in the
// frontend (e.g. removing too advanced configurations from the results).
func (s *Service) ValidateConnectorConfig(ctx context.Context, clusterName string, pluginClassName string, configs map[string]any) (model.ValidationResponse, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return model.ValidationResponse{}, restErr
	}

	configs = s.Interceptor.ConsoleToKafkaConnect(pluginClassName, configs)

	options := con.ValidateConnectorConfigOptions{Config: configs}
	cValidationResult, err := c.Client.PutValidateConnectorConfig(ctx, pluginClassName, options)
	if err != nil {
		return model.ValidationResponse{}, &rest.Error{
			Err:          fmt.Errorf("failed to validate connector config: %w", err),
			Status:       http.StatusOK,
			Message:      fmt.Sprintf("Failed to validate Connector config: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("plugin_class_name", pluginClassName)},
			IsSilent:     false,
		}
	}

	consoleValidationResponse := s.Interceptor.KafkaConnectValidateToConsole(pluginClassName, cValidationResult, configs)

	return consoleValidationResponse, nil
}
