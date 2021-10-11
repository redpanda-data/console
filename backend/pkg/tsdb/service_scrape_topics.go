package tsdb

import (
	"context"
	"go.uber.org/zap"
	"time"
)

func (s *Service) scrapeTopicDatapoints(ctx context.Context) {
	s.Logger.Debug("scraping topic datapoints")

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	topicDetails, restErr := s.OwlSvc.GetTopicDetails(ctx, nil)
	if restErr != nil {
		s.Logger.Warn("failed to scrape topics", zap.Error(restErr.Err))
		return
	}

	for _, detail := range topicDetails {
		errMsg := detail.Error
		if errMsg != "" {
			s.Logger.Info("failed to scrape topic", zap.String("error_msg", errMsg),
				zap.String("topic_name", detail.TopicName))
			continue
		}

		var partitionErrors int
		partitionSizeBytes := make(map[int32]float64)
		// TODO: Handle cases where one or more replicas are down
		var topicSizeBytes float64

		for _, partition := range detail.Partitions {
			errMsg = partition.PartitionError
			if errMsg != "" {
				s.Logger.Debug("failed to scrape partition", zap.String("error_msg", errMsg),
					zap.String("topic_name", detail.TopicName),
					zap.Int32("partition_id", partition.PartitionID))
				partitionErrors++
				continue
			}

			for _, logDir := range partition.PartitionLogDirs {
				errMsg = logDir.Error
				if errMsg != "" {
					s.Logger.Debug("failed to scrape partition log dir", zap.String("error_msg", errMsg),
						zap.String("topic_name", detail.TopicName),
						zap.Int32("partition_id", partition.PartitionID))
					partitionErrors++
					continue
				}
				partitionSizeBytes[partition.PartitionID] = float64(logDir.Size)
				topicSizeBytes += float64(logDir.Size)
			}
		}

		if partitionErrors > 0 {
			s.Logger.Info("failed to scrape all topic details, because some partitions had issues",
				zap.String("topic_name", detail.TopicName),
				zap.Int("partition_errors", partitionErrors))
		}

		// Insert collected metrics into Time series database
		s.insertTopicSize(detail.TopicName, topicSizeBytes)
		for partitionID, sizeBytes := range partitionSizeBytes {
			s.insertTopicPartitionSize(detail.TopicName, partitionID, sizeBytes)
		}
	}

	s.Logger.Debug("successfully scraped topic datapoints")
}
