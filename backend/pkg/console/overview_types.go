// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"bytes"
	"errors"
	"fmt"
)

// OverviewStatus provides status information that indicate whether a service
// is a healthy or not. If it is not healthy, we add a reason why we think
// it is not healthy.
type OverviewStatus struct {
	Status       StatusType `json:"status"`
	StatusReason string     `json:"statusReason,omitempty"`
}

// SetStatus sets a status along with the provided reason. The status
// will only be applied if it's worse than the currently stored status.
func (o *OverviewStatus) SetStatus(status StatusType, reason string) {
	// Set a new status, if this status is worse than the currently stored status.
	if status > o.Status {
		o.Status = status
		o.StatusReason = reason
	}
}

// StatusType is an enum describing the health for an upstream service
// we are connected to.
//
// When adding new status types, make sure that the status iota is ordered
// by healthiness (1 = healthiest; n = unhealthiest), as this is used in
// OverviewStatus.SetStatus.
type StatusType int8

const (
	// StatusTypeUnset is the default status, which however should never be returned.
	StatusTypeUnset = iota
	// StatusTypeHealthy is the status if the target system is running as expected.
	StatusTypeHealthy
	// StatusTypeDegraded represents the status if something is wrong (e.g. one broker down),
	// but the system is still fully functioning.
	StatusTypeDegraded
	// StatusTypeUnhealthy is when the target system is either unreachable or not
	// fully operable anymore.
	StatusTypeUnhealthy
)

// MarshalText implements encoding.TextMarshaler.
func (s StatusType) MarshalText() ([]byte, error) {
	switch s {
	case StatusTypeUnset:
		return []byte(""), nil
	case StatusTypeHealthy:
		return []byte("HEALTHY"), nil
	case StatusTypeDegraded:
		return []byte("DEGRADED"), nil
	case StatusTypeUnhealthy:
		return []byte("UNHEALTHY"), nil
	default:
		return nil, errors.New("unknown status")
	}
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (s *StatusType) UnmarshalText(text []byte) error {
	switch string(bytes.ToUpper(text)) {
	case "":
		*s = StatusTypeUnset
	case "HEALTHY":
		*s = StatusTypeHealthy
	case "DEGRADED":
		*s = StatusTypeDegraded
	case "UNHEALTHY":
		*s = StatusTypeUnhealthy
	default:
		return fmt.Errorf("unknown overview status %q", text)
	}
	return nil
}

// KafkaDistribution is an enum describing what software (Redpanda, Apache Kafka, ...)
// implements the Kafka API.
type KafkaDistribution int8

const (
	// KafkaDistributionUnknown is the default distribution, which however should never be returned.
	KafkaDistributionUnknown = iota
	// KafkaDistributionApacheKafka is the distribution we return if we assume it's an Apache Kafka implementation.
	KafkaDistributionApacheKafka = iota
	// KafkaDistributionRedpanda is the Redpanda distribution.
	KafkaDistributionRedpanda = iota
)

// MarshalText implements encoding.TextMarshaler.
func (d KafkaDistribution) MarshalText() ([]byte, error) {
	switch d {
	case KafkaDistributionUnknown:
		return []byte(""), nil
	case KafkaDistributionApacheKafka:
		return []byte("APACHE_KAFKA"), nil
	case KafkaDistributionRedpanda:
		return []byte("REDPANDA"), nil
	default:
		return nil, errors.New("unknown distribution")
	}
}

// UnmarshalText implements encoding.TextUnmarshaler.
func (d *KafkaDistribution) UnmarshalText(text []byte) error {
	switch string(bytes.ToUpper(text)) {
	case "":
		*d = KafkaDistributionUnknown
	case "APACHE_KAFKA":
		*d = KafkaDistributionApacheKafka
	case "REDPANDA":
		*d = KafkaDistributionRedpanda
	default:
		return fmt.Errorf("unknown kafka distribution %q", text)
	}
	return nil
}
