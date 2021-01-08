package kafka

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/interpreter"
	"github.com/cloudhut/kowl/backend/pkg/proto"
	"github.com/dop251/goja"
	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
	"time"
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

	Size        int  `json:"size"`
	IsValueNull bool `json:"isValueNull"`
}

// MessageHeader represents the deserialized key/value pair of a Kafka key + value. The key and value in Kafka is in fact
// a byte array, but keys are supposed to be strings only. Value however can be encoded in any format.
type MessageHeader struct {
	Key           string               `json:"key"`
	Value         *deserializedPayload `json:"value"`
	ValueEncoding messageEncoding      `json:"valueEncoding"`
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

func (s *Service) FetchMessages(ctx context.Context, progress IListMessagesProgress, consumeRequest TopicConsumeRequest) error {
	// 1. Create new kgo client
	client, err := s.NewKgoClient()
	if err != nil {
		return fmt.Errorf("failed to create new kafka client: %w", err)
	}
	defer client.Close()

	// 2. Setup JavaScript interpreter
	isMessageOK, err := s.setupInterpreter(consumeRequest.FilterInterpreterCode)
	if err != nil {
		s.Logger.Error("failed to setup interpreter", zap.Error(err))
		progress.OnError(fmt.Sprintf("failed to setup interpreter: %v", err.Error()))
		return err
	}

	// 3. Assign partitions with right start offsets
	partitionOffsets := make(map[string]map[int32]kgo.Offset)
	partitionOffsets[consumeRequest.TopicName] = make(map[int32]kgo.Offset)
	for _, req := range consumeRequest.Partitions {
		offset := kgo.NewOffset().At(req.StartOffset)
		partitionOffsets[consumeRequest.TopicName][req.PartitionID] = offset
	}
	client.AssignPartitions(
		kgo.ConsumePartitions(partitionOffsets),
	)

	// 4. Consume messages and check if filter code accepts the given records
	messageCount := 0
	remainingPartitionRequests := len(consumeRequest.Partitions)
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("interruppted message consuming because context is cancelled")
		default:
			fetches := client.PollFetches(ctx)
			errors := fetches.Errors()
			if len(errors) > 0 {
				return fmt.Errorf("'%v' errors while fetching records: %w", len(errors), errors[0].Err)
			}
			iter := fetches.RecordIter()

			// Iterate on all messages from this poll
			for !iter.Done() {
				record := iter.Next()
				partitionReq := consumeRequest.Partitions[record.Partition]

				if record.Offset > partitionReq.EndOffset {
					// reached end offset within this partition, we strive to fulfil the consume request so that we achieve
					// equal distribution across the partitions
					continue
				}

				messageSize := len(record.Key) + len(record.Value)
				progress.OnMessageConsumed(int64(messageSize))

				// Run Interpreter filter and check if message passes the filter
				value := s.Deserializer.DeserializePayload(record.Value, record.Topic, proto.RecordValue)
				key := s.Deserializer.DeserializePayload(record.Key, record.Topic, proto.RecordKey)
				headers := s.DeserializeHeaders(record.Headers)

				topicMessage := &TopicMessage{
					PartitionID:     record.Partition,
					Offset:          record.Offset,
					Timestamp:       record.Timestamp.Unix(),
					Headers:         headers,
					Compression:     compressionTypeDisplayname(record.Attrs.CompressionType()),
					IsTransactional: record.Attrs.IsTransactional(),
					Key:             key,
					Value:           value,
					Size:            len(record.Value),
					IsValueNull:     record.Value == nil,
				}

				headersByKey := make(map[string]interface{}, len(headers))
				for _, header := range headers {
					headersByKey[header.Key] = header.Value.Object
				}

				// Check if message passes filter code
				args := interpreterArguments{
					PartitionID:  record.Partition,
					Offset:       record.Offset,
					Timestamp:    record.Timestamp,
					Key:          key.Object,
					Value:        value.Object,
					HeadersByKey: headersByKey,
				}

				isOK, err := isMessageOK(args)
				if err != nil {
					// TODO: This might be changed to debug level, because operators probably do not care about user failures?
					s.Logger.Info("failed to check if message is ok", zap.Error(err))
					progress.OnError(fmt.Sprintf("failed to check if message is ok (partition: '%v', offset: '%v'). Error: %v", record.Partition, record.Offset, err))
					return nil
				}
				if isOK {
					messageCount++
					progress.OnMessage(topicMessage)
				}

				if record.Offset >= partitionReq.EndOffset {
					remainingPartitionRequests--
				}

				// Do we need more messages to satisfy the user request? Return if request is satisfied
				isRequestSatisfied := messageCount == consumeRequest.MaxMessageCount || remainingPartitionRequests == 0
				if isRequestSatisfied {
					return nil
				}
			}
		}
	}

	return nil
}

// SetupInterpreter initializes the JavaScript interpreter along with the given JS code. It returns a wrapper function
// which accepts all Kafka message properties (offset, key, value, ...) and returns true (message shall be returned) or false
// (message shall be filtered).
func (s *Service) setupInterpreter(interpreterCode string) (func(args interpreterArguments) (bool, error), error) {
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

func (s *Service) DeserializeHeaders(headers []kgo.RecordHeader) []MessageHeader {
	res := make([]MessageHeader, len(headers))
	for i, header := range headers {
		// Dummy parameters - we don't support protobuf deserialization for header values
		value := s.Deserializer.DeserializePayload(header.Value, "", proto.RecordValue)
		res[i] = MessageHeader{
			Key:           header.Key,
			Value:         value,
			ValueEncoding: value.RecognizedEncoding,
		}
	}

	return res
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
