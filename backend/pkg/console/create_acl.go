// Copyright 2022 Redpanda Data, Inc.
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
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// CreateACL creates an ACL resource in your target Kafka cluster.
func (s *Service) CreateACL(ctx context.Context, createReq kmsg.CreateACLsRequestCreation) *rest.Error {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return errorToRestError(err)
	}

	req := kmsg.NewCreateACLsRequest()
	req.Creations = []kmsg.CreateACLsRequestCreation{createReq}
	res, err := req.RequestWith(ctx, cl)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to execute create ACL command: %v", err.Error()),
			InternalLogs: []slog.Attr{slog.Any("create_acl_req", createReq)},
			IsSilent:     false,
		}
	}

	if len(res.Results) != 1 {
		return &rest.Error{
			Err:          errors.New("unexpected number of results in create ACL response"),
			Status:       http.StatusInternalServerError,
			Message:      fmt.Sprintf("Failed to execute delete topic command: %v", err.Error()),
			InternalLogs: []slog.Attr{slog.Int("results_length", len(res.Results))},
			IsSilent:     false,
		}
	}

	aclRes := res.Results[0]
	err = kerr.ErrorForCode(aclRes.ErrorCode)
	if err != nil {
		return &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to execute create ACL command: %v", err.Error()),
			InternalLogs: []slog.Attr{slog.Any("create_acl_req", createReq)},
			IsSilent:     false,
		}
	}

	return nil
}

// CreateACLs proxies the request/response to CreateACLs via the Kafka API.
func (s *Service) CreateACLs(ctx context.Context, req *kmsg.CreateACLsRequest) (*kmsg.CreateACLsResponse, error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return nil, err
	}
	return req.RequestWith(ctx, cl)
}
