package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
	"math"
	"time"
)

const (
	partitionsAll int32 = -1
)

const (
	// Recent = High water mark - number of results
	StartOffsetRecent int64 = -1
	// Oldest = Low water mark / oldest offset
	StartOffsetOldest int64 = -2
	// Newest = High water mark / Live tail
	StartOffsetNewest int64 = -3
	// Timestamp = Start offset is specified as unix timestamp in ms
	StartOffsetTimestamp int64 = -4
)

// ListMessageRequest carries all filter, sort and cancellation options for fetching messages from Kafka
type ListMessageRequest struct {
	TopicName             string
	PartitionID           int32 // -1 for all partitions
	StartOffset           int64 // -1 for recent (high - n), -2 for oldest offset, -3 for newest offset, -4 for timestamp
	StartTimestamp        int64 // Start offset by unix timestamp in ms
	MessageCount          int
	FilterInterpreterCode string
}

// ListMessageResponse returns the requested kafka messages along with some metadata about the operation
type ListMessageResponse struct {
	ElapsedMs       float64               `json:"elapsedMs"`
	FetchedMessages int                   `json:"fetchedMessages"`
	IsCancelled     bool                  `json:"isCancelled"`
	Messages        []*kafka.TopicMessage `json:"messages"`
}

// ListMessages fetches one or more kafka messages and returns them by spinning one partition consumer
// (which runs in it's own goroutine) for each partition and funneling all the data to eventually
// return it. The second return parameter is a bool which indicates whether the requested topic exists.
func (s *Service) ListMessages(ctx context.Context, listReq ListMessageRequest, progress kafka.IListMessagesProgress) error {
	start := time.Now()

	progress.OnPhase("Get Partitions")
	// Create array of partitionIDs which shall be consumed (always do that to ensure the requested topic exists at all)
	partitions, err := s.kafkaSvc.ListPartitionIDs(ctx, listReq.TopicName)
	if err != nil {
		return fmt.Errorf("failed to get partitions: %w", err)
	}

	// Check if requested partitionID exists
	if listReq.PartitionID > int32(len(partitions)) {
		return fmt.Errorf("requested partitionID (%v) is greater than number of partitions (%v)", listReq.PartitionID, len(partitions))
	}

	partitionIDs := make([]int32, 0, len(partitions))
	if listReq.PartitionID == partitionsAll {
		partitionIDs = partitions
	} else {
		partitionIDs = append(partitionIDs, listReq.PartitionID)
	}

	progress.OnPhase("Get Watermarks and calculate consuming requests")
	marks, err := s.kafkaSvc.GetPartitionMarks(ctx, listReq.TopicName, partitionIDs)
	if err != nil {
		return fmt.Errorf("failed to get watermarks: %w", err)
	}

	// Get partition consume request by calculating start and end offsets for each partition
	consumeRequests, err := s.calculateConsumeRequests(ctx, &listReq, marks)
	if len(consumeRequests) == 0 {
		// No partitions/messages to consume, we can quit early.
		progress.OnComplete(time.Since(start).Milliseconds(), false)
		return nil
	}
	topicConsumeRequest := kafka.TopicConsumeRequest{
		TopicName:             listReq.TopicName,
		MaxMessageCount:       listReq.MessageCount,
		Partitions:            consumeRequests,
		FilterInterpreterCode: listReq.FilterInterpreterCode,
	}

	progress.OnPhase("Consuming messages")
	err = s.kafkaSvc.FetchMessages(ctx, progress, topicConsumeRequest)
	if err != nil {
		progress.OnError(err.Error())
		return nil
	}

	isCancelled := ctx.Err() != nil
	progress.OnComplete(time.Since(start).Milliseconds(), isCancelled)
	if isCancelled {
		return fmt.Errorf("request was cancelled while waiting for messages")
	}

	return nil
}

