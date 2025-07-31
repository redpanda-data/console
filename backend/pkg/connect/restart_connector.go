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
	"log/slog"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/connect-client"
)

// RestartConnector restarts the connector. Return 409 (Conflict) if rebalance is in process.
func (s *Service) RestartConnector(ctx context.Context, clusterName string, connector string, restartTasks bool, restartOnlyFailed bool) *rest.Error {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return restErr
	}

	err := c.Client.RestartConnector(ctx, connector, connect.RestartConnectorOptions{IncludeTasks: restartTasks, OnlyFailed: restartOnlyFailed})
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusServiceUnavailable),
			Message:      fmt.Sprintf("Failed to restart connector: %v", err.Error()),
			InternalLogs: []slog.Attr{slog.String("cluster_name", clusterName), slog.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}
