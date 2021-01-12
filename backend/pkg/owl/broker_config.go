package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
	"go.uber.org/zap"
	"strconv"
	"sync"
)

type ClusterConfig struct {
	BrokerConfigs []*BrokerConfig             `json:"brokerConfigs"`
	RequestErrors []*BrokerConfigRequestError `json:"requestErrors"`
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
	Name      string  `json:"name"`
	Value     *string `json:"value"`
	IsDefault bool    `json:"isDefault"`
}

// GetClusterConfig tries to fetch all config resources for all brokers in the cluster. If at least one response from a
// broker can be returned this function won't return an error. If all requests fail an error will be returned.
func (s *Service) GetClusterConfig(ctx context.Context) (ClusterConfig, error) {
	metadata, err := s.kafkaSvc.GetMetadata(ctx, nil)
	if err != nil {
		return ClusterConfig{}, fmt.Errorf("failed to get broker ids: %w", err)
	}

	brokerIDs := make([]int32, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		brokerIDs[i] = broker.NodeID
	}

	// Send one broker config request for each broker concurrently
	type chResponse struct {
		config *BrokerConfig
		err    *BrokerConfigRequestError
	}
	resCh := make(chan chResponse)
	wg := sync.WaitGroup{}
	for _, brokerID := range brokerIDs {
		wg.Add(1)
		go func(bId int32) {
			defer wg.Done()
			cfg, reqErr := s.GetBrokerConfig(ctx, bId)
			resCh <- chResponse{
				config: cfg,
				err:    reqErr,
			}
		}(brokerID)
	}

	// Close channel once all go routines are done
	go func() {
		wg.Wait()
		close(resCh)
	}()

	haveAllRequestsFailed := true
	brokerConfigs := make([]*BrokerConfig, 0, len(metadata.Brokers))
	requestErrors := make([]*BrokerConfigRequestError, 0, len(metadata.Brokers))
	for res := range resCh {
		if res.config != nil {
			brokerConfigs = append(brokerConfigs, res.config)
			haveAllRequestsFailed = false
		}
		if res.err != nil {
			requestErrors = append(requestErrors, res.err)
		}
	}

	if haveAllRequestsFailed {
		return ClusterConfig{}, fmt.Errorf("all broker requests have failed")
	}

	return ClusterConfig{
		BrokerConfigs: brokerConfigs,
		RequestErrors: requestErrors,
	}, nil
}

func (s *Service) GetBrokerConfig(ctx context.Context, brokerID int32) (*BrokerConfig, *BrokerConfigRequestError) {
	res, err := s.kafkaSvc.DescribeBrokerConfig(ctx, strconv.Itoa(int(brokerID)), nil)
	if err != nil {
		return nil, &BrokerConfigRequestError{
			BrokerID:     brokerID,
			ErrorMessage: fmt.Sprintf("failed to describe broker configs: %v", err.Error()),
		}
	}

	if len(res) != 1 {
		return nil, &BrokerConfigRequestError{
			BrokerID:     brokerID,
			ErrorMessage: fmt.Sprintf("received '%v' responses for broker config describe, expectec exactly 1!", len(res)),
		}
	}
	brokerResponse := res[0]

	bID, err := strconv.ParseInt(brokerResponse.ResourceName, 10, 32)
	if err != nil {
		s.logger.Warn("failed to parse broker id as int from broker config response",
			zap.String("returned_value", brokerResponse.ResourceName))
		bID = -1
	}

	brokerConfig := &BrokerConfig{
		BrokerID:      int32(bID),
		Error:         nil,
		ConfigEntries: nil,
	}

	// On error set error message and continue to next broker response
	err = kerr.ErrorForCode(brokerResponse.ErrorCode)
	if err != nil {
		return nil, &BrokerConfigRequestError{
			BrokerID:     brokerID,
			ErrorMessage: fmt.Sprintf("failed to get broker config: %v", err.Error()),
		}
	}

	// Prepare config entries
	configEntries := make([]*BrokerConfigEntry, len(brokerResponse.Configs))
	for i, entry := range brokerResponse.Configs {
		e := &BrokerConfigEntry{
			Name:      entry.Name,
			Value:     entry.Value,
			IsDefault: entry.IsDefault,
		}
		configEntries[i] = e
	}
	brokerConfig.ConfigEntries = configEntries

	return brokerConfig, nil
}
