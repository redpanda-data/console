package api

import (
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/go-chi/chi"
	"go.uber.org/zap"
	"net/http"
)

// handleGetTopicDocumentation returns the respective topic documentation from the git repository
func (api *API) handleGetTopicDocumentation() http.HandlerFunc {
	type response struct {
		TopicName     string                  `json:"topicName"`
		Documentation *owl.TopicDocumentation `json:"documentation"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))

		doc := api.OwlSvc.GetTopicDocumentation(topicName)

		rest.SendResponse(w, r, logger, http.StatusOK, &response{
			TopicName:     topicName,
			Documentation: doc,
		})
	}
}
