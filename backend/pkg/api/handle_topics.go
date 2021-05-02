package api

import (
	_ "context"
	"fmt"
	"go.uber.org/zap/zapcore"
	"net/http"
	"strconv"
	"strings"
	_ "time"

	"go.uber.org/zap"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/go-chi/chi"
)

func (api *API) handleGetTopics() http.HandlerFunc {
	type response struct {
		Topics []*owl.TopicSummary `json:"topics"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topics, err := api.OwlSvc.GetTopicsOverview(r.Context())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topics from Kafka cluster",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		visibleTopics := make([]*owl.TopicSummary, 0, len(topics))
		for _, topic := range topics {
			// Check if logged in user is allowed to see this topic. If not remove the topic from the list.
			canSee, restErr := api.Hooks.Owl.CanSeeTopic(r.Context(), topic.TopicName)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}

			if canSee {
				visibleTopics = append(visibleTopics, topic)
			}

			// Attach allowed actions for each topic
			topic.AllowedActions, restErr = api.Hooks.Owl.AllowedTopicActions(r.Context(), topic.TopicName)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
		}

		response := response{
			Topics: visibleTopics,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, response)
	}
}

// handleGetPartitions returns an overview of all partitions and their watermarks in the given topic
func (api *API) handleGetPartitions() http.HandlerFunc {
	type response struct {
		TopicName  string                      `json:"topicName"`
		Partitions []owl.TopicPartitionDetails `json:"partitions"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))

		// Check if logged in user is allowed to view partitions for the given topic
		canView, restErr := api.Hooks.Owl.CanViewTopicPartitions(r.Context(), topicName)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view partitions for the requested topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view partitions for that topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		topicDetails, restErr := api.OwlSvc.GetTopicDetails(r.Context(), []string{topicName})
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		if len(topicDetails) != 1 {
			restErr := &rest.Error{
				Err:      fmt.Errorf("expected exactly one topic detail in response, but got '%d'", len(topicDetails)),
				Status:   http.StatusInternalServerError,
				Message:  "Internal server error in Kowl, please file a issue in GitHub if you face this issue. The backend logs will contain more information.",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicName:  topicName,
			Partitions: topicDetails[0].Partitions,
		}
		rest.SendResponse(w, r, logger, http.StatusOK, res)
	}
}

