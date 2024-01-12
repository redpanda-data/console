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
	"net/http"

	"github.com/cloudhut/common/rest"
	con "github.com/cloudhut/connect-client"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// ListConnectorTopics returns a list of connector topic names. There is no defined
// order in which the topics are returned and consecutive calls may return the
// same topic names but in different order
func (s *Service) ListConnectorTopics(ctx context.Context, clusterName string, connector string) (con.ConnectorTopics, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return con.ConnectorTopics{}, restErr
	}

	connectorTopicsMap, err := c.Client.GetConnectorTopics(ctx, connector)
	if err != nil {
		return con.ConnectorTopics{}, &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusInternalServerError),
			Message:      fmt.Sprintf("Failed to list connector topics: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	connectorTopics := connectorTopicsMap[connector]

	return connectorTopics, nil
}

// ResetConnectorTopics resets the set of topic names that the connector has been using
// since its creation or since the last time its set of active topics was
// reset.
func (s *Service) ResetConnectorTopics(ctx context.Context, clusterName string, connector string) *rest.Error {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return restErr
	}
	err := c.Client.ResetConnectorTopics(ctx, connector)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       GetStatusCodeFromAPIError(err, http.StatusInternalServerError),
			Message:      fmt.Sprintf("Failed to restart connector topics: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName), zap.String("connector", connector)},
			IsSilent:     false,
		}
	}

	return nil
}
