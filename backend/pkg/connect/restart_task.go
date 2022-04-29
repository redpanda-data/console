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
	"github.com/cloudhut/common/rest"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"net/http"
)

// RestartConnectorTask restart an individual task.
func (s *Service) RestartConnectorTask(ctx context.Context, clusterName string, connector string, taskID int) *rest.Error {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return restErr
	}

	err := c.Client.RestartConnectorTask(ctx, connector, taskID)
	if err != nil {
		return &rest.Error{
			Err:     err,
			Status:  http.StatusServiceUnavailable,
			Message: fmt.Sprintf("Failed to restart connector task: %v", err.Error()),
			InternalLogs: []zapcore.Field{
				zap.String("cluster_name", clusterName),
				zap.String("connector", connector),
				zap.Int("task_id", taskID)},
			IsSilent: false,
		}
	}

	return nil
}
