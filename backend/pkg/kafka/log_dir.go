package kafka

import (
	"github.com/Shopify/sarama"
)

// DescribeLogDirs concurrently fetches LogDirs from all Brokers and returns them in a map
// where the BrokerID is the key.
func (s *Service) DescribeLogDirs() (map[int32]*sarama.DescribeLogDirsResponse, error) {
	// 1. Fetch Log Dirs from all brokers
	type response struct {
		BrokerID int32
		Res      *sarama.DescribeLogDirsResponse
		Err      error
	}

	brokers := s.Client.Brokers()
	req := &sarama.DescribeLogDirsRequest{}
	resCh := make(chan response, len(brokers))

	for _, broker := range brokers {
		go func(b *sarama.Broker) {
			res, err := b.DescribeLogDirs(req)
			resCh <- response{
				BrokerID: b.ID(),
				Res:      res,
				Err:      err,
			}
		}(broker)
	}

	// 2. Put log dir responses into a structured map as they arrive
	result := make(map[int32]*sarama.DescribeLogDirsResponse)
	for i := 0; i < len(brokers); i++ {
		r := <-resCh
		if r.Err != nil {
			return nil, r.Err
		}

		result[r.BrokerID] = r.Res
	}

	return result, nil
}
