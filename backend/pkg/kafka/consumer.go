// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/dop251/goja"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/interpreter"
)

// IListMessagesProgress specifies the methods 'ListMessages' will call on your progress-object.
type IListMessagesProgress interface {
	OnPhase(name string) // todo(?): eventually we might want to convert this into an enum
	OnMessage(message *TopicMessage)
	OnMessageConsumed(size int64)
	OnComplete(elapsedMs int64, isCancelled bool)
	OnError(msg string)
}

// TopicMessage represents a single message from a given Kafka topic/partition
type TopicMessage struct {
	PartitionID int32 `json:"partitionID"`
	Offset      int64 `json:"offset"`
	Timestamp   int64 `json:"timestamp"`

	Compression     string `json:"compression"`
	IsTransactional bool   `json:"isTransactional"`

	Headers []MessageHeader      `json:"headers"`
	Key     *deserializedPayload `json:"key"`
	Value   *deserializedPayload `json:"value"`

	IsValueNull bool `json:"isValueNull"` // true = tombstone

	// Below properties are used for the internal communication via Go channels
	IsMessageOk  bool   `json:"-"`
	ErrorMessage string `json:"-"`
	MessageSize  int64  `json:"-"`
}

// MessageHeader represents the deserialized key/value pair of a Kafka key + value. The key and value in Kafka is in fact
// a byte array, but keys are supposed to be strings only. Value however can be encoded in any format.
type MessageHeader struct {
	Key   string               `json:"key"`
	Value *deserializedPayload `json:"value"`
}

// PartitionConsumeRequest is a partitionID along with it's calculated start and end offset.
type PartitionConsumeRequest struct {
	PartitionID   int32
	IsDrained     bool // True if the partition was not able to return as many messages as desired here
	LowWaterMark  int64
	HighWaterMark int64

	StartOffset     int64
	EndOffset       int64
	MaxMessageCount int64 // If either EndOffset or MaxMessageCount is reached the Consumer will stop.
}

// TopicConsumeRequest defines all request parameters that are sent by the Console frontend,
// for consuming messages from a Kafka topic.
type TopicConsumeRequest struct {
	TopicName             string
	MaxMessageCount       int
	Partitions            map[int32]*PartitionConsumeRequest
	FilterInterpreterCode string
}

type interpreterArguments struct {
	PartitionID  int32
	Offset       int64
	Timestamp    time.Time
	Key          interface{}
	Value        interface{}
	HeadersByKey map[string]interface{}
}

// FetchMessages is in charge of fulfilling the topic consume request. This is tricky
// in many cases, often due to the fact that we can't consume backwards, but we offer
// users to consume the most recent messages.
func (s *Service) FetchMessages(ctx context.Context, progress IListMessagesProgress, consumeReq TopicConsumeRequest) error {
	// 1. Assign partitions with right start offsets and create client
	partitionOffsets := make(map[string]map[int32]kgo.Offset)
	partitionOffsets[consumeReq.TopicName] = make(map[int32]kgo.Offset)
	for _, req := range consumeReq.Partitions {
		offset := kgo.NewOffset().At(req.StartOffset)
		partitionOffsets[consumeReq.TopicName][req.PartitionID] = offset
	}

	client, err := s.NewKgoClient(kgo.ConsumePartitions(partitionOffsets))
	if err != nil {
		return fmt.Errorf("failed to create new kafka client: %w", err)
	}
	defer client.Close()

	// 2. Create consumer workers
	jobs := make(chan *kgo.Record, 100)
	resultsCh := make(chan *TopicMessage, 100)
	workerCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	wg := sync.WaitGroup{}

	// If we use more than one worker the order of messages in each partition gets lost. Hence we only use it where
	// multiple workers are actually beneficial - for potentially high throughput stream requests.
	workerCount := 1
	if consumeReq.FilterInterpreterCode != "" {
		workerCount = 6
	}
	for i := 0; i < workerCount; i++ {
		// Setup JavaScript interpreter
		isMessageOK, err := s.setupInterpreter(consumeReq.FilterInterpreterCode)
		if err != nil {
			s.Logger.Error("failed to setup interpreter", zap.Error(err))
			progress.OnError(fmt.Sprintf("failed to setup interpreter: %v", err.Error()))
			return err
		}

		wg.Add(1)
		go s.startMessageWorker(workerCtx, &wg, isMessageOK, jobs, resultsCh)
	}
	// Close the results channel once all workers have finished processing jobs and therefore no senders are left anymore
	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	// 3. Start go routine that consumes messages from Kafka and produces these records on the jobs channel so that these
	// can be decoded by our workers.
	go s.consumeKafkaMessages(workerCtx, client, consumeReq, jobs)

	// 4. Receive decoded messages until our request is satisfied. Once that's the case we will cancel the context
	// that propagate to all the launched go routines.
	messageCount := 0
	messageCountByPartition := make(map[int32]int64)
	remainingPartitionRequests := len(consumeReq.Partitions)
	for msg := range resultsCh {
		// Since a 'kafka message' is likely transmitted in compressed batches this size is not really accurate
		progress.OnMessageConsumed(msg.MessageSize)

		partitionReq := consumeReq.Partitions[msg.PartitionID]
		if msg.IsMessageOk && messageCountByPartition[msg.PartitionID] < partitionReq.MaxMessageCount {
			messageCount++
			messageCountByPartition[msg.PartitionID]++
			progress.OnMessage(msg)
		}

		if msg.Offset >= partitionReq.EndOffset {
			remainingPartitionRequests--
		}

		// Do we need more messages to satisfy the user request? Return if request is satisfied
		isRequestSatisfied := messageCount == consumeReq.MaxMessageCount || remainingPartitionRequests == 0
		if isRequestSatisfied {
			return nil
		}
	}

	return nil
}

