package kafka

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"strings"
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
	OnComplete(elapsedMs float64, isCancelled bool)
	OnError(msg string)
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

type PartitionConsumer struct {
	Logger *zap.Logger // WithFields (topic, partitionId)

	// Infrastructure
	DoneCh   chan<- struct{} // notify parent that we're done
	Progress IListMessagesProgress

	// Consumer Details / Parameters
	Consumer  sarama.Consumer
	TopicName string
	Req       *PartitionConsumeRequest
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
			p.Logger.Error("Failed to close partition Consumer", zap.Error(errC))
		}
	}()

	messageCount := int64(0)
	for {
		select {
		case m, ok := <-pConsumer.Messages():
			if !ok {
				p.Logger.Error("partition Consumer message channel has unexpectedly closed")
				p.Progress.OnError(fmt.Sprintf("partition Consumer (partitionId=%v) failed to get the next message (see server log)", p.Req.PartitionID))
				return
			}

			vType, value := p.getValue(m.Value)
			topicMessage := &TopicMessage{
				PartitionID: m.Partition,
				Offset:      m.Offset,
				Timestamp:   m.Timestamp.Unix(),
				Key:         m.Key,
				Value:       value,
				ValueType:   string(vType),
				Size:        len(m.Value),
				IsValueNull: m.Value == nil,
			}
			messageCount++

			p.Progress.OnMessage(topicMessage)

			if m.Offset >= p.Req.EndOffset || messageCount == p.Req.MaxMessageCount {
				return // reached end offset
			}
		case <-ctx.Done():
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
