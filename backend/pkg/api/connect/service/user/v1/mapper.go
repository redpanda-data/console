// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package user

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kadm"

	dataplanev1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

// saslMechanismToScramMechanism converts the proto SASL Mechanism enum to a kadm ScramMechanism.
func saslMechanismToScramMechanism(mechanism dataplanev1.SASLMechanism) (kadm.ScramMechanism, error) {
	switch mechanism {
	case dataplanev1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256:
		return kadm.ScramSha256, nil
	case dataplanev1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512:
		return kadm.ScramSha512, nil
	default:
		return 0, fmt.Errorf("unsupported SASL mechanism: %q", mechanism.String())
	}
}

// scramMechanismToProto converts a kadm ScramMechanism to the proto SASL Mechanism enum.
func scramMechanismToProto(mechanism kadm.ScramMechanism) *dataplanev1.SASLMechanism {
	switch mechanism {
	case kadm.ScramSha256:
		m := dataplanev1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256
		return &m
	case kadm.ScramSha512:
		m := dataplanev1.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_512
		return &m
	default:
		return nil
	}
}
