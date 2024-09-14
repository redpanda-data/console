// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"strings"

	"github.com/redpanda-data/common-go/rpadmin"

	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
)

func (s *Service) redpandaClusterVersion(ctx context.Context, redpandaCl redpandafactory.AdminAPIClient) (string, error) {
	brokers, err := redpandaCl.Brokers(ctx)
	if err != nil {
		return "", err
	}

	return clusterVersionFromBrokerList(brokers), nil
}

// clusterVersionFromBrokerList returns the version of the Redpanda cluster. Since each broker
// reports the version individually, we iterate through the list of brokers and
// return the first reported version that contains a semVer.
func clusterVersionFromBrokerList(brokers []rpadmin.Broker) string {
	version := "unknown"
	for _, broker := range brokers {
		if broker.Version != "" {
			// Broker version may look like this: "v22.1.4 - 491e56900d2316fcbb22aa1d37e7195897878309"
			brokerVersion := strings.Split(broker.Version, " ")
			if len(brokerVersion) > 0 {
				version = "Redpanda " + brokerVersion[0]
				break
			}
		}
	}
	return version
}
