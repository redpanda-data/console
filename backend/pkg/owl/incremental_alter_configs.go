package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"net/http"
)

type IncrementalAlterConfigsResourceResponse struct {
	Error        string `json:"error,omitempty"`
	ResourceName string `json:"resourceName"`
	ResourceType int8   `json:"resourceType"`
}

func (s *Service) IncrementalAlterConfigs(ctx context.Context,
	alterConfigs []kmsg.IncrementalAlterConfigsRequestResource) ([]IncrementalAlterConfigsResourceResponse, *rest.Error) {
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
