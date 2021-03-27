package api

import (
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/go-chi/chi"
	"net/http"
	"strconv"
)

func (api *API) handleBrokerConfig() http.HandlerFunc {
	type response struct {
		BrokerConfigs []owl.BrokerConfigEntry `json:"brokerConfigs"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse broker ID parameter and validate input
		brokerIDStr := chi.URLParam(r, "brokerID")
		if brokerIDStr == "" || len(brokerIDStr) > 10 {
			restErr := &rest.Error{
				Err:      fmt.Errorf("broker id in URL not set"),
				Status:   http.StatusBadRequest,
				Message:  "Broker ID must be set and no longer than 10 characters",
				IsSilent: true,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		brokerID, err := strconv.Atoi(brokerIDStr)
		if err != nil {
			restErr := &rest.Error{
				Err:      fmt.Errorf("broker id in URL not set"),
				Status:   http.StatusBadRequest,
				Message:  "Broker ID must be a valid int32",
				IsSilent: true,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		cfgs, restErr := api.OwlSvc.GetBrokerConfig(r.Context(), int32(brokerID))
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		response := response{
			BrokerConfigs: cfgs,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}
