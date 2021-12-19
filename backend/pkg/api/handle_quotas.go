package api

import (
	"github.com/cloudhut/common/rest"
	"net/http"
)

func (api *API) handleGetQuotas() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		quotas := api.OwlSvc.DescribeQuotas(r.Context())
		rest.SendResponse(w, r, api.Logger, http.StatusOK, quotas)
	}
}