// calculateConsumeRequests is supposed to calculate the start and end offsets for each partition consumer, so that
// we'll end up with ${messageCount} messages in total. To do so we'll take the known low and high watermarks into
// account. Gaps between low and high watermarks (caused by compactions) will be neglected for now.
func (s *Service) calculateConsumeRequests(ctx context.Context, listReq *ListMessageRequest, marks map[int32]kafka.PartitionMarks) (map[int32]*kafka.PartitionConsumeRequest, error) {
	requests := make(map[int32]*kafka.PartitionConsumeRequest, len(marks))

	predictableResults := listReq.StartOffset != StartOffsetNewest && listReq.FilterInterpreterCode == ""

	// Resolve offsets by partitionID if the user sent a timestamp as start offset
	var startOffsetByPartitionID map[int32]int64
	if listReq.StartOffset == StartOffsetTimestamp {
		partitionIDs := make([]int32, 0)
		for _, mark := range marks {
			partitionIDs = append(partitionIDs, mark.PartitionID)
		}
		offsets, err := s.requestOffsetsByTimestamp(ctx, listReq.TopicName, partitionIDs, listReq.StartTimestamp)
		if err != nil {
			return nil, fmt.Errorf("failed to get start offset by timestamp: %w", err)
		}
		startOffsetByPartitionID = offsets
	}

	// Init result map
	notInitialized := int64(-100)
	for _, mark := range marks {
		p := kafka.PartitionConsumeRequest{
			PartitionID:   mark.PartitionID,
			IsDrained:     false,
			LowWaterMark:  mark.Low,
			HighWaterMark: mark.High,
			StartOffset:   notInitialized,

			// End is limited by high watermark or max message count
			// -1 is necessary because mark.High - 1 is the last message which can actually be consumed
			EndOffset:       mark.High - 1,
			MaxMessageCount: 0,
		}

		if listReq.StartOffset == StartOffsetRecent {
			p.StartOffset = mark.High // StartOffset will be recalculated later
		} else if listReq.StartOffset == StartOffsetOldest {
			p.StartOffset = mark.Low
		} else if listReq.StartOffset == StartOffsetNewest {
			// In Live tail mode we consume onwards until max results are reached. Start Offset is always high watermark
			// and end offset is always MaxInt64.
			p.StartOffset = -1
		} else if listReq.StartOffset == StartOffsetTimestamp {
			// Request start offset by timestamp first and then consider it like a normal forward consuming / custom offset
			offset, exists := startOffsetByPartitionID[mark.PartitionID]
			if !exists {
				s.logger.Warn("resolved start offset (by timestamp) does not exist for this partition",
					zap.String("topic", listReq.TopicName),
					zap.Int32("partition_id", mark.PartitionID))
			}
			p.StartOffset = offset
		} else {
			// Either custom offset or resolved offset by timestamp is given
			p.StartOffset = listReq.StartOffset

			if p.StartOffset < mark.Low {
				p.StartOffset = mark.Low
				// TODO: Add some note that custom offset was lower than low watermark
			}
		}

		// Special handling for live tail and requests with enabled filter code as we don't know how many results on each
		// partition we'll get (which is required for the "roundrobin" approach).
		if !predictableResults {
			// We don't care about balanced results across partitions
			p.MaxMessageCount = int64(listReq.MessageCount)
			if listReq.StartOffset == StartOffsetNewest {
				p.EndOffset = math.MaxInt64
			}
			if listReq.StartOffset == StartOffsetRecent {
				p.StartOffset = p.HighWaterMark - 1 - int64(listReq.MessageCount)
				if p.StartOffset < 0 {
					p.StartOffset = 0
				}
			}
		}

		requests[mark.PartitionID] = &p
	}

	if !predictableResults {
		// Predictable results are required for the balancing method we usually try to apply. If that's not possible
		// we can quit early as there won't be any balancing across partitions enforced.
		return requests, nil
	}

	// We strive to return an equal number of messages across all requested partitions.
	// Round robin through partitions until either listReq.MaxMessageCount is reached or all partitions are drained
	remainingMessages := listReq.MessageCount
	yieldingPartitions := len(requests)

	for remainingMessages > 0 {
		// Check if there is at least one partition which can still return more messages
		if yieldingPartitions == 0 {
			break
		}

		for _, req := range requests {
			// If partition is already drained we must ignore it
			if req.IsDrained || remainingMessages == 0 {
				continue
			}

			if listReq.StartOffset == StartOffsetRecent {
				isDrained := req.StartOffset == req.LowWaterMark
				if isDrained {
					req.IsDrained = true
					yieldingPartitions--
					continue
				}

				// Consume "backwards" by lowering the start offset
				req.StartOffset--
			} else {
				// We add +1 to end offset because if you set highWatermark as start offset this message can still be consumed
				maxDelta := req.EndOffset - req.StartOffset
				isDrained := maxDelta == req.MaxMessageCount
				if isDrained {
					req.IsDrained = true
					yieldingPartitions--
					continue
				}

				// We don't need to increase an endOffset here, because we'll increase the max message count.
				// The partition consumer will then consume forward until it has either reached the high watermark
				// or the desired number of max message count. However we still need to iterate through these partitions
				// in order to check if other partitions may assist in fulfilling the requested message count.
			}

			req.MaxMessageCount++
			remainingMessages--
		}
	}

	// Finally clean up results and remove those partition requests which had been initialized but are not needed
	filteredRequests := make(map[int32]*kafka.PartitionConsumeRequest)
	for pID, req := range requests {
		if req.MaxMessageCount == 0 {
			continue
		}

		filteredRequests[pID] = req
	}

	return filteredRequests, nil
}

// requestOffsetsByTimestamp returns the offset that has been resolved for the given timestamp in a map which is indexed
// by partitionID.
func (s *Service) requestOffsetsByTimestamp(ctx context.Context, topicName string, partitionIDs []int32, timestamp int64) (map[int32]int64, error) {
	req := kmsg.NewListOffsetsRequest()
	topicReq := kmsg.NewListOffsetsRequestTopic()
	topicReq.Topic = topicName

	partitionReqs := make([]kmsg.ListOffsetsRequestTopicPartition, len(partitionIDs))
	for i, partitionID := range partitionIDs {
		partitionReq := kmsg.NewListOffsetsRequestTopicPartition()
		partitionReq.Partition = partitionID
		partitionReq.Timestamp = timestamp
		partitionReqs[i] = partitionReq
	}

	topicReq.Partitions = partitionReqs
	req.Topics = []kmsg.ListOffsetsRequestTopic{topicReq}

	kres, err := req.RequestWith(ctx, s.kafkaSvc.KafkaClient)
	if err != nil {
		return nil, err
	}

	offsetByPartition := make(map[int32]int64)
	for _, topic := range kres.Topics {
		for _, partition := range topic.Partitions {
			typedErr := kerr.TypedErrorForCode(partition.ErrorCode)
			if typedErr != nil {
				return nil, fmt.Errorf("failed to get timestamp for at least one partition. Inner Kafka error: %w", typedErr.Error())
			}
			offsetByPartition[partition.Partition] = partition.Offset
		}
	}

	return offsetByPartition, nil
}
