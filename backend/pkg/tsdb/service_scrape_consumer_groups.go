package tsdb

import (
	"context"
	"go.uber.org/zap"
	"time"
)

func (s *Service) scrapeConsumerGroups(ctx context.Context) {
	s.Logger.Debug("scraping consumer group datapoints")

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	groupDetails, restErr := s.OwlSvc.GetConsumerGroupsOverview(ctx, nil)
	if restErr != nil {
		s.Logger.Warn("failed to scrape consumer groups", zap.Error(restErr.Err))
		return
	}

	var groupErrors int
	for _, detail := range groupDetails {
		var topicErrors int

		for _, topicOffset := range detail.TopicOffsets {
			var partitionErrors int
			for _, partitionOffset := range topicOffset.PartitionOffsets {
				if partitionOffset.Error != "" {
					partitionErrors++
					continue
				}
			}

			if partitionErrors == 0 {
				s.insertConsumerGroupSummedTopicLag(detail.GroupID, topicOffset.Topic, topicOffset.SummedLag)
			} else {
				topicErrors++
			}
		}

		if topicErrors > 0 {
			groupErrors++
		}
	}

	s.Logger.Info("successfully scraped consumer group datapoints",
		zap.Int("groups_scraped", len(groupDetails)),
		zap.Int("groups_with_errors", groupErrors))
}
