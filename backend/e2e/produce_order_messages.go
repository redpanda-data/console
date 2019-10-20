package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"

	"github.com/Shopify/sarama"
	"github.com/bxcodec/faker"
)

// Order is a fake ecommerce order
type Order struct {
	Customer       Customer
	CreditCard     CreditCard
	AdditionalNote string
}

// Customer is a fake customer
type Customer struct {
	UUID       string `faker:"uuid_hyphenated"`
	FirstName  string `faker:"first_name"`
	FamilyName string `faker:"last_name"`
	Telephone  string `faker:"phone_number"`
}

// CreditCard is a fake creditcard
type CreditCard struct {
	OwnerName string `faker:"first_name"`
	Type      string `faker:"cc_type"`
	Number    string `faker:"cc_number"`
}

func produceOrderMessagesJSON(producer sarama.SyncProducer, count int) error {
	var o Order

	for i := 0; i < count; i++ {
		err := faker.FakeData(&o)
		if err != nil {
			return err
		}

		encoded, err := json.Marshal(o)
		if err != nil {
			return err
		}

		msg := &sarama.ProducerMessage{
			Topic: "orders-json",
			Value: sarama.ByteEncoder(encoded),
		}
		partition, offset, err := producer.SendMessage(msg)
		if err != nil {
			return err
		}
		fmt.Printf("Produced message on topic '%v', partition '%d', offset '%d'\n", "orders-json", partition, offset)
	}

	return nil
}

func produceOrderMessagesXML(producer sarama.SyncProducer, count int) error {
	var o Order

	for i := 0; i < count; i++ {
		err := faker.FakeData(&o)
		if err != nil {
			return err
		}

		encoded, err := xml.Marshal(o)
		if err != nil {
			return err
		}

		msg := &sarama.ProducerMessage{
			Topic: "orders-xml",
			Value: sarama.ByteEncoder(encoded),
		}
		partition, offset, err := producer.SendMessage(msg)
		if err != nil {
			return err
		}
		fmt.Printf("Produced message on topic '%v', partition '%d', offset '%d'\n", "orders-xml", partition, offset)
	}

	return nil
}
