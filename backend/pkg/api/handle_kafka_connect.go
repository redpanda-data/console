package api

import (
	"context"
	"github.com/go-chi/chi"
	"net/http"
	"time"

	"github.com/cloudhut/common/rest"
)

func (api *API) handleGetConnectors() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		// TODO: Add Hook
		connectors := api.ConnectSvc.GetConnectors(ctx)

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectors)
	}
}

func (api *API) handleGetConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		// TODO: Add hook
		connectors, restErr := api.ConnectSvc.GetConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectors)
	}
}

func (api *API) handleDeleteConnector() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := chi.URLParam(r, "clusterName")
		connector := chi.URLParam(r, "connector")

		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()

		// TODO: Add hook
		restErr := api.ConnectSvc.DeleteConnector(ctx, clusterName, connector)
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

		// TODO: Add hook
		restErr := api.ConnectSvc.PauseConnector(ctx, clusterName, connector)
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

		// TODO: Add hook
		restErr := api.ConnectSvc.ResumeConnector(ctx, clusterName, connector)
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

		// TODO: Add hook
		restErr := api.ConnectSvc.RestartConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, nil)
	}
}
