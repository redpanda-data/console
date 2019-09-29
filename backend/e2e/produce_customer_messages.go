package main

import (
	"github.com/Shopify/sarama"
	"github.com/linkedin/goavro/v2"
)

func createAvroSchema() {
	codec, err := goavro.NewCodec()
}

func produceCustomerMessages(producer sarama.SyncProducer, count int) error {}
