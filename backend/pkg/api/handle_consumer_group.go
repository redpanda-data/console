package api

import (
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kafka-owl/pkg/owl"
)

// GetConsumerGroupsResponse represents the data which is returned for listing topics
type GetConsumerGroupsResponse struct {
	ConsumerGroups []*owl.ConsumerGroupOverview `json:"consumerGroups"`
}

func (api *API) handleGetConsumerGroups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		describedGroups, err := api.OwlSvc.GetConsumerGroupsOverview(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not describe consumer groups in the Kafka cluster",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := GetConsumerGroupsResponse{
			ConsumerGroups: describedGroups,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
