package kafka

import (
	"context"
	"fmt"
	"github.com/Shopify/sarama"
	"github.com/dop251/goja"
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

	Headers   []MessageHeader      `json:"headers"`
	Key       *deserializedPayload `json:"key"`
	KeyType   string               `json:"keyType"`
	Value     *deserializedPayload `json:"value"`
	ValueType string               `json:"valueType"`

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

type interpreterArguments struct {
	PartitionID  int32
	Offset       int64
	Timestamp    time.Time
	Key          interface{}
	Value        interface{}
	HeadersByKey map[string]interface{}
}

type PartitionConsumer struct {
	Logger *zap.Logger // WithFields (topic, partitionId)

	// Infrastructure
	DoneCh    chan<- struct{} // notify parent that we're done
	MessageCh chan<- *TopicMessage
	Progress  IListMessagesProgress

	// Consumer Details / Parameters
	Consumer  sarama.Consumer
	TopicName string
	Req       *PartitionConsumeRequest

	Deserializer          *deserializer
	FilterInterpreterCode string
}

func (p *PartitionConsumer) Run(ctx context.Context) {
	defer func() {
		p.DoneCh <- struct{}{}
	}()

	// Create PartitionConsumer
	pConsumer, err := p.Consumer.ConsumePartition(p.TopicName, p.Req.PartitionID, p.Req.StartOffset)
	if err != nil {
		p.Logger.Error("couldn't consume partition", zap.Error(err))
		p.Progress.OnError(fmt.Sprintf("couldn't consume partition %v: %v", p.Req.PartitionID, err.Error()))
		return
	}
	defer func() {
		if errC := pConsumer.Close(); errC != nil {
			p.Logger.Error("failed to close partition consumer", zap.Error(errC))
		}
	}()

	// Setup JS interpreter
	isMessageOK, err := p.SetupInterpreter()
	if err != nil {
		p.Logger.Error("failed to setup interpreter", zap.Error(err))
		p.Progress.OnError(fmt.Sprintf("failed to setup interpreter: %v", err.Error()))
		return
	}

	messageCount := int64(0)
	for {
		select {
		case m, ok := <-pConsumer.Messages():
			if !ok {
				p.Logger.Error("partition Consumer message channel has unexpectedly closed")
				p.Progress.OnError(fmt.Sprintf("partition Consumer (partitionId=%v) failed to get the next message (see server log)", p.Req.PartitionID))
				return
			}
			messageSize := len(m.Key) + len(m.Value)
			p.Progress.OnMessageConsumed(int64(messageSize))

			// Run Interpreter filter and check if message passes the filter
			value := p.Deserializer.DeserializePayload(m.Value)
			key := p.Deserializer.DeserializePayload(m.Key)
			headers := p.DeserializeHeaders(m.Headers)

			topicMessage := &TopicMessage{
				PartitionID: m.Partition,
				Offset:      m.Offset,
				Timestamp:   m.Timestamp.Unix(),
				Headers:     headers,
				Key:         key,
				KeyType:     string(key.RecognizedEncoding),
				Value:       value,
				ValueType:   string(value.RecognizedEncoding),
				Size:        len(m.Value),
				IsValueNull: m.Value == nil,
			}

			headersByKey := make(map[string]interface{}, len(headers))
			for _, header := range headers {
				headersByKey[header.Key] = header.Value.Object
			}

			// Check if message passes filter code
			args := interpreterArguments{
				PartitionID:  m.Partition,
				Offset:       m.Offset,
				Timestamp:    m.Timestamp,
				Key:          key.Object,
				Value:        value.Object,
				HeadersByKey: headersByKey,
			}

			isOK, err := isMessageOK(args)
			if err != nil {
				// TODO: This might be changed to debug level, because operators probably do not care about user failures?
				p.Logger.Info("failed to check if message is ok", zap.Error(err))
				p.Progress.OnError(fmt.Sprintf("failed to check if message is ok (partition: '%v', offset: '%v'). Error: %v", m.Partition, m.Offset, err))
				return
			}
			if isOK {
				messageCount++

				// This is necessary because receiver might have quit before we processed the ctx.Done() and therefore
				// the channel might be blocked which would eventually mean a goroutine leak.
				select {
				case <-ctx.Done():
					return
				case p.MessageCh <- topicMessage:
					// Message successfully sent via channel
				}
			}

			if m.Offset >= p.Req.EndOffset || messageCount == p.Req.MaxMessageCount {
				return // reached end offset
			}
		case <-ctx.Done():
			p.Logger.Debug("consume request aborted because context has been cancelled")
			return // search request aborted
		}
	}
}

// SetupInterpreter initializes the JavaScript interpreter along with the given JS code. It returns a wrapper function
// which accepts all Kafka message properties (offset, key, value, ...) and returns true (message shall be returned) or false
// (message shall be filtered).
func (p *PartitionConsumer) SetupInterpreter() (func(args interpreterArguments) (bool, error), error) {
	// In case there's no code for the interpreter let's return a dummy function which always allows all messages
	if p.FilterInterpreterCode == "" {
		return func(args interpreterArguments) (bool, error) { return true, nil }, nil
	}

	vm := goja.New()
	code := fmt.Sprintf(`var isMessageOk = function() {%s}`, p.FilterInterpreterCode)
	_, err := vm.RunString(code)
	if err != nil {
		return nil, fmt.Errorf("failed to compile given interpreter code: %w", err)
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

func (p *PartitionConsumer) DeserializeHeaders(headers []*sarama.RecordHeader) []MessageHeader {
	res := make([]MessageHeader, len(headers))
	for i, header := range headers {
		key := string(header.Key)
		value := p.Deserializer.DeserializePayload(header.Value)
		res[i] = MessageHeader{
			Key:           key,
			Value:         value,
			ValueEncoding: value.RecognizedEncoding,
		}
	}

	return res
}
