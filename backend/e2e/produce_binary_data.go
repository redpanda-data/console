package main

import (
	"crypto/rand"
	"fmt"

	"github.com/Shopify/sarama"
)

func produceBinaryMessages(producer sarama.SyncProducer, count int) error {
	for i := 0; i < 100; i++ {
		text, _ := generateRandomBytes(300)
		msg := &sarama.ProducerMessage{
			Topic: "binary-messages",
			Value: sarama.ByteEncoder(text),
		}
		partition, offset, err := producer.SendMessage(msg)
		if err != nil {
			return err
		}
		fmt.Printf("Produced message on topic '%v', partition '%d', offset '%d'\n", "binary-messages", partition, offset)
	}

	return nil
}

// generateRandomBytes returns securely generated random bytes.
// It will return an error if the system's secure random
// number generator fails to function correctly, in which
// case the caller should not continue.
func generateRandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	// Note that err == nil only if we read len(b) bytes.
	if err != nil {
		return nil, err
	}

	return b, nil
}
