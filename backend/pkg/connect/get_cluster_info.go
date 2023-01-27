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
	"github.com/cloudhut/connect-client"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// ClusterInfo provides information about the Kafka connect cluster we are talking to.
type ClusterInfo struct {
	Name            string                        `json:"clusterName"`
	Host            string                        `json:"host"`
	Version         string                        `json:"clusterVersion"`
	Plugins         []connect.ConnectorPluginInfo `json:"plugins"`
	EnabledFeatures []ClusterFeature              `json:"enabledFeatures,omitempty"`
}

// GetClusterInfo retrieves metadata information about the Kafka connect cluster we talk to.
func (s *Service) GetClusterInfo(ctx context.Context, clusterName string) (ClusterInfo, *rest.Error) {
	c, restErr := s.getConnectClusterByName(clusterName)
	if restErr != nil {
		return ClusterInfo{}, restErr
	}

	rootInfo, err := c.Client.GetRoot(ctx)
	if err != nil {
		return ClusterInfo{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get cluster info: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
			IsSilent:     false,
		}
	}

	plugins, err := c.Client.GetConnectorPlugins(ctx)
	if err != nil {
		return ClusterInfo{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to get cluster plugins: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
			IsSilent:     false,
		}
	}

	return ClusterInfo{
		Name:    c.Cfg.Name,
		Host:    c.Cfg.URL,
		Version: rootInfo.Version,
		Plugins: plugins,
		// EnabledFeatures may be extended inside the HTTP handler, which has access
		// to the hooks.
		EnabledFeatures: nil,
	}, nil
}

// ClusterInfoWithError is a struct that has ClusterInfo with an additional error
// property that is set if the request to that cluster has failed.
// This struct is handy when requesting
type ClusterInfoWithError struct {
	ClusterInfo
	RequestError error
}

// GetAllClusterInfo requests cluster info from all configured connect clusters concurrently.
func (s *Service) GetAllClusterInfo(ctx context.Context) []ClusterInfoWithError {
	ch := make(chan ClusterInfoWithError, len(s.ClientsByCluster))
	for clusterName := range s.ClientsByCluster {
		go func(name string) {
			var requestError error
			cInfo, restErr := s.GetClusterInfo(ctx, name)
			if restErr != nil {
				requestError = restErr.Err
				cInfo = ClusterInfo{Name: name}
			}
			ch <- ClusterInfoWithError{
				ClusterInfo:  cInfo,
				RequestError: requestError,
			}
		}(clusterName)
	}

	shards := make([]ClusterInfoWithError, cap(ch))
	for i := 0; i < cap(ch); i++ {
		shards[i] = <-ch
	}
	return shards
}
