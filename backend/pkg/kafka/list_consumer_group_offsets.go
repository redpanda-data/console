package kafka

import "github.com/Shopify/sarama"

func (s *Service) listConsumerGroupOffsets(group string) (*sarama.OffsetFetchResponse, error) {
	coordinator, err := s.Client.Coordinator(group)
	if err != nil {
		return nil, err
	}

	req := &sarama.OffsetFetchRequest{
		Version:       2,
		ConsumerGroup: group,
	}
	req.ZeroPartitions() // This ensures that all topics & partitions will be queried

	res, err := coordinator.FetchOffset(req)
	if err != nil {
		return nil, err
	}

	return res, nil
}

func (s *Service) listConsumerGroupOffsetsBulk(groups []string) (map[string]*sarama.OffsetFetchResponse, error) {
	type response struct {
		Err   error
		Res   *sarama.OffsetFetchResponse
		Group string
	}

	ch := make(chan response, len(groups))
	for _, group := range groups {
		go func(group string) {
			res, err := s.listConsumerGroupOffsets(group)
			if err != nil {
				ch <- response{
					Err:   err,
					Res:   nil,
					Group: group,
				}
				return
			}

			ch <- response{
				Err:   nil,
				Res:   res,
				Group: group,
			}
		}(group)
	}

	offsets := make(map[string]*sarama.OffsetFetchResponse, len(groups))
	for range groups {
		r, ok := <-ch
		if !ok {
			continue
		}

		if r.Err != nil {
			return nil, r.Err
		}
		offsets[r.Group] = r.Res
	}

	return offsets, nil
}
