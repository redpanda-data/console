package main

import (
	"github.com/Shopify/sarama"
)

func main() {
	// Setup sarama client
	brokers := []string{"localhost:9092", "localhost:9093", "localhost:9094"}
	saramaCfg := sarama.NewConfig()
	saramaCfg.Version = sarama.V2_3_0_0
	saramaCfg.Producer.Return.Successes = true
	client, err := sarama.NewClient(brokers, saramaCfg)
	if err != nil {
		panic(err)
	}

	producer, err := sarama.NewSyncProducerFromClient(client)
	if err != nil {
		panic(err)
	}

	err = produceOrderMessagesJSON(producer, 100)
	if err != nil {
		panic(err)
	}

	err = produceOrderMessagesXML(producer, 100)
	if err != nil {
		panic(err)
	}
}
