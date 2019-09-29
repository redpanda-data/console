package kafka

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/Shopify/sarama"
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
	Value       []byte `json:"value"`
}

// TopicHighWaterMarks returns the topic's highest offset for each requested partition in a map where
// the partitionID is the key and the offset the value.
func (s *Service) TopicHighWaterMarks(topicName string, partitionIDs []int32) (map[int32]int64, error) {
	if s.Client.Closed() {
		return nil, fmt.Errorf("Could not get topic high water marks because sarama client is closed")
	}

	offsets := make(map[int32]int64)
	for _, partitionID := range partitionIDs {
		offset, err := s.Client.GetOffset(topicName, partitionID, sarama.OffsetNewest)
		if err != nil {
			// Errors should only happen if metadata is out of date, so let us retry then
			if err := s.Client.RefreshMetadata(topicName); err != nil {
				return nil, err
			}

			// Retry
			var errRetry error
			offset, errRetry = s.Client.GetOffset(topicName, partitionID, sarama.OffsetNewest)
			if errRetry != nil {
				return nil, errRetry
			}
		}

		offsets[partitionID] = offset
	}

	return offsets, nil
}

// TopicLowWaterMarks returns the topic's lowest offset for each requested partition in a map where
// the partitionID is the key and the offset the value.
func (s *Service) TopicLowWaterMarks(topicName string, partitionIDs []int32) (map[int32]int64, error) {
	if s.Client.Closed() {
		return nil, fmt.Errorf("Could not get topic low water marks because sarama client is closed")
	}

	offsets := make(map[int32]int64)
	for _, partitionID := range partitionIDs {
		offset, err := s.Client.GetOffset(topicName, partitionID, sarama.OffsetOldest)
		if err != nil {
			// Errors should only happen if metadata is out of date, so let us retry then
			if err := s.Client.RefreshMetadata(topicName); err != nil {
				return nil, err
			}

			// Retry
			var errRetry error
			offset, errRetry = s.Client.GetOffset(topicName, partitionID, sarama.OffsetOldest)
			if errRetry != nil {
				return nil, errRetry
			}
		}

		offsets[partitionID] = offset
	}

	return offsets, nil
}

// ListMessages fetches one or more kafka messages and returns them by spinning one partition consumer
// (which runs in it's own goroutine) for each partition and funneling all the data to eventually
// return it. The second return parameter is a bool which indicates whether the requested topic exists.
func (s *Service) ListMessages(ctx context.Context, req ListMessageRequest) (*ListMessageResponse, error) {
	start := time.Now()

	// We must create a new Consumer for every request,
	// because each consumer can only consume every topic+partition once at the same time
	// which means that concurrent requests will not work with one shared Consumer
	consumer, err := sarama.NewConsumerFromClient(s.Client)
	if err != nil {
		s.Logger.Error("Couldn't create consumer", zap.String("topic", req.TopicName), zap.Error(err))
		return nil, err
	}
	defer func() {
		err = consumer.Close() // close consumer
		if err != nil {
			s.Logger.Error("Closing consumer failed", zap.Error(err))
		}
	}()

	// Create array of partitionIDs which shall be consumed (always do that to ensure the topic exists at all)
	partitions, err := s.Client.Partitions(req.TopicName)
	if err != nil {
		return nil, fmt.Errorf("failed to get partitions for topic '%v': %v", req.TopicName, err)
	}

	partitionIDs := make([]int32, 0, len(partitions))
	if req.PartitionID == -1 {
		partitionIDs = partitions
	} else if req.PartitionID > int32(len(partitions)) {
		// Since the index of partitions array equals the partitionID we can use the len() to get the highest partitionID
		return nil, fmt.Errorf("Requested partitionID does not exist on the given topic")
	} else {
		partitionIDs = append(partitionIDs, req.PartitionID)
	}

	highMarks, err := s.TopicHighWaterMarks(req.TopicName, partitionIDs)
	if err != nil {
		return nil, err
	}

	lowMarks, err := s.TopicLowWaterMarks(req.TopicName, partitionIDs)
	if err != nil {
		return nil, err
	}

	// Start a partition consumer for all requested partitions
	errorCh := make(chan error)
	messageCh := make(chan *TopicMessage)
	doneCh := make(chan int, len(partitionIDs))
	startedRoutines := 0

	for _, partitionID := range partitionIDs {
		// Calculate start and end offset for current partition
		highWaterMark := highMarks[partitionID]
		lowWaterMark := lowMarks[partitionID]
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
			logger:      s.Logger.With(zap.String("topic_name", req.TopicName), zap.Int32("partition_id", req.PartitionID)),
			errorCh:     errorCh,
			messageCh:   messageCh,
			consumer:    consumer,
			topicName:   req.TopicName,
			partitionID: partitionID,
			startOffset: startOffset,
			endOffset:   endOffset,
		}
		startedRoutines++
		go pConsumer.Run(ctx)
	}

	// Read results into array
	msgs := make([]*TopicMessage, 0, req.MessageCount)
	isCancelled := false
	isDone := startedRoutines == 0 // Potentially we haven't started any partition consumers (e. g. requested partition has no messages)
	fetchedMessages := uint16(0)
	for {
		if isDone || isCancelled {
			break
		}

		select {
		case msg := <-messageCh:
			msgs = append(msgs, msg)
			fetchedMessages++
			if fetchedMessages == req.MessageCount {
				isDone = true
			}
		case <-ctx.Done():
			s.Logger.Error("Timeout while waiting for messageChannel")
			isCancelled = true
		case <-doneCh:
			startedRoutines--
			if startedRoutines == 0 {
				isDone = true
			}
		}
	}

	return &ListMessageResponse{
		ElapsedMs:       time.Since(start).Seconds() * 1000,
		FetchedMessages: len(msgs),
		IsCancelled:     isCancelled,
		Messages:        msgs,
	}, nil
}
