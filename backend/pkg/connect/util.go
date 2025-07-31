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
	"errors"
	"log/slog"
	"net/http"

	"github.com/cloudhut/common/rest"
)

// getMapValueOrString returns the map entry for the given key. If this entry does not exist it will return the
// passed fallback string.
//
//nolint:unparam // We may want to support different fallback options in the future.
func getMapValueOrString(m map[string]string, key string, fallback string) string {
	if val, exists := m[key]; exists {
		return val
	}

	return fallback
}

func (s *Service) getConnectClusterByName(clusterName string) (*ClientWithConfig, *rest.Error) {
	c, exists := s.ClientsByCluster[clusterName]
	if !exists {
		return nil, &rest.Error{
			Err:          errors.New("a client for the given cluster name does not exist"),
			Status:       http.StatusNotFound,
			Message:      "There's no configured cluster with the given connect cluster name",
			InternalLogs: []slog.Attr{slog.String("cluster_name", clusterName)},
			IsSilent:     false,
		}
	}

	return c, nil
}
