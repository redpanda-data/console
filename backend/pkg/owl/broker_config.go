package owl

import (
	"context"
	"fmt"
	"go.uber.org/zap"
	"strconv"
)

type ClusterConfig struct {
	BrokerConfigs []BrokerConfig `json:"brokerConfigs"`
}

type BrokerConfigRequestError struct {
	BrokerID     int32  `json:"brokerId"`
	ErrorMessage string `json:"errorMessage"`
}

type BrokerConfig struct {
	BrokerID      int32                `json:"brokerId"`
	Error         error                `json:"error"`
	ConfigEntries []*BrokerConfigEntry `json:"configEntries"`
}

type BrokerConfigEntry struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	IsDefault bool   `json:"isDefault"`
}

// GetClusterConfig tries to fetch all config resources for all brokers in the cluster. If at least one response from a
// broker can be returned this function won't return an error. If all requests fail an error will be returned.
func (s *Service) GetClusterConfig(ctx context.Context) (ClusterConfig, error) {
	metadata, err := s.kafkaSvc.GetMetadata(ctx)
	if err != nil {
		return ClusterConfig{}, fmt.Errorf("failed to get broker ids: %w", err)
	}

	brokerIDs := make([]int32, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		brokerIDs[i] = broker.NodeID
	}

	// Request all brokers' configs
	cfgs, err := s.GetBrokerConfig(ctx, "")
	if err != nil {
		return ClusterConfig{}, fmt.Errorf("failed to get broker configs: %w", err)
	}

	return ClusterConfig{
		BrokerConfigs: cfgs,
	}, nil
}

func (s *Service) GetBrokerConfig(ctx context.Context, brokerID string) ([]BrokerConfig, error) {
	res, err := s.kafkaSvc.DescribeBrokerConfig(ctx, brokerID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to describe broker configs: %w", err)
	}

	brokerConfigs := make([]BrokerConfig, 0)
	for _, brokerResponse := range res {
		brokerID, err := strconv.Atoi(brokerResponse.ResourceName)
		if err != nil {
			s.logger.Warn("failed to parse broker id as int from failed broker config response",
				zap.String("returned_value", brokerResponse.ResourceName))
			brokerID = -1
		}

		brokerConfig := BrokerConfig{
			BrokerID:      int32(brokerID),
			Error:         nil,
			ConfigEntries: nil,
		}

		// On error set error message and continue to next broker response
		if brokerResponse.ErrorCode != 0 {
			brokerConfig.Error = fmt.Errorf("failed to get broker config: %v", brokerResponse.ErrorMessage)
			brokerConfigs = append(brokerConfigs, brokerConfig)
			continue
		}

		// Prepare config entries
		configEntries := make([]*BrokerConfigEntry, len(brokerResponse.Configs))
		for i, entry := range configEntries {
			e := &BrokerConfigEntry{
				Name:      entry.Name,
				Value:     entry.Value,
				IsDefault: entry.IsDefault,
			}
			configEntries[i] = e
		}
		brokerConfigs = append(brokerConfigs, brokerConfig)
	}

	return brokerConfigs, nil
}
