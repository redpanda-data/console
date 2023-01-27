// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import "fmt"

// ClusterFeature is an enum representing features that can be enabled
// in a Kafka connect cluster.
type ClusterFeature int8

const (
	// ClusterFeatureUnknown is the default enum.
	ClusterFeatureUnknown ClusterFeature = iota

	// ClusterFeatureSecretStore is a feature that allows clusters to load sensitive
	// configurations from a secret store such as AWS or GCPs secret store. If this feature
	// is returned, the Frontend application will try to create a secret for all sensitive
	// connector configurations.
	ClusterFeatureSecretStore
)

func (c ClusterFeature) String() string {
	switch c {
	default:
		return "UNKNOWN"
	case ClusterFeatureSecretStore:
		return "SECRET_STORE"
	}
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (c *ClusterFeature) UnmarshalText(text []byte) error {
	v, err := ParseClusterFeature(string(text))
	*c = v
	return err
}

// MarshalText implements encoding.TextMarshaler.
func (c ClusterFeature) MarshalText() ([]byte, error) {
	return []byte(c.String()), nil
}

// ParseClusterFeature normalizes the input s and returns
// the value represented by the string.
func ParseClusterFeature(s string) (ClusterFeature, error) {
	switch s {
	case "SECRET_STORE":
		return ClusterFeatureSecretStore, nil
	default:
		return ClusterFeatureUnknown, fmt.Errorf("ClusterFeature: unable to parse %q", s)
	}
}