func (s *Service) consumeKafkaMessages(ctx context.Context, client *kgo.Client, consumeReq TopicConsumeRequest, jobs chan<- *kgo.Record) {
	defer close(jobs)
	defer client.Close()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			fetches := client.PollFetches(ctx)
			errors := fetches.Errors()
			for _, err := range errors {
				s.Logger.Error("errors while fetching records",
					zap.String("topic_name", err.Topic),
					zap.Int32("partition", err.Partition),
					zap.Error(err.Err))
			}
			iter := fetches.RecordIter()

			// Iterate on all messages from this poll
			for !iter.Done() {
				record := iter.Next()
				partitionReq := consumeReq.Partitions[record.Partition]

				if record.Offset > partitionReq.EndOffset {
					// reached end offset within this partition, we strive to fulfil the consume request so that we achieve
					// equal distribution across the partitions
					continue
				}

				// Avoid a deadlock in case the jobs channel is full
				select {
				case <-ctx.Done():
					return
				case jobs <- record:
				}
			}
		}
	}
}

type isMessageOkFunc = func(args interpreterArguments) (bool, error)

// SetupInterpreter initializes the JavaScript interpreter along with the given JS code. It returns a wrapper function
// which accepts all Kafka message properties (offset, key, value, ...) and returns true (message shall be returned) or false
// (message shall be filtered).
func (*Service) setupInterpreter(interpreterCode string) (isMessageOkFunc, error) {
	// In case there's no code for the interpreter let's return a dummy function which always allows all messages
	if interpreterCode == "" {
		return func(args interpreterArguments) (bool, error) { return true, nil }, nil
	}

	vm := goja.New()
	code := fmt.Sprintf(`var isMessageOk = function() {%s}`, interpreterCode)
	_, err := vm.RunString(code)
	if err != nil {
		return nil, fmt.Errorf("failed to compile given interpreter code: %w", err)
	}

	// Make find() function available inside of the JavaScript VM
	_, err = vm.RunString(interpreter.FindFunction)
	if err != nil {
		return nil, fmt.Errorf("failed to compile findFunction: %w", err)
	}

	// We use named return parameter here because this way we can return a error message in recover().
	// Returning a proper error is important because we want to stop the consumer for this partition
	// if we exceed the execution timeout.
	isMessageOk := func(args interpreterArguments) (isOk bool, err error) {
		// 1. Setup timeout check. If execution takes longer than 400ms the VM will be killed
		// Ctx is used to notify the below go routine once we are done
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		// Send interrupt signal to VM if execution has taken too long
		go func() {
			timer := time.NewTimer(400 * time.Millisecond)

			select {
			case <-timer.C:
				vm.Interrupt("timeout after 400ms")
				return
			case <-ctx.Done():
				return
			}
		}()

		// Call Javascript function and check if it could be evaluated and whether it returned true or false
		vm.Set("partitionID", args.PartitionID)
		vm.Set("offset", args.Offset)
		vm.Set("timestamp", args.Timestamp)
		vm.Set("key", args.Key)
		vm.Set("value", args.Value)
		vm.Set("headers", args.HeadersByKey)
		isOkRes, err := vm.RunString("isMessageOk()")
		if err != nil {
			return false, fmt.Errorf("failed to evaluate javascript code: %w", err)
		}

		return isOkRes.ToBoolean(), nil
	}

	return isMessageOk, nil
}

func compressionTypeDisplayname(compressionType uint8) string {
	switch compressionType {
	case 0:
		return "uncompressed"
	case 1:
		return "gzip"
	case 2:
		return "snappy"
	case 3:
		return "lz4"
	case 4:
		return "zstd"
	default:
		return "unknown"
	}
}
