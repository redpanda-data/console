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
)

// IncrementalAlterConfigsResourceResponse is the response to changing Kafka configurations
// via the Kafka API.
type IncrementalAlterConfigsResourceResponse struct {
	Error        string `json:"error,omitempty"`
	ResourceName string `json:"resourceName"`
	ResourceType int8   `json:"resourceType"`
}

// IncrementalAlterConfigs alters the configuration of a Kafka resource (broker/topic/...)
// via the Kafka API.
func (s *Service) IncrementalAlterConfigs(ctx context.Context,
	alterConfigs []kmsg.IncrementalAlterConfigsRequestResource,
) ([]IncrementalAlterConfigsResourceResponse, *rest.Error) {
	configRes, err := s.kafkaSvc.IncrementalAlterConfigs(ctx, alterConfigs)
	if err != nil {
		return nil, &rest.Error{
			Err:      err,
			Status:   http.StatusServiceUnavailable,
			Message:  fmt.Sprintf("Incremental Alter Config request has failed: %v", err.Error()),
			IsSilent: false,
		}
	}

	patchedConfigs := make([]IncrementalAlterConfigsResourceResponse, len(configRes.Resources))
	for i, res := range configRes.Resources {
		errMessage := ""
		err := kerr.ErrorForCode(res.ErrorCode)
		if err != nil {
			errMessage = err.Error()
		}
		patchedConfigs[i] = IncrementalAlterConfigsResourceResponse{
			Error:        errMessage,
			ResourceName: res.ResourceName,
			ResourceType: int8(res.ResourceType),
		}
	}

	return patchedConfigs, nil
}
