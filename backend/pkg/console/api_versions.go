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
)

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
	versionsRes, err := s.kafkaSvc.GetAPIVersions(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get kafka api version: %w", err)
	}

	err = kerr.ErrorForCode(versionsRes.ErrorCode)
	if err != nil {
		return nil, fmt.Errorf("failed to get kafka api version. Inner error: %w", err)
	}

	versions := make([]APIVersion, len(versionsRes.ApiKeys))
	for i, version := range versionsRes.ApiKeys {
		versions[i] = APIVersion{
			KeyID:      version.ApiKey,
			KeyName:    kmsg.NameForKey(version.ApiKey),
			MaxVersion: version.MaxVersion,
			MinVersion: version.MinVersion,
		}
	}

	return versions, nil
}
