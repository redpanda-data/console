package api

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/connect"
	"github.com/go-chi/chi"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"net/http"
	"time"

	"github.com/cloudhut/common/rest"
)

func (api *API) handleGetClusters() http.HandlerFunc {
	type response struct {
		ClusterShards []connect.GetClusterShard `json:"clusterShards"`
		// Filtered describes the number of filtered clusters due to missing Kowl Business permissions
		FilteredClusters int `json:"filtered"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		filteredShards := make([]connect.GetClusterShard, 0)
		filteredClusters := 0
		clusters := api.ConnectSvc.GetClusters(ctx)
		for _, cluster := range clusters {
			clusterName := cluster.ClusterName
			canSee, restErr := api.Hooks.Owl.CanViewConnectCluster(r.Context(), clusterName)
			if restErr != nil {
				api.Logger.Error("failed to check view connect cluster permissions", zap.Error(restErr.Err))
			}
			if !canSee {
				filteredClusters += 1
				continue
			}
			filteredShards = append(filteredShards, cluster)
		}

		res := response{
			ClusterShards:    filteredShards,
			FilteredClusters: filteredClusters,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetConnectors() http.HandlerFunc {
	type responseFilterStats struct {
		ClusterCount   int `json:"clusterCount"`
		ConnectorCount int `json:"connectorCount"`
	}
	type response struct {
		ConnectorShards []connect.GetConnectorsShard `json:"connectorShards"`
		// Filtered describes the number of filtered clusters or connectors due to missing Kowl Business permissions
		Filtered responseFilterStats `json:"filtered"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		filteredShards := make([]connect.GetConnectorsShard, 0)
		filteredClusters := 0
		filteredConnectors := 0
		connectors := api.ConnectSvc.GetConnectors(ctx)
		for _, connector := range connectors {
			clusterName := connector.ClusterName
			canSee, restErr := api.Hooks.Owl.CanViewConnectCluster(r.Context(), clusterName)
			if restErr != nil {
				api.Logger.Error("failed to check view connect cluster permissions", zap.Error(restErr.Err))
			}
			if !canSee {
				filteredClusters += 1
				filteredConnectors += len(connector.Connectors)
				continue
			}
			filteredShards = append(filteredShards, connector)
		}

		res := response{
			ConnectorShards: filteredShards,
			Filtered: responseFilterStats{
				ClusterCount:   filteredClusters,
				ConnectorCount: filteredConnectors,
			},
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}

func (api *API) handleGetClusterConnectors() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canSee, restErr := api.Hooks.Owl.CanViewConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canSee {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to view this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to view connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		connectors, restErr := api.ConnectSvc.GetClusterConnectors(ctx, clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectors)
	}
}

func (api *API) handleGetConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canSee, restErr := api.Hooks.Owl.CanViewConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canSee {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to view this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to view connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		connectorInfo, restErr := api.ConnectSvc.GetConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectorInfo)
	}
}

func (api *API) handleDeleteConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canDelete, restErr := api.Hooks.Owl.CanDeleteConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canDelete {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to delete in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to delete connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.DeleteConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handlePauseConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.PauseConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleResumeConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.ResumeConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}

func (api *API) handleRestartConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		canEdit, restErr := api.Hooks.Owl.CanEditConnectCluster(r.Context(), clusterName)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !canEdit {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:          fmt.Errorf("requester has no permissions to edit in this connect cluster"),
				Status:       http.StatusForbidden,
				Message:      "You don't have permissions to edit connectors in this Kafka connect cluster",
				InternalLogs: []zapcore.Field{zap.String("cluster_name", clusterName)},
				IsSilent:     false,
			})
			return
		}

		restErr = api.ConnectSvc.RestartConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
