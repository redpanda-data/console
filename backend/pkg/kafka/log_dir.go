package kafka

import (
	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// LogDirResponse can have an error (if the broker failed to return data)
// or the actual response
type LogDirResponse struct {
	*sarama.DescribeLogDirsResponse
	Err error
}

// DescribeLogDirs concurrently fetches LogDirs from all Brokers
// and returns them in a map where the BrokerID is the key.
// map[BrokerID]LogDirResponse
func (s *Service) DescribeLogDirs() map[int32]*LogDirResponse {
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
	result := make(map[int32]*LogDirResponse)
	for i := 0; i < len(brokers); i++ {
		r := <-resCh
		if r.Err != nil {
			s.Logger.Warn("listing log dir size for broker has failed", zap.Error(r.Err), zap.Int32("broker", r.BrokerID))
			continue
		}

		result[r.BrokerID] = &LogDirResponse{r.Res, r.Err}
	}

	return result
}
