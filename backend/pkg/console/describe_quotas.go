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
	"fmt"

	"github.com/twmb/franz-go/pkg/kerr"
	"golang.org/x/net/context"
)

type QuotaResponse struct {
	Error string              `json:"error,omitempty"`
	Items []QuotaResponseItem `json:"items"`
}

type QuotaResponseItem struct {
	EntityType string                 `json:"entityType"`
	EntityName string                 `json:"entityName"`
	Settings   []QuotaResponseSetting `json:"settings"`
}

type QuotaResponseSetting struct {
	Key   string  `json:"key"`
	Value float64 `json:"value"`
}

func (s *Service) DescribeQuotas(ctx context.Context) QuotaResponse {
	items := make([]QuotaResponseItem, 0)

	quotas, err := s.kafkaSvc.DescribeQuotas(ctx)
	if err != nil {
		return QuotaResponse{
			Error: fmt.Errorf("kafka request has failed: %w", err).Error(),
			Items: nil,
		}
	}

	err = kerr.ErrorForCode(quotas.ErrorCode)
	if err != nil {
		return QuotaResponse{
			Error: fmt.Errorf("inner kafka error: %w", err).Error(),
			Items: nil,
		}
	}

	// Flat map all quota settings from response into our items array
	for _, entry := range quotas.Entries {
		settings := make([]QuotaResponseSetting, len(entry.Values))
		for i, setting := range entry.Values {
			settings[i] = QuotaResponseSetting{
				Key:   setting.Key,
				Value: setting.Value,
			}
		}

		for _, entity := range entry.Entity {
			// A nil value for entity.Name means that this quota is the default for the respective entity.Type
			entityName := "<default>"
			if entity.Name != nil {
				entityName = *entity.Name
			}
			items = append(items, QuotaResponseItem{
				EntityType: entity.Type,
				EntityName: entityName,
				Settings:   settings,
			})
		}
	}

	return QuotaResponse{
		Error: "",
		Items: items,
	}
}
