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
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// TopicDetails contains all a topic's partition metadata (low/high watermark, metadata, log dirs etc).
type TopicDetails struct {
	TopicName string `json:"topicName"`

	// Error should only be set if the metadata request for the whole topic has failed
	Error string `json:"error,omitempty"`

	// Partitions is an array of all the available partition details. If there's an error on the topic level this
	// array will be nil.
	Partitions []TopicPartitionDetails `json:"partitions"`
}

// TopicPartitionDetails consists of all information about a single partition of a topic.
// Only data relevant to the 'partition table' in the frontend is included.
// This struct consolidates metadata, watermark, and log directory information in one place
// to prevent bugs from inconsistent partition ID handling.
type TopicPartitionDetails struct {
	// Partition identification
	ID int32 `json:"id"`

	// Partition metadata fields
	PartitionError  string  `json:"partitionError,omitempty"`
	Replicas        []int32 `json:"replicas"`
	OfflineReplicas []int32 `json:"offlineReplicas"`
	InSyncReplicas  []int32 `json:"inSyncReplicas"`
	Leader          int32   `json:"leader"`

	// Watermark fields
	WaterMarksError string `json:"waterMarksError,omitempty"`
	WaterMarkLow    int64  `json:"waterMarkLow"`
	WaterMarkHigh   int64  `json:"waterMarkHigh"`

	// Log directory information
	PartitionLogDirs []TopicPartitionLogDirs `json:"partitionLogDirs"`
}

// TopicPartitionLogDirs contains the reported log dir size for a single partition as reported by one
// of the replica brokers.
type TopicPartitionLogDirs struct {
	BrokerID    int32  `json:"brokerId"`
	Error       string `json:"error,omitempty"`
	PartitionID int32  `json:"partitionId"`
	Size        int64  `json:"size"`
}

// TopicPartitionLogDirRequestError is an error reported by a broker whose log dir information request
// has failed.
type TopicPartitionLogDirRequestError struct {
	Error    string `json:"error,omitempty"`
	BrokerID int32  `json:"brokerId"`
}

// GetTopicDetails returns information about the partitions in the specified topics. Pass nil for topicNames in order
// to describe partitions from all topics.
func (s *Service) GetTopicDetails(ctx context.Context, topicNames []string) ([]TopicDetails, *rest.Error) {
	cl, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, errorToRestError(err)
	}

	// 1. Request metadata for all topics and partitions
	topicMetadata, restErr := s.getTopicPartitionMetadata(ctx, adminCl, topicNames)
	if restErr != nil {
		return nil, restErr
	}

	// 2. Describe partition log dirs
	var logDirsByTopicPartition map[string]map[int32][]TopicPartitionLogDirs
	wg := sync.WaitGroup{}
	wg.Add(1)
	go func() {
		defer wg.Done()
		logDirsByTopicPartition = s.describePartitionLogDirs(ctx, cl, topicMetadata)
	}()

	// 3. Get partition low & high watermarks
	topicWatermarkReqs := make(map[string][]int32)
	for _, topic := range topicMetadata {
		if topic.Error != "" {
			// If there's an error on the topic level we won't have any partitions reported back
			continue
		}

		for _, partition := range topic.Partitions {
			partitionID := partition.ID
			topicWatermarkReqs[topic.TopicName] = append(topicWatermarkReqs[topic.TopicName], partitionID)
		}
	}

	startOffsets, err := adminCl.ListStartOffsets(ctx, topicNames...)
	if err != nil {
		return nil, &rest.Error{
			Err:          err,
			Status:       http.StatusInternalServerError,
			Message:      fmt.Sprintf("Failed to list topic start offsets: %v", err.Error()),
			InternalLogs: nil,
		}
	}

	endOffsets, err := adminCl.ListEndOffsets(ctx, topicNames...)
	if err != nil {
		return nil, &rest.Error{
			Err:          err,
			Status:       http.StatusInternalServerError,
			Message:      fmt.Sprintf("Failed to list topic end offsets: %v", err.Error()),
			InternalLogs: nil,
		}
	}

	// Wait for the log dir response if necessary
	wg.Wait()

	// 4. Create result array
	topicsDetails := make([]TopicDetails, 0, len(topicMetadata))
	for _, topic := range topicMetadata {
		details := TopicDetails{
			TopicName: topic.TopicName,
		}

		if topic.Error != "" {
			// If there was a topic error we don't expect any further partition details
			details.Error = topic.Error
			topicsDetails = append(topicsDetails, details)
			continue
		}

		// Construct partition details
		partitionsDetails := make([]TopicPartitionDetails, len(topic.Partitions))
		for i, partition := range topic.Partitions {
			startOffset, _ := startOffsets.Lookup(topic.TopicName, partition.ID)
			endOffset, _ := endOffsets.Lookup(topic.TopicName, partition.ID)
			offsetErr := errorToString(startOffset.Err)
			if offsetErr == "" {
				offsetErr = errorToString(endOffset.Err)
			}

			// Get log dirs for the current partitions. We can rest assured that the map is fully initialized and we
			// won't run into nil panics. The describe log dirs function that constructs this nested map is supposed
			// to create one map item for each requested topic + partition.
			logDirs := logDirsByTopicPartition[topic.TopicName][partition.ID]

			d := TopicPartitionDetails{
				ID:               partition.ID,
				PartitionError:   partition.PartitionError,
				Replicas:         partition.Replicas,
				OfflineReplicas:  partition.OfflineReplicas,
				InSyncReplicas:   partition.InSyncReplicas,
				Leader:           partition.Leader,
				WaterMarksError:  offsetErr,
				WaterMarkLow:     startOffset.Offset,
				WaterMarkHigh:    endOffset.Offset,
				PartitionLogDirs: logDirs,
			}
			partitionsDetails[i] = d
		}
		details.Partitions = partitionsDetails
		topicsDetails = append(topicsDetails, details)
	}

	return topicsDetails, nil
}