// handleGetTopicConfig returns all set configuration options for a specific topic
func (api *API) handleGetTopicConfig() http.HandlerFunc {
	type response struct {
		TopicDescription *owl.TopicConfig `json:"topicDescription"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))

		// Check if logged in user is allowed to view partitions for the given topic
		canView, restErr := api.Hooks.Owl.CanViewTopicConfig(r.Context(), topicName)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view config for the requested topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view the config for that topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		description, restErr := api.OwlSvc.GetTopicConfigs(r.Context(), topicName, nil)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicDescription: description,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

// handleGetTopicsConfigs returns all set configuration options for one or more topics
func (api *API) handleGetTopicsConfigs() http.HandlerFunc {
	type response struct {
		TopicDescriptions []*owl.TopicConfig `json:"topicDescriptions"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse optional filters. If no filter is set they will be treated as wildcards
		var topicNames []string
		requestedTopicNames := r.URL.Query().Get("topicNames")
		if requestedTopicNames != "" {
			topicNames = strings.Split(requestedTopicNames, ",")
		}

		var configKeys []string
		requestedConfigKeys := r.URL.Query().Get("configKeys")
		if requestedConfigKeys != "" {
			configKeys = strings.Split(requestedConfigKeys, ",")
		}

		logger := api.Logger.With(zap.Int("topics_length", len(topicNames)), zap.Int("config_keys_length", len(configKeys)))

		// 2. Fetch all topic names from metadata as no topic filter has been specified
		if len(topicNames) == 0 {
			var err error
			topicNames, err = api.OwlSvc.GetAllTopicNames(r.Context(), nil)
			if err != nil {
				restErr := &rest.Error{
					Err:      fmt.Errorf("failed to request metadata to fetch topic names: %w", err),
					Status:   http.StatusForbidden,
					Message:  fmt.Sprintf("Failed to fetch metadata from brokers to fetch topicNames '%v'", err.Error()),
					IsSilent: false,
				}
				rest.SendRESTError(w, r, logger, restErr)
				return
			}
		}

		// 3. Check if user is allowed to view the config for these topics
		for _, topicName := range topicNames {
			canView, restErr := api.Hooks.Owl.CanViewTopicConfig(r.Context(), topicName)
			if restErr != nil {
				rest.SendRESTError(w, r, logger, restErr)
				return
			}
			if !canView {
				restErr := &rest.Error{
					Err:      fmt.Errorf("requester has no permissions to view config for one of the requested topics"),
					Status:   http.StatusForbidden,
					Message:  fmt.Sprintf("You don't have permissions to view the config for topic '%v'", topicName),
					IsSilent: false,
				}
				rest.SendRESTError(w, r, logger, restErr)
				return
			}
		}

		// 4. Request topics configs and return them
		descriptions, err := api.OwlSvc.GetTopicsConfigs(r.Context(), topicNames, configKeys)
		if err != nil {
			restErr := &rest.Error{
				Err:      fmt.Errorf("failed to describe topic configs: %w", err),
				Status:   http.StatusServiceUnavailable,
				Message:  fmt.Sprintf("Failed to describe topic configs '%v'", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		result := make([]*owl.TopicConfig, 0, len(descriptions))
		for _, description := range descriptions {
			result = append(result, description)
		}

		res := response{
			TopicDescriptions: result,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

// handleGetTopicConsumers returns all consumers along with their summed lag which consume the given topic
func (api *API) handleGetTopicConsumers() http.HandlerFunc {
	type response struct {
		TopicName string                    `json:"topicName"`
		Consumers []*owl.TopicConsumerGroup `json:"topicConsumers"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		topicName := chi.URLParam(r, "topicName")
		logger := api.Logger.With(zap.String("topic_name", topicName))

		// Check if logged in user is allowed to view partitions for the given topic
		canView, restErr := api.Hooks.Owl.CanViewTopicConsumers(r.Context(), topicName)
		if restErr != nil {
			rest.SendRESTError(w, r, logger, restErr)
			return
		}
		if !canView {
			restErr := &rest.Error{
				Err:      fmt.Errorf("requester has no permissions to view topic consumers for the requested topic"),
				Status:   http.StatusForbidden,
				Message:  "You don't have permissions to view the config for that topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		consumers, err := api.OwlSvc.ListTopicConsumers(r.Context(), topicName)
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list topic consumers for requested topic",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, logger, restErr)
			return
		}

		res := response{
			TopicName: topicName,
			Consumers: consumers,
		}
		rest.SendResponse(w, r, logger, http.StatusOK, res)
	}
}

func (api *API) handleGetTopicsOffsets() http.HandlerFunc {
	type response struct {
		TopicOffsets []owl.TopicOffset `json:"topicOffsets"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// 1. Parse topic names and timestamp from URL. It's a list of topic names that is comma separated
		requestedTopicNames := r.URL.Query().Get("topicNames")
		if requestedTopicNames == "" {
			restErr := &rest.Error{
				Err:      fmt.Errorf("required parameter topicNames is missing"),
				Status:   http.StatusBadRequest,
				Message:  "Required parameter topicNames is missing",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		topicNames := strings.Split(requestedTopicNames, ",")

		timestampStr := r.URL.Query().Get("timestamp")
		if timestampStr == "" {
			restErr := &rest.Error{
				Err:      fmt.Errorf("required parameter timestamp is missing"),
				Status:   http.StatusBadRequest,
				Message:  "Required parameter timestamp is missing",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		timestamp, err := strconv.Atoi(timestampStr)
		if err != nil {
			restErr := &rest.Error{
				Err:      fmt.Errorf("timestamp parameter must be a valid int"),
				Status:   http.StatusBadRequest,
				Message:  "Timestamp parameter must be a valid int",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// 2. Check if logged in user is allowed list partitions (always true for Kowl, but not for Kowl Business)
		for _, topic := range topicNames {
			canView, restErr := api.Hooks.Owl.CanViewTopicPartitions(r.Context(), topic)
			if restErr != nil {
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}

			if !canView {
				restErr := &rest.Error{
					Err:          fmt.Errorf("requester has no permissions to view partitions for the requested topic"),
					Status:       http.StatusForbidden,
					Message:      "You don't have permissions to view partitions for that topic",
					IsSilent:     false,
					InternalLogs: []zapcore.Field{zap.String("topic_name", topic)},
				}
				rest.SendRESTError(w, r, api.Logger, restErr)
				return
			}
		}

		// 3. Request topic
		topicOffsets, err := api.OwlSvc.ListOffsets(r.Context(), topicNames, int64(timestamp))
		if err != nil {
			restErr := &rest.Error{
				Err:      fmt.Errorf("failed to list offsets: %w", err),
				Status:   http.StatusForbidden,
				Message:  fmt.Sprintf("Failed to list offsets from Kafka: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{
			TopicOffsets: topicOffsets,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
