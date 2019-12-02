package api

import (
	"net/http"

	"github.com/kafka-owl/kafka-owl/pkg/common/rest"
	"github.com/kafka-owl/kafka-owl/pkg/owl"
)

// GetConsumerGroupsResponse represents the data which is returned for listing topics
type GetConsumerGroupsResponse struct {
	ConsumerGroups []*owl.ConsumerGroupOverview `json:"consumerGroups"`
}

func (api *API) handleGetConsumerGroups() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		describedGroups, err := api.OwlSvc.GetConsumerGroupsOverview(r.Context())
		if err != nil {
			rerr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not describe consumer groups in the Kafka cluster",
				IsSilent: false,
			}
			api.RestHelper.SendRESTError(w, r, rerr)
			return
		}

		response := GetConsumerGroupsResponse{
			ConsumerGroups: describedGroups,
		}
		api.RestHelper.SendResponse(w, r, http.StatusOK, response)
	}
}
