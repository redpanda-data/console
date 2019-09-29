package kafka

import (
	"context"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

type partitionConsumer struct {
	logger *zap.Logger // WithFields (topic, partitionId)

	// Infrastructure
	errorCh   chan<- error
	messageCh chan<- *TopicMessage // 'result' channel
	doneCh    chan<- int

	// Consumer Details / Parameters
	consumer    sarama.Consumer
	topicName   string
	partitionID int32
	startOffset int64
	endOffset   int64
}

func (p *partitionConsumer) Run(ctx context.Context) {
	defer func() {
		p.doneCh <- 1
	}()

	// Create PartitionConsumer
	pConsumer, err := p.consumer.ConsumePartition(p.topicName, p.partitionID, p.startOffset)
	if err != nil {
		p.logger.Error("Couldn't consume topic/partition", zap.Error(err))
		p.errorCh <- err
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
				return
			}

			topicMessage := &TopicMessage{m.Partition, m.Offset, m.Timestamp.Unix(), m.Key, m.Value}
			p.messageCh <- topicMessage
			if m.Offset >= p.endOffset {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
