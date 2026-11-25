// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Command cmd seeds a cluster with the schema locator fixture for manual
// tests. It needs Redpanda 26.3 or later without authentication.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/testutil/schemaseed"
)

func main() {
	brokers := flag.String("brokers", "127.0.0.1:9092", "comma-separated Kafka brokers")
	registry := flag.String("registry", "http://127.0.0.1:8081", "Schema Registry URL")
	reset := flag.Bool("reset", false, "delete the fixture topics and subjects first")
	idBase := flag.Int("id-base", 0, "schema IDs are id-base+1 to id-base+4 in each context")
	topicPrefix := flag.String("topic-prefix", "", "prefix for the topic names")
	flag.Parse()

	if err := run(*brokers, *registry, *reset, *idBase, *topicPrefix); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(brokers, registry string, reset bool, idBase int, topicPrefix string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	kafka, err := kgo.NewClient(kgo.SeedBrokers(strings.Split(brokers, ",")...))
	if err != nil {
		return fmt.Errorf("creating the Kafka client: %w", err)
	}
	defer kafka.Close()
	adm := kadm.NewClient(kafka)

	reg, err := sr.NewClient(sr.URLs(registry))
	if err != nil {
		return fmt.Errorf("creating the Schema Registry client: %w", err)
	}

	opts := []schemaseed.Option{schemaseed.WithIDBase(idBase), schemaseed.WithTopicPrefix(topicPrefix)}
	if reset {
		if err := schemaseed.Reset(ctx, adm, reg, opts...); err != nil {
			return err
		}
	}

	fixture, err := schemaseed.Seed(ctx, kafka, adm, reg, opts...)
	if err != nil {
		return err
	}

	for _, s := range fixture.Schemas {
		fmt.Printf("%-9s id=%d guid=%s %s\n", contextName(s.Context), s.ID, s.GUID, s.Subject)
	}
	counts := make(map[string]int)
	for _, sc := range fixture.Scenarios {
		counts[sc.Topic]++
	}
	for topic, n := range counts {
		fmt.Printf("%s%s: %d records\n", topicPrefix, topic, n)
	}
	return nil
}

func contextName(schemaContext string) string {
	if schemaContext == schemaseed.ContextDefault {
		return "."
	}
	return schemaContext
}
