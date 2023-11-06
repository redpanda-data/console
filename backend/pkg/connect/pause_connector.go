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

// PauseConnector pauses the connector and its tasks, which stops message processing until the connector is resumed.
// This call asynchronous and the tasks will not transition to PAUSED state at the same time.
func (s *Service) PauseConnector(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return restErr
	}

	err := c.Client.PauseConnector(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusInternalServerError),
			Message:      fmt.Sprintf("Failed to pause connector: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}
