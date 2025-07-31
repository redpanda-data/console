// Copyright 2024 Redpanda Data, Inc.
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
)

// StopConnector stops the connector but does not delete the connector. All tasks
// for the connector are shut down completely. When you resume a stopped
// connector, the connector starts on the assigned worker.r
func (s *Service) StopConnector(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return restErr
	}

	err := c.Client.StopConnector(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusInternalServerError),
			Message:      fmt.Sprintf("Failed to stop connector: %v", err.Error()),
			InternalLogs: []slog.Attr{slog.String("cluster_name", clusterName), slog.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}
