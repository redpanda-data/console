//go:build integration

package console

import (
	"context"
	"os"
	"testing"

	"github.com/testcontainers/testcontainers-go/modules/redpanda"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
)

var testSeedBroker string

const TEST_TOPIC_NAME = "test.redpanda.console.topic"

func TestMain(m *testing.M) {
	os.Exit(func() int {
		ctx := context.Background()
		container, err := redpanda.RunContainer(ctx)
		if err != nil {
			panic(err)
		}

		defer func() {
			if err := container.Terminate(ctx); err != nil {
				panic(err)
			}
		}()

		seedBroker, err := container.KafkaSeedBroker(ctx)
		if err != nil {
			panic(err)
		}

		testSeedBroker = seedBroker

		// create a long lived stock test topic
		kafkaCl, err := kgo.NewClient(
			kgo.SeedBrokers(seedBroker),
		)
		if err != nil {
			panic(err)
		}

		kafkaAdmCl := kadm.NewClient(kafkaCl)
		_, err = kafkaAdmCl.CreateTopic(ctx, 1, 1, nil, TEST_TOPIC_NAME)
		if err != nil {
			panic(err)
		}

		kafkaCl.Close()

		return m.Run()
	}())
}

func metricNameForTest(testName string) string {
	return "test_redpanda_console_" + testName
}

func topicNameForTest(testName string) string {
	return "test.redpanda.console." + testName
}
