package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"math"
	"time"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
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
)

// ListMessageRequest carries all filter, sort and cancellation options for fetching messages from Kafka
type ListMessageRequest struct {
	TopicName             string
	PartitionID           int32 // -1 for all partitions
	StartOffset           int64 // -1 for recent (high - n), -2 for oldest offset, -3 for newest offset
	MessageCount          uint16
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
	logger := s.logger.With(zap.String("topic", listReq.TopicName))

	progress.OnPhase("Create Topic Consumer")
	// We must create a new Consumer for every request,
	// because each consumer can only consume every topic+partition once at the same time
	// which means that concurrent requests will not work with one shared Consumer
	consumer, err := sarama.NewConsumerFromClient(s.kafkaSvc.Client)
	if err != nil {
		return fmt.Errorf("couldn't create consumer: %w", err)
	}
	defer func() {
		err = consumer.Close()
		if err != nil {
			logger.Error("closing consumer failed", zap.Error(err))
		}
	}()

	progress.OnPhase("Get Partitions")
	// Create array of partitionIDs which shall be consumed (always do that to ensure the topic exists at all)
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

	progress.OnPhase("Get Watermarks")
	marks, err := s.kafkaSvc.GetPartitionMarks(ctx, listReq.TopicName, partitionIDs)
	if err != nil {
		return fmt.Errorf("failed to get watermarks: %w", err)
	}

	progress.OnPhase("Setup consumer agents")

	// Start a partition consumer for all requested partitions
	doneCh := make(chan struct{}, len(partitions)) // shared channel where completed workers notify us that they're done
	messageCh := make(chan *kafka.TopicMessage)
	startedWorkers := 0

	// Get partition consume request by calculating start and end offsets for each partition
	consumeRequests := calculateConsumeRequests(&listReq, marks)
	childCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	for _, req := range consumeRequests {
		pConsumer := kafka.PartitionConsumer{
			Logger: logger.With(zap.Int32("partition_id", req.PartitionID)),

			DoneCh:    doneCh,
			MessageCh: messageCh,
			Progress:  progress,

			Consumer:              consumer,
			TopicName:             listReq.TopicName,
			Req:                   req,
			FilterInterpreterCode: listReq.FilterInterpreterCode,

			Deserializer: &s.kafkaSvc.Deserializer,
		}
		startedWorkers++
		go pConsumer.Run(childCtx)
	}

	completedWorkers := 0
	allWorkersDone := false
	requestCancelled := false

	progress.OnPhase("Consuming messages")

	go func(ch <-chan *kafka.TopicMessage, req ListMessageRequest) {
		messagesToFetch := req.MessageCount
		for {
			select {
			case msg := <-ch:
				messagesToFetch--
				progress.OnMessage(msg)

				// When we are done quit routine and cancel context so that all partition consumers will stop as well
				if messagesToFetch == 0 {
					cancel()
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}(messageCh, listReq)

	// Priority list of actions
	// since we need to process cases by their priority, we must check them individually and
	// can't rely on 'select' since it picks a random case if multiple are ready.
Loop:
	for {
		// 1. Request cancelled?
		select {
		case <-ctx.Done():
			requestCancelled = true
			logger.Debug("ListMessages: ctx.Done")
			break Loop
		default:
		}

		// 2. All workers done?
		if allWorkersDone {
			logger.Debug("ListMessages: all workers done")
			break Loop
		}

		// 3. Count completed workers
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

	progress.OnComplete(time.Since(start).Milliseconds(), requestCancelled)

	if requestCancelled {
		return fmt.Errorf("request was cancelled while waiting for messages from workers (probably timeout) completedWorkers=%v startedWorksers=%v", completedWorkers, startedWorkers)
	}

	return nil
}

// calculateConsumeRequests is supposed to calculate the start and end offsets for each partition consumer, so that
// we'll end up with ${messageCount} messages in total. To do so we'll take the known low and high watermarks into
// account. Gaps between low and high watermarks (caused by compactions) will be neglected for now.
func calculateConsumeRequests(listReq *ListMessageRequest, marks map[int32]kafka.PartitionMarks) map[int32]*kafka.PartitionConsumeRequest {
	requests := make(map[int32]*kafka.PartitionConsumeRequest, len(marks))

	predictableResults := listReq.StartOffset != StartOffsetNewest && listReq.FilterInterpreterCode == ""
	// Init result map
	notInitialized := int64(-1)
	for _, mark := range marks {
		p := &kafka.PartitionConsumeRequest{
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
			p.StartOffset = sarama.OffsetNewest
		} else {
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

		requests[mark.PartitionID] = p
	}

	if !predictableResults {
		// Predictable results are required for the balancing method we usually try to apply. If that's not possible
		// we can quit early as there won't be any balancing across partitions enforced.
		return requests
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

	return filteredRequests
}
