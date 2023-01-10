// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"
)

// DeleteRecords requests deletion of all Kafka records in a given topic that have been
// produced after a certain partition offset. This can be used for truncating a topic.
func (s *Service) DeleteRecords(ctx context.Context, deleteReq kmsg.DeleteRecordsRequestTopic) (*kmsg.DeleteRecordsResponse, error) {
	req := kmsg.NewDeleteRecordsRequest()
	req.Topics = []kmsg.DeleteRecordsRequestTopic{deleteReq}

	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to delete records: %w", err)
	}

	return res, nil
}