func (s *Service) getTopicPartitionMetadata(ctx context.Context, adminCl *kadm.Client, topicNames []string) (map[string]TopicDetails, *rest.Error) {
	metadata, err := adminCl.Metadata(ctx, topicNames...)
	if err != nil {
		return nil, &rest.Error{
			Err:      err,
			Status:   http.StatusServiceUnavailable,
			Message:  fmt.Sprintf("Failed to get topic metadata from cluster: '%v'", err.Error()),
			IsSilent: false,
		}
	}

	overviewByTopic := make(map[string]TopicDetails)

	for _, topic := range metadata.Topics {
		topicOverview := TopicDetails{
			TopicName: topic.Topic,
		}
		if topic.Err != nil {
			s.logger.WarnContext(ctx, "failed to get metadata for topic", slog.String("topic", topic.Topic), slog.Any("error", topic.Err))

			// Propagate the failed response and do not even try any further requests for that topic.
			topicOverview.Error = fmt.Sprintf("Failed to get metadata for topic: %v", topic.Err.Error())
			overviewByTopic[topic.Topic] = topicOverview
			continue
		}

		// Iterate all partitions
		partitionMetadata := make([]TopicPartitionDetails, len(topic.Partitions))
		for i, partition := range topic.Partitions {
			details := TopicPartitionDetails{
				ID: partition.Partition,
			}
			if partition.Err != nil {
				// We don't log the error because in case of offline partitions an error would be expected, but would
				// still contain all the necessary partition information.

				// Propagate the failed response and do not even try any further requests for that partition.
				details.PartitionError = fmt.Sprintf("Failed to get partitionMetadata for partition: %v", partition.Err.Error())
				partitionMetadata[i] = details
				continue
			}
			details.Replicas = partition.Replicas
			details.InSyncReplicas = partition.ISR
			details.Leader = partition.Leader
			details.OfflineReplicas = partition.OfflineReplicas
			details.PartitionLogDirs = []TopicPartitionLogDirs{}
			partitionMetadata[i] = details
		}
		topicOverview.Partitions = partitionMetadata
		overviewByTopic[topic.Topic] = topicOverview
	}

	return overviewByTopic, nil
}

