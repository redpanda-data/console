// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func TestNewKafkaErrorWithDynamicMessage(t *testing.T) {
	tests := []struct {
		name       string
		code       int16
		msg        *string
		validateFn func(*testing.T, error)
	}{
		{
			name: "Code 0 with nil message",
			code: 0,
			msg:  nil,
			validateFn: func(t *testing.T, err error) {
				assert.Nil(t, err)
			},
		},
		{
			name: "INVALID_PARTITIONS error with dynamic error message",
			code: kerr.InvalidPartitions.Code,
			msg:  kmsg.StringPtr("unable to create topic with 100000 partitions due to hardware constraints"),
			validateFn: func(t *testing.T, err error) {
				require.NotNil(t, err)
				expectedErrMsg := fmt.Sprintf("%s: unable to create topic with 100000 partitions due to hardware constraints", kerr.InvalidPartitions.Message)
				assert.Equal(t, expectedErrMsg, err.Error())
				assert.True(t, errors.Is(err, kerr.InvalidPartitions))
				assert.False(t, errors.Is(err, kerr.ReplicaNotAvailable))
			},
		},
		{
			name: "INVALID_PARTITIONS error without dynamic error message",
			code: kerr.InvalidPartitions.Code,
			msg:  nil,
			validateFn: func(t *testing.T, err error) {
				require.NotNil(t, err)
				assert.Equal(t, kerr.InvalidPartitions.Error(), err.Error())
				assert.True(t, errors.Is(err, kerr.InvalidPartitions))
				assert.False(t, errors.Is(err, kerr.ReplicaNotAvailable))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := newKafkaErrorWithDynamicMessage(tt.code, tt.msg)
			tt.validateFn(t, err)
		})
	}
}
