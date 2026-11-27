// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redpanda-data/console/backend/pkg/testutil/schemaseed"
)

var registrySerdes = map[string]bool{
	string(PayloadEncodingJSONSchema):     true,
	string(PayloadEncodingAvro):           true,
	string(PayloadEncodingProtobufSchema): true,
}

func TestService_SchemaLocators(t *testing.T) {
	fixture, registry, err := schemaseed.Fake()
	require.NoError(t, err)
	defer registry.Close()

	svc := newSchemaContextTestService(t, registry.URL())

	perTopic := make(map[string]int)
	for _, sc := range fixture.Scenarios {
		dr := svc.DeserializeRecord(t.Context(), sc.Record, DeserializationOptions{
			SchemaContext: sc.TopicContext,
			Troubleshoot:  true,
		})
		name := locatorTestName(sc, perTopic[sc.Topic])
		perTopic[sc.Topic]++
		t.Run(name, func(t *testing.T) {
			assertLocatorWant(t, "key", sc.Key, dr.Key)
			assertLocatorWant(t, "value", sc.Value, dr.Value)
		})
	}
}

// locatorTestName names the subtest of a scenario: its topic, its number in
// the topic, and its name.
func locatorTestName(sc schemaseed.Scenario, n int) string {
	return fmt.Sprintf("%s/%02d %s", sc.Topic, n, sc.Name)
}

// assertLocatorWant compares a decoded key or value with its correct result.
func assertLocatorWant(t *testing.T, label string, want schemaseed.Want, got *RecordPayload) {
	t.Helper()

	if want.WrongSchema {
		return
	}

	if want.Error != "" {
		var messages []string
		for _, ts := range got.Troubleshooting {
			if registrySerdes[ts.SerdeName] {
				messages = append(messages, strings.ToLower(ts.Message))
			}
		}
		assert.Contains(t, strings.Join(messages, "\n"), strings.ToLower(want.Error), "%s troubleshooting", label)
		return
	}
	if want.Encoding == "" {
		return
	}

	assert.Equal(t, want.Encoding, string(got.Encoding), "%s encoding", label)
	if want.SchemaID == 0 {
		assert.Nil(t, got.SchemaID, "%s schema ID", label)
	} else if assert.NotNil(t, got.SchemaID, "%s schema ID", label) {
		assert.Equal(t, uint32(want.SchemaID), *got.SchemaID, "%s schema ID", label)
	}
	if want.JSON != "" {
		assert.JSONEq(t, want.JSON, string(got.NormalizedPayload), "%s payload", label)
	}
	assert.Equal(t, want.Location, string(got.SchemaIDLocation), "%s schema ID location", label)
	assert.Equal(t, want.Context, got.SchemaContext, "%s schema context", label)
	assert.Equal(t, want.GUID, got.SchemaGUID, "%s schema GUID", label)
}
