// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/version"
)

// GetKafkaVersion extracts the guessed Apache Kafka version based on the reported
// API versions for each API key.
func (s *Service) GetKafkaVersion(ctx context.Context) (string, error) {
	_, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return "", err
	}

	brokerAPIVersions, err := adminCl.ApiVersions(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to request api versions: %w", err)
	}

	var lastErr error
	for _, brokerAPIVersion := range brokerAPIVersions {
		if brokerAPIVersion.Err != nil {
			lastErr = brokerAPIVersion.Err
			continue
		}
		return brokerAPIVersion.VersionGuess(), nil
	}

	return "", lastErr
}

// APIVersion represents the supported broker versions of a specific Kafka API request (e.g. CreateTopic).
type APIVersion struct {
	KeyID      int16  `json:"keyId"`
	KeyName    string `json:"keyName"`
	MaxVersion int16  `json:"maxVersion"`
	MinVersion int16  `json:"minVersion"`
}

// GetAPIVersions asks the brokers for the supported Kafka API requests and their supported
// versions. This will be used by the frontend to figure out what functionality is available
// or should be rendered as not available.
func (s *Service) GetAPIVersions(ctx context.Context) ([]APIVersion, error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}
	req := kmsg.NewApiVersionsRequest()
	req.ClientSoftwareVersion = version.Version
	req.ClientSoftwareName = "RPConsole"

	versionsRes, err := req.RequestWith(ctx, cl)
	if err != nil {
		return nil, fmt.Errorf("failed to get kafka api version: %w", err)
	}

	err = kerr.ErrorForCode(versionsRes.ErrorCode)
	if err != nil {
		return nil, fmt.Errorf("failed to get kafka api version. Inner error: %w", err)
	}

	versions := make([]APIVersion, len(versionsRes.ApiKeys))
	for i, vers := range versionsRes.ApiKeys {
		versions[i] = APIVersion{
			KeyID:      vers.ApiKey,
			KeyName:    kmsg.NameForKey(vers.ApiKey),
			MaxVersion: vers.MaxVersion,
			MinVersion: vers.MinVersion,
		}
	}

	return versions, nil
}
