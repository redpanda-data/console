package kafka

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"github.com/robertkrimen/otto"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Shopify/sarama"
	xj "github.com/basgys/goxml2json"
	"github.com/valyala/fastjson"
	"go.uber.org/zap"
)

type valueType string

const (
	valueTypeJSON   valueType = "json"
	valueTypeXML    valueType = "xml"
	valueTypeText   valueType = "text"
	valueTypeBinary valueType = "binary"
)

// IListMessagesProgress specifies the methods 'ListMessages' will call on your progress-object.
type IListMessagesProgress interface {
	OnPhase(name string) // todo(?): eventually we might want to convert this into an enum
	OnMessage(message *TopicMessage)
	OnMessageConsumed(size int64)
	OnComplete(elapsedMs float64, isCancelled bool)
	OnError(msg string)
}

// TopicMessage represents a single message from a given Kafka topic/partition
type TopicMessage struct {
	PartitionID int32 `json:"partitionID"`
	Offset      int64 `json:"offset"`
	Timestamp   int64 `json:"timestamp"`

	Key       DirectEmbedding `json:"key"`
	KeyType   string          `json:"keyType"`
	Value     DirectEmbedding `json:"value"`
	ValueType string          `json:"valueType"`

	Size        int  `json:"size"`
	IsValueNull bool `json:"isValueNull"`
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
	PartitionID int32
	Offset      int64
	Timestamp   time.Time
	Key         DirectEmbedding
	Value       DirectEmbedding
}

type PartitionConsumer struct {
	Logger *zap.Logger // WithFields (topic, partitionId)

	// Infrastructure
	DoneCh   chan<- struct{} // notify parent that we're done
	Progress IListMessagesProgress

	// Consumer Details / Parameters
	Consumer  sarama.Consumer
	TopicName string
	Req       *PartitionConsumeRequest

	VM                    *otto.Otto
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
			p.Progress.OnMessageConsumed(int64(len(m.Key) + len(m.Value)))

			// Run Interpreter filter and check if message passes the filter
			vType, value := p.getValue(m.Value)
			kType, key := p.getValue(m.Key)

			topicMessage := &TopicMessage{
				PartitionID: m.Partition,
				Offset:      m.Offset,
				Timestamp:   m.Timestamp.Unix(),
				Key:         key,
				KeyType:     string(kType),
				Value:       value,
				ValueType:   string(vType),
				Size:        len(m.Value),
				IsValueNull: m.Value == nil,
			}

			// Check if message passes filter code
			args := interpreterArguments{
				PartitionID: m.Partition,
				Offset:      m.Offset,
				Timestamp:   m.Timestamp,
				Key:         DirectEmbedding{ValueType: valueTypeText, Value: m.Key}, // TODO: Parse key
				Value:       value,
			}
			isOK, err := isMessageOK(args)
			if err != nil {
				// TODO: This might be changed to debug level, because operators probably do not care about user failures?
				p.Logger.Info("failed to check if message is ok", zap.Error(err))
				p.Progress.OnError(fmt.Sprintf("failed to check if message is ok (partition: '%v', offset: '%v')", m.Partition, m.Offset))
				return
			}
			if isOK {
				messageCount++
				p.Progress.OnMessage(topicMessage)
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

// getValue returns the valueType along with it's DirectEmbedding which implements a custom Marshaller,
// so that it can return a string in the desired representation, regardless whether it's binary, text, xml
// or JSON data.
func (p *PartitionConsumer) getValue(value []byte) (valueType, DirectEmbedding) {
	if len(value) == 0 {
		return "", DirectEmbedding{ValueType: "", Value: value}
	}

	trimmed := bytes.TrimLeft(value, " \t\r\n")
	if len(trimmed) == 0 {
		return valueTypeText, DirectEmbedding{ValueType: valueTypeText, Value: value}
	}

	// 1. Test for valid JSON
	startsWithJSON := trimmed[0] == '[' || trimmed[0] == '{'
	if startsWithJSON {
		err := fastjson.Validate(string(trimmed))
		if err == nil {
			return valueTypeJSON, DirectEmbedding{ValueType: valueTypeJSON, Value: trimmed}
		}
	}

	// 2. Test for valid XML
	startsWithXML := trimmed[0] == '<'
	if startsWithXML {
		r := strings.NewReader(string(trimmed))
		json, err := xj.Convert(r)
		if err == nil {
			return valueTypeXML, DirectEmbedding{ValueType: valueTypeXML, Value: json.Bytes()}
		}
	}

	// 3. Test for UTF-8 validity
	isUTF8 := utf8.Valid(value)
	if isUTF8 {
		return valueTypeText, DirectEmbedding{ValueType: valueTypeText, Value: value}
	}

	b64 := []byte(base64.StdEncoding.EncodeToString(value))
	return valueTypeBinary, DirectEmbedding{ValueType: valueTypeBinary, Value: b64}
}

// SetupInterpreter initializes the JavaScript interpreter along with the given JS code. It returns a wrapper function
// which accepts all Kafka message properties (offset, key, value, ...) and returns true (message shall be returned) or false
// (message shall be filtered).
func (p *PartitionConsumer) SetupInterpreter() (func(args interpreterArguments) (bool, error), error) {
	// In case there's no code for the interpreter let's return a dummy function which always allows all messages
	if p.FilterInterpreterCode == "" {
		return func(args interpreterArguments) (bool, error) { return true, nil }, nil
	}

	vm := otto.New()
	code := fmt.Sprintf(`interpreter = {isMessageOk: function(partitionId, offset, timestamp, key, value) {%s}}`, p.FilterInterpreterCode)
	_, err := vm.Run(code)
	if err != nil {
		return nil, fmt.Errorf("failed to compile given interpreter code: %w", err)
	}

	interpreter, err := vm.Object("interpreter")
	if err != nil {
		return nil, err
	}

	isMessageOk := func(args interpreterArguments) (bool, error) {
		// Parse kafka key and message to a Go type (interface{} for JSON, string for text, etc)
		key, err := args.Key.Parse()
		if err != nil {
			return false, fmt.Errorf("failed to parse key (partition '%v', offset '%v')", args.PartitionID, args.Offset)
		}
		value, err := args.Value.Parse()
		if err != nil {
			return false, fmt.Errorf("failed to parse value (partition '%v', offset '%v')", args.PartitionID, args.Offset)
		}

		// Call Javascript function and check if it could be evaluated and whether it returned true or false
		val, err := interpreter.Call("isMessageOk", args.PartitionID, args.Offset, args.Timestamp, key, value)
		if err != nil {
			return false, fmt.Errorf("failed to evaluate javascript code: %w", err)
		}
		isOk, err := val.ToBoolean()
		if err != nil {
			return false, fmt.Errorf("failed to cast return type to boolean: %w", err)
		}

		return isOk, nil
	}

	return isMessageOk, nil
}
