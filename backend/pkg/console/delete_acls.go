// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// DeleteACLsResponse is the response to deleting ACL resources.
type DeleteACLsResponse struct {
	ErrorMessages []string `json:"errorMessage"`
	MatchedACLs   int      `json:"matchedACLs"`
	DeletedACLs   int      `json:"deletedACLs"`
}

// DeleteACLs deletes Kafka ACLs based on a given filter.
func (s *Service) DeleteACLs(ctx context.Context, filter kmsg.DeleteACLsRequestFilter) (DeleteACLsResponse, *rest.Error) {
	req := kmsg.NewDeleteACLsRequest()
	req.Filters = []kmsg.DeleteACLsRequestFilter{filter}

	res, err := s.kafkaSvc.DeleteACLs(ctx, &req)
	if err != nil {
		return DeleteACLsResponse{}, &rest.Error{
			Err:          err,
			Status:       http.StatusServiceUnavailable,
			Message:      fmt.Sprintf("Failed to execute delete topic command: %v", err.Error()),
			InternalLogs: []zapcore.Field{zap.Any("delete_acl_req", filter)},
			IsSilent:     false,
		}
	}

	deleteAclsRes := DeleteACLsResponse{
		ErrorMessages: make([]string, 0),
		MatchedACLs:   0,
		DeletedACLs:   0,
	}
	for _, aclRes := range res.Results {
		err = kerr.ErrorForCode(aclRes.ErrorCode)
		if err != nil {
			return DeleteACLsResponse{}, &rest.Error{
				Err:          err,
				Status:       http.StatusServiceUnavailable,
				Message:      fmt.Sprintf("Failed to delete Kafka ACL: %v", err.Error()),
				InternalLogs: []zapcore.Field{zap.Any("delete_acl_req", filter)},
				IsSilent:     false,
			}
		}

		for _, item := range aclRes.MatchingACLs {
			deleteAclsRes.MatchedACLs++
			err = kerr.ErrorForCode(item.ErrorCode)
			if err != nil {
				deleteAclsRes.ErrorMessages = append(deleteAclsRes.ErrorMessages, err.Error())
				continue
			}
			deleteAclsRes.DeletedACLs++
		}
	}

	return deleteAclsRes, nil
}

// DeleteACLsKafka proxies the request/response via the Kafka API.
func (s *Service) DeleteACLsKafka(ctx context.Context, req kmsg.DeleteACLsRequest) (*kmsg.DeleteACLsResponse, error) {
	return s.kafkaSvc.DeleteACLs(ctx, &req)
}
