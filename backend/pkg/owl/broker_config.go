package owl

import (
	"context"
	"fmt"
	"github.com/Shopify/sarama"
	"golang.org/x/sync/errgroup"
	"strconv"
	"sync"
)

type ClusterConfig struct {
	BrokerIDs     []string                    `json:"brokerIDs"`
	BrokerConfigs []*BrokerConfig             `json:"brokerConfigs"`
	RequestErrors []*BrokerConfigRequestError `json:"requestErrors"`
}

type BrokerConfigRequestError struct {
	BrokerID     string `json:"brokerId"`
	ErrorMessage string `json:"errorMessage"`
}

type BrokerConfig struct {
	BrokerID      string               `json:"brokerId"`
	ConfigEntries []*BrokerConfigEntry `json:"configEntries"`
}

type BrokerConfigEntry struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	IsDefault bool   `json:"isDefault"`
}

// GetBrokerConfigs tries to fetch all config resources for all brokers in the cluster. If at least one response from a
// broker can be returned this function won't return an error. If all requests fail an error will be returned.
func (s *Service) GetClusterConfig(ctx context.Context) (ClusterConfig, error) {
	metadata, err := s.kafkaSvc.DescribeCluster()
	if err != nil {
		return ClusterConfig{}, fmt.Errorf("failed to get broker ids: %w", err)
	}

	brokerIDs := make([]string, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		brokerIDs[i] = strconv.Itoa(int(broker.ID()))
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
		go func(bId string) {
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
		BrokerIDs:     brokerIDs,
		BrokerConfigs: brokerConfigs,
		RequestErrors: requestErrors,
	}, nil
}

func (s *Service) GetBrokerConfig(ctx context.Context, brokerID string) (*BrokerConfig, *BrokerConfigRequestError) {
	eg, _ := errgroup.WithContext(ctx)

	var configEntries []sarama.ConfigEntry
	eg.Go(func() error {
		var err error
		configEntries, err = s.kafkaSvc.DescribeBrokerConfig(brokerID, []string{})
		if err != nil {
			return err
		}
		return nil
	})

	if err := eg.Wait(); err != nil {
		return nil, &BrokerConfigRequestError{
			BrokerID:     brokerID,
			ErrorMessage: err.Error(),
		}
	}

	// Transform response into our desired format
	formattedEntries := make([]*BrokerConfigEntry, len(configEntries))
	for i, config := range configEntries {
		formattedEntries[i] = &BrokerConfigEntry{
			Name:      config.Name,
			Value:     config.Value,
			IsDefault: config.Default,
		}
	}

	return &BrokerConfig{
		BrokerID:      brokerID,
		ConfigEntries: formattedEntries,
	}, nil
}
