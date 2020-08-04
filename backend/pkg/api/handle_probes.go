package api

import (
	"github.com/cloudhut/common/rest"
	"net/http"
)

func (api *API) handleLivenessProbe() http.HandlerFunc {
	type response struct {
		IsHTTPOk bool `json:"isHttpOk"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		res := &response{
			IsHTTPOk: true,
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleStartupProbe() http.HandlerFunc {
	type response struct {
		IsHTTPOk  bool `json:"isHttpOk"`
		IsKafkaOk bool `json:"isKafkaOk"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// Check Kafka connectivity
		isKafkaOK := false
		err := api.KafkaSvc.IsHealthy()
		if err == nil {
			isKafkaOK = true
		}

		res := &response{
			IsHTTPOk:  true,
			IsKafkaOk: isKafkaOK,
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
