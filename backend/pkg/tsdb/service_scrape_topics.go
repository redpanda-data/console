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
		// TODO: Handle cases where one or more replicas are down
		var topicSizeBytes float64
		var highWaterMarkSum float64

		for _, partition := range detail.Partitions {
			errMsg = partition.PartitionError
			if errMsg != "" {
				s.Logger.Debug("failed to scrape partition", zap.String("error_msg", errMsg),
					zap.String("topic_name", detail.TopicName),
					zap.Int32("partition_id", partition.PartitionID))
				partitionErrors++
				continue
			}
			highWaterMarkSum += float64(partition.High)

			var partitionSizeWithReplicas float64
			var logDirErrors int
			for _, logDir := range partition.PartitionLogDirs {
				errMsg = logDir.Error
				if errMsg != "" {
					s.Logger.Debug("failed to scrape partition log dir", zap.String("error_msg", errMsg),
						zap.String("topic_name", detail.TopicName),
						zap.Int32("partition_id", partition.PartitionID))
					partitionErrors++
					logDirErrors++
					continue
				}
				logDirSize := float64(logDir.Size)
				isLeader := partition.Leader == logDir.BrokerID
				if isLeader {
					s.insertTopicPartitionLeaderSize(detail.TopicName, partition.PartitionID, logDirSize)
				}
				partitionSizeWithReplicas += logDirSize
				topicSizeBytes += logDirSize
			}

			// We can only be sure to report the correct total partition size if we were able to describe all log dirs
			// successfully.
			if logDirErrors == 0 {
				s.insertTopicPartitionTotalSize(detail.TopicName, partition.PartitionID, partitionSizeWithReplicas)
			}
		}

		if partitionErrors == 0 {
			// We only know the summed topic metrics if we were able to describe all partitions successfully
			s.insertTopicSize(detail.TopicName, topicSizeBytes)
			s.insertTopicHighWaterMarkSum(detail.TopicName, highWaterMarkSum)
		} else {
			s.Logger.Debug("failed to scrape all topic details, because some partitions had issues",
				zap.String("topic_name", detail.TopicName),
				zap.Int("partition_errors", partitionErrors))
		}

	}

	s.Logger.Debug("successfully scraped topic datapoints")
}