//nolint:gocognit,cyclop // Eventually this should be refactored to use the franz-go admin client
func (s *Service) describePartitionLogDirs(ctx context.Context, cl *kgo.Client, topicMetadata map[string]TopicDetails) map[string]map[int32][]TopicPartitionLogDirs {
	// 1. Construct log dir requests and collect all replica ids by partition so that we can later check whether we
	// successfully described all partition replicas.
	topicLogDirReqs := make([]kmsg.DescribeLogDirsRequestTopic, 0)
	replicaIDsByTopicPartition := make(map[string]map[int32][]int32)
	for _, topic := range topicMetadata {
		if topic.Error != "" {
			// If there's an error on the topic level we won't have any partitions reported back
			continue
		}
		replicaIDsByTopicPartition[topic.TopicName] = make(map[int32][]int32)

		req := kmsg.NewDescribeLogDirsRequestTopic()
		req.Topic = topic.TopicName
		req.Partitions = make([]int32, 0)
		for _, partition := range topic.Partitions {
			partitionID := partition.ID
			req.Partitions = append(req.Partitions, partitionID)
			replicaIDsByTopicPartition[topic.TopicName][partitionID] = partition.Replicas
		}
		topicLogDirReqs = append(topicLogDirReqs, req)
	}

	// 2. Send request to Kafka
	// Try to get partition sizes; Use a timeout so that we don't wait too long if a single broker is unreachable
	logDirCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	partitionLogDirs := make(map[string]map[int32][]TopicPartitionLogDirs)
	errorByBrokerID := make(map[int32]error)
	responseSharded := s.describeLogDirs(logDirCtx, cl, topicLogDirReqs)

	for _, resShard := range responseSharded {
		brokerID := resShard.BrokerMetadata.NodeID
		if resShard.Error != nil {
			errorByBrokerID[brokerID] = resShard.Error
			continue
		}

		for _, dir := range resShard.LogDirs.Dirs {
			err := kerr.ErrorForCode(dir.ErrorCode)
			if err != nil {
				errorByBrokerID[brokerID] = fmt.Errorf("failed to describe dir, inner kafka error: %w", err)
				continue
			}
			for _, topic := range dir.Topics {
				topicLogDir, exists := partitionLogDirs[topic.Topic]
				if !exists {
					topicLogDir = make(map[int32][]TopicPartitionLogDirs)
				}
				for _, partition := range topic.Partitions {
					d := TopicPartitionLogDirs{
						BrokerID:    resShard.BrokerMetadata.NodeID,
						PartitionID: partition.Partition,
						Size:        partition.Size,
					}
					topicLogDir[partition.Partition] = append(topicLogDir[partition.Partition], d)
				}
				partitionLogDirs[topic.Topic] = topicLogDir
			}
		}
	}

	// 3. Iterate results and check whether we have one described topic log dir for each partition replica.
	// If not, let's check if some brokers failed to respond to the describe log dir request and propagate that
	// information so that this can be shown in the Frontend.
	for topicName, partitionReplicas := range replicaIDsByTopicPartition {
		topicLogDirsPatched, exists := partitionLogDirs[topicName]
		if !exists {
			topicLogDirsPatched = make(map[int32][]TopicPartitionLogDirs)
		}

		for partitionID, replicaIDs := range partitionReplicas {
			if len(topicLogDirsPatched[partitionID]) >= len(replicaIDs) {
				continue
			}

			// If we have less log dirs than reported replicaIDs, let's create an error for each missing replica
			for _, replicaID := range replicaIDs {
				logDirForCurrentReplicaExists := false
				for _, logDir := range topicLogDirsPatched[partitionID] {
					if logDir.BrokerID == replicaID {
						logDirForCurrentReplicaExists = true
						break
					}
				}

				if !logDirForCurrentReplicaExists {
					err, exists := errorByBrokerID[replicaID]
					if !exists {
						// This err should never happen. We should always have a proper err for missing responses!
						err = errors.New("haven't got a log dir response for this replica even though it had been requested")
					}
					topicLogDirsPatched[partitionID] = append(topicLogDirsPatched[partitionID], TopicPartitionLogDirs{
						BrokerID:    replicaID,
						Error:       err.Error(),
						PartitionID: partitionID,
						Size:        -1,
					})
				}
			}
		}
		partitionLogDirs[topicName] = topicLogDirsPatched
	}

	return partitionLogDirs
}

// AddPartitionsToTopics adds new partitions to an existing topics.
func (s *Service) AddPartitionsToTopics(ctx context.Context, add int, topicNames []string, validateOnly bool) (kadm.CreatePartitionsResponses, error) {
	_, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	if validateOnly {
		return adminCl.ValidateCreatePartitions(ctx, add, topicNames...)
	}

	return adminCl.CreatePartitions(ctx, add, topicNames...)
}

// SetPartitionsToTopics sets modifies the number of existing topics.
func (s *Service) SetPartitionsToTopics(ctx context.Context, count int, topicNames []string, validateOnly bool) (kadm.CreatePartitionsResponses, error) {
	_, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}

	if validateOnly {
		return adminCl.ValidateUpdatePartitions(ctx, count, topicNames...)
	}

	return adminCl.UpdatePartitions(ctx, count, topicNames...)
}
