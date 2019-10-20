package main

import (
	"fmt"

	"github.com/Shopify/sarama"
)

func produceTextMessages(producer sarama.SyncProducer, count int) error {
	for i := 0; i < count; i++ {
		text := "hello123 test message, could literally be any {} random string, including special chars äöü@!"
		msg := &sarama.ProducerMessage{
			Topic: "text-messages",
			Value: sarama.ByteEncoder(text),
		}
		partition, offset, err := producer.SendMessage(msg)
		if err != nil {
			return err
		}
		fmt.Printf("Produced message on topic '%v', partition '%d', offset '%d'\n", "text-messages", partition, offset)
	}

	return nil
}
