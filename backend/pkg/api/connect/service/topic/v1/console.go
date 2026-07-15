// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package topic

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/api/pagination"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

var _ consolev1alpha1connect.TopicServiceHandler = (*ConsoleService)(nil)

// ConsoleService is the Console-facing implementation of the topic service.
//
// Unlike the other Console services it does not wrap the dataplane handler: the dataplane
// ListTopics deliberately returns only cheap metadata, whereas the Console topic list also renders
// cleanup policy and on-disk size. Those come from console.GetTopicsOverview, which fans out a
// DescribeLogDirs request to every broker — a cost the public dataplane API should not pay.
type ConsoleService struct {
	logger     *slog.Logger
	consoleSvc console.Servicer
	mapper     consoleMapper
	defaulter  defaulter
}

// NewConsoleService creates a new ConsoleService.
func NewConsoleService(logger *slog.Logger, consoleSvc console.Servicer) *ConsoleService {
	return &ConsoleService{
		logger:     logger,
		consoleSvc: consoleSvc,
		mapper:     consoleMapper{},
		defaulter:  defaulter{},
	}
}

// ListTopics lists Kafka topics along with the metadata the Console topic list renders.
func (s *ConsoleService) ListTopics(ctx context.Context, req *connect.Request[v1alpha1.ListTopicsRequest]) (*connect.Response[v1alpha1.ListTopicsResponse], error) {
	dataplaneReq := req.Msg.GetRequest()
	if dataplaneReq == nil {
		dataplaneReq = &v1.ListTopicsRequest{}
	}
	s.defaulter.applyListTopicsRequest(dataplaneReq)

	topicSummaries, err := s.consoleSvc.GetTopicsOverview(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1.Reason_REASON_KAFKA_API_ERROR.String(), apierrors.KeyValsFromKafkaError(err)...),
		)
	}

	if nameContains := dataplaneReq.GetFilter().GetNameContains(); nameContains != "" {
		filteredTopics := make([]*console.TopicSummary, 0, len(topicSummaries))
		for _, topic := range topicSummaries {
			if strings.Contains(topic.TopicName, nameContains) {
				filteredTopics = append(filteredTopics, topic)
			}
		}
		topicSummaries = filteredTopics
	}

	topics := s.mapper.topicSummariesToProto(topicSummaries)

	var nextPageToken string
	if dataplaneReq.GetPageSize() > 0 {
		sort.SliceStable(topics, func(i, j int) bool {
			return topics[i].GetName() < topics[j].GetName()
		})
		page, token, err := pagination.SliceToPaginatedWithToken(topics, int(dataplaneReq.GetPageSize()), dataplaneReq.GetPageToken(), "name", func(x *v1alpha1.ListTopicsResponse_Topic) string {
			return x.GetName()
		})
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		topics = page
		nextPageToken = token
	}

	return connect.NewResponse(&v1alpha1.ListTopicsResponse{Topics: topics, NextPageToken: nextPageToken}), nil
}
