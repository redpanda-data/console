package kafka

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/Shopify/sarama"
	"go.uber.org/atomic"
	"go.uber.org/zap"
)

// ListMessageRequest carries all filter, sort and cancellation options for fetching messages from Kafka
type ListMessageRequest struct {
	TopicName    string
	PartitionID  int32 // -1 for all partitions
	StartOffset  int64 // -1 for newest, -2 for oldest offset
	MessageCount uint16
}

// ListMessageResponse returns the requested kafka messages along with some metadata about the operation
type ListMessageResponse struct {
	ElapsedMs       float64         `json:"elapsedMs"`
	FetchedMessages int             `json:"fetchedMessages"`
	IsCancelled     bool            `json:"isCancelled"`
	Messages        []*TopicMessage `json:"messages"`
}

// TopicMessage represents a single message from a given Kafka topic/partition
type TopicMessage struct {
	PartitionID int32  `json:"partitionID"`
	Offset      int64  `json:"offset"`
	Timestamp   int64  `json:"timestamp"`
	Key         []byte `json:"key"`

	Value     DirectEmbedding `json:"value"`
	ValueType string          `json:"valueType"`

	Size        int  `json:"size"`
	IsValueNull bool `json:"isValueNull"`
}

// IListMessagesProgress specifies the methods 'ListMessages' will call on your progress-object.
type IListMessagesProgress interface {
	OnPhase(name string) // todo(?): eventually we might want to convert this into an enum
	OnMessage(message *TopicMessage)
	OnComplete(elapsedMs float64, isCancelled bool)
	OnError(msg string)
}

// ListMessages fetches one or more kafka messages and returns them by spinning one partition consumer
// (which runs in it's own goroutine) for each partition and funneling all the data to eventually
// return it. The second return parameter is a bool which indicates whether the requested topic exists.
func (s *Service) ListMessages(ctx context.Context, req ListMessageRequest, progress IListMessagesProgress) error {
	start := time.Now()
	logger := s.Logger.With(zap.String("topic", req.TopicName))

	progress.OnPhase("Create Topic Consumer")
	// We must create a new Consumer for every request,
	// because each consumer can only consume every topic+partition once at the same time
	// which means that concurrent requests will not work with one shared Consumer
	consumer, err := sarama.NewConsumerFromClient(s.Client)
	if err != nil {
		return fmt.Errorf("Couldn't create consumer: %w", err)
	}
	defer func() {
		err = consumer.Close()
		if err != nil {
			logger.Error("Closing consumer failed", zap.Error(err))
		}
	}()

	progress.OnPhase("Get Partitions")
	// Create array of partitionIDs which shall be consumed (always do that to ensure the topic exists at all)
	partitions, err := s.Client.Partitions(req.TopicName)
	if err != nil {
		return fmt.Errorf("failed to get partitions: %w", err)
	}

	partitionIDs := make([]int32, 0, len(partitions))
	if req.PartitionID == -1 {
		partitionIDs = partitions
	} else if req.PartitionID > int32(len(partitions)) {
		// Since the index of partitions array equals the partitionID we can use the len() to get the highest partitionID
		return fmt.Errorf("requested partitionID (%v) is greater than number of partitions (%v)", req.PartitionID, len(partitions))
	} else {
		partitionIDs = append(partitionIDs, req.PartitionID)
	}

	progress.OnPhase("Get Watermarks")
	marks, err := s.WaterMarks(req.TopicName, partitionIDs)
	if err != nil {
		return fmt.Errorf("failed to get watermarks: %w", err)
	}

	// Start a partition consumer for all requested partitions
	doneCh := make(chan struct{}, len(partitions)) // shared channel where completed workers notify us that they're done
	startedWorkers := 0
	collectedMessageCount := new(atomic.Uint64)

	progress.OnPhase("Start Workers")

	for _, partitionID := range partitionIDs {
		// Calculate start and end offset for current partition
		highWaterMark := marks[partitionID].High
		lowWaterMark := marks[partitionID].Low
		hasMessages := highWaterMark-lowWaterMark > 0
		if !hasMessages {
			continue
		}

		messageCount := int64(math.Ceil(float64(req.MessageCount) / float64(len(partitionIDs))))

		var startOffset int64
		var endOffset int64
		if req.StartOffset == -1 {
			// Newest messages
			startOffset = highWaterMark - messageCount
			endOffset = highWaterMark
		} else if req.StartOffset == -2 {
			// Oldest messages
			startOffset = req.StartOffset
			endOffset = lowWaterMark + messageCount - 1 // -1 because first message at start index is also consumed
		} else {
			// Custom start offset given
			startOffset = req.StartOffset
			endOffset = req.StartOffset + messageCount
		}

		// Fallback to oldest available start offset if the desired start offset is lower than lowWaterMark
		if startOffset <= lowWaterMark {
			startOffset = -2
		}

		pConsumer := partitionConsumer{
			logger: logger.With(zap.Int32("partition_id", req.PartitionID)),

			doneCh:                     doneCh,
			sharedCount:                collectedMessageCount,
			requestedTotalMessageCount: uint64(req.MessageCount),
			progress:                   progress,

			consumer:    consumer,
			topicName:   req.TopicName,
			partitionID: partitionID,
			startOffset: startOffset,
			endOffset:   endOffset,
		}
		startedWorkers++
		go pConsumer.Run(ctx)
	}

	completedWorkers := 0
	allWorkersDone := false
	requestCancelled := false

	progress.OnPhase("Loading")
	// Priority list of actions
	// since we need to process cases by their priority, we must check them individually and
	// can't rely on 'select' since it picks a random case if multiple are ready.
Loop:
	for {
		//
		// 1. Enough messages?
		if collectedMessageCount.Load() >= uint64(req.MessageCount) {
			logger.Debug("ListMessages: collected == requestCount")
			break Loop // request complete
		}

		//
		// 2. Request cancelled?
		select {
		case <-ctx.Done():
			requestCancelled = true
			logger.Debug("ListMessages: ctx.Done")
			break Loop
		default:
		}

		//
		// 3. All workers done?
		if allWorkersDone {
			logger.Debug("ListMessages: all workers done")
			break Loop
		}

		//
		// 4. Count completed workers
		keepCounting := true
		for keepCounting {
			select {
			case <-doneCh:
				completedWorkers++
			default:
				keepCounting = false
			}
		}

		if completedWorkers == startedWorkers {
			allWorkersDone = true
		}

		// Throttle so we don't spin-wait
		<-time.After(50 * time.Millisecond)
	}

	progress.OnComplete(time.Since(start).Seconds()*1000, requestCancelled)

	if requestCancelled {
		return fmt.Errorf("Request was cancelled while waiting for messages from workers (probably timeout) completedWorkers=%v startedWorksers=%v fetchedMessages=%v", completedWorkers, startedWorkers, collectedMessageCount.Load())
	}

	return nil
}
