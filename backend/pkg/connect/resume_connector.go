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
)

// ResumeConnector resumes a paused connector or do nothing if the connector is not paused.
// This call asynchronous and the tasks will not transition to RUNNING state at the same time.
func (s *Service) ResumeConnector(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return restErr
	}

	err := c.Client.ResumeConnector(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusServiceUnavailable),
			Message:      fmt.Sprintf("Failed to pause connector: %v", err.Error()),
			InternalLogs: []slog.Attr{slog.String("cluster_name", clusterName), slog.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}
