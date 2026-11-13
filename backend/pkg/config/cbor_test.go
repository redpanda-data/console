// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"testing"

	"github.com/go-viper/mapstructure/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSerde_SetDefaultsCborTopicName(t *testing.T) {
	var c Serde
	c.SetDefaults()

	require.NotNil(t, c.Cbor.TopicName.Regexp, "expected cbor topicName to default to a regex")
	assert.True(t, c.Cbor.TopicName.MatchString("any-topic"))
	assert.Equal(t, "/.*/", c.Cbor.TopicName.literal)
}

func TestSerde_CborTopicNameOverridesDefault(t *testing.T) {
	var c Serde
	c.SetDefaults()

	// Same decoder setup as LoadConfig.
	dec, err := mapstructure.NewDecoder(&mapstructure.DecoderConfig{
		DecodeHook:       mapstructure.TextUnmarshallerHookFunc(),
		Result:           &c,
		WeaklyTypedInput: true,
		TagName:          "yaml",
	})
	require.NoError(t, err)
	require.NoError(t, dec.Decode(map[string]any{
		"cbor": map[string]any{"enabled": true, "topicName": "orders"},
	}))

	assert.True(t, c.Cbor.Enabled)
	assert.Nil(t, c.Cbor.TopicName.Regexp, "a literal topicName must not keep the default regex")
	assert.Equal(t, "orders", c.Cbor.TopicName.literal)
}
