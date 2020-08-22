package api

import (
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/go-chi/chi"
	"go.uber.org/zap"
	"net/http"
)

// handleGetPartitions returns an overview of all partitions and their watermarks in the given topic
func (api *API) handleGetTopicDocumentation() http.HandlerFunc {
	type response struct {
		TopicName     string                  `json:"topicName"`
		Documentation *owl.TopicDocumentation `json:"documentation"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))

		doc, err := api.OwlSvc.GetTopicDocumentation(topicName)
		// TODO: 404
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic documentation for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		rest.SendResponse(w, r, logger, http.StatusOK, &response{
			TopicName:     topicName,
			Documentation: doc,
		})
	}
}
