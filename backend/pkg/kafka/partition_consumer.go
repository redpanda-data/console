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
	"go.uber.org/atomic"
	"go.uber.org/zap"
)

type valueType string

const (
	valueTypeJSON   valueType = "json"
	valueTypeXML    valueType = "xml"
	valueTypeText   valueType = "text"
	valueTypeBinary valueType = "binary"
)

type partitionConsumer struct {
	logger *zap.Logger // WithFields (topic, partitionId)

	// Infrastructure
	doneCh                     chan<- struct{} // notify parent that we're done
	sharedCount                *atomic.Uint64  // shared message count
	requestedTotalMessageCount uint64
	progress                   IListMessagesProgress

	// Consumer Details / Parameters
	consumer    sarama.Consumer
	topicName   string
	partitionID int32
	startOffset int64
	endOffset   int64
}

func (p *partitionConsumer) Run(ctx context.Context) {
	defer func() {
		p.doneCh <- struct{}{}
	}()

	// Create PartitionConsumer
	pConsumer, err := p.consumer.ConsumePartition(p.topicName, p.partitionID, p.startOffset)
	if err != nil {
		p.logger.Error("Couldn't consume topic/partition", zap.Error(err))                               // server log
		p.progress.OnError(fmt.Sprintf("Couldn't consume partition %v: %v", p.partitionID, err.Error())) // send to client
		return
	}
	defer func() {
		if errC := pConsumer.Close(); errC != nil {
			p.logger.Error("Failed to close partition consumer", zap.Error(errC))
		}
	}()

	for {
		select {
		case m, ok := <-pConsumer.Messages():
			if !ok {
				p.logger.Error("partition consumer message channel has unexpectedly closed")
				p.progress.OnError(fmt.Sprintf("Partition consumer (partitionId=%v) failed to get the next message (see server log)", p.partitionID))
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

			// We don't have to use a compare-exchange loop here, since we don't need
			// to prevent 'p.sharedCount' from increasing beyond 'p.requestedTotalMessageCount'.
			// We just have to make sure that we don't *send* more messages.
			if p.sharedCount.Inc() > p.requestedTotalMessageCount {
				return // enough messages already
			}

			p.progress.OnMessage(topicMessage)

			if m.Offset >= p.endOffset {
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
func (p *partitionConsumer) getValue(value []byte) (valueType, DirectEmbedding) {
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
