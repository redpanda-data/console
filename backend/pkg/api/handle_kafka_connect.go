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

		connectors, restErr := api.ConnectSvc.GetConnector(ctx, clusterName, connector)
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		rest.SendResponse(w, r, api.Logger, http.StatusOK, connectors)
	}
}
