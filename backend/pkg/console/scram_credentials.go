// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"

	"github.com/twmb/franz-go/pkg/kadm"
)

// DefaultSCRAMIterations is the default number of PBKDF2 iterations for SCRAM credentials.
const DefaultSCRAMIterations = 4096

// DescribeUserSCRAMCredentials describes SCRAM credentials for the given users
// (or all users if none specified).
func (s *Service) DescribeUserSCRAMCredentials(ctx context.Context, users ...string) (kadm.DescribedUserSCRAMs, error) {
	_, admCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}
	return admCl.DescribeUserSCRAMs(ctx, users...)
}

// AlterUserSCRAMs upserts and/or deletes SCRAM credentials.
func (s *Service) AlterUserSCRAMs(ctx context.Context, del []kadm.DeleteSCRAM, upsert []kadm.UpsertSCRAM) (kadm.AlteredUserSCRAMs, error) {
	_, admCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}
	return admCl.AlterUserSCRAMs(ctx, del, upsert)
}
