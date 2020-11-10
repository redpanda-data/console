package api

import (
	"fmt"
	"github.com/Shopify/sarama"
	"github.com/gorilla/schema"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
)

type getAclsOverviewRequest struct {
	// The resource type.
	ResourceType int `schema:"resourceType"`

	// The resource name, or null to match any resource name.
	ResourceName *string `schema:"resourceName"`

	// The resource pattern to match.
	ResourcePatternTypeFilter int `schema:"resourcePatternTypeFilter"`

	// The principal to match, or null to match any principal.
	Principal *string `schema:"principal"`

	// The host to match, or null to match any host.
	Host *string `schema:"host"`

	// The operation to match.
	Operation int `schema:"operation"`

	// The permission type to match.
	PermissionType int `schema:"permissionType"`
}

func (g *getAclsOverviewRequest) OK() error {
	if g.ResourceType < 1 || g.ResourceType > int(sarama.AclResourceTransactionalID) {
		return fmt.Errorf("resourceType filter is out of bounds")
	}

	if g.ResourcePatternTypeFilter < 1 || g.ResourcePatternTypeFilter > int(sarama.AclPatternPrefixed) {
		return fmt.Errorf("resourcePatternTypeFilter is out of bounds")
	}

	if g.Operation < 1 || g.Operation > int(sarama.AclOperationIdempotentWrite) {
		return fmt.Errorf("operation filter is out of bounds")
	}

	if g.PermissionType < 1 || g.PermissionType > int(sarama.AclPermissionAllow) {
		return fmt.Errorf("permission type filter is out of bounds")
	}

	return nil
}

// ToSaramaFilter returns a sarama compatible request struct
func (g *getAclsOverviewRequest) ToSaramaFilter() sarama.AclFilter {
	return sarama.AclFilter{
		ResourceType:              sarama.AclResourceType(g.ResourceType),
		ResourceName:              g.ResourceName,
		ResourcePatternTypeFilter: sarama.AclResourcePatternType(g.ResourcePatternTypeFilter),
		Principal:                 g.Principal,
		Host:                      g.Host,
		Operation:                 sarama.AclOperation(g.Operation),
		PermissionType:            sarama.AclPermissionType(g.PermissionType),
	}
}

func (api *API) handleGetACLsOverview() http.HandlerFunc {
	// response represents the data which is returned for listing ACLs
	type response struct {
		AclResources []*owl.AclResource `json:"aclResources"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		// Parse request from url parameters
		decoder := schema.NewDecoder()
		req := &getAclsOverviewRequest{}
		err := decoder.Decode(req, r.URL.Query())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  "Failed to parse request parameters",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Validate parsed request
		err = req.OK()
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusBadRequest,
				Message:  fmt.Sprintf("Failed to validate request parameters: %v", err.Error()),
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		// Check if logged in user is allowed to list ACLs
		isAllowed, restErr := api.Hooks.Owl.CanListACLs(r.Context())
		if restErr != nil {
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}
		if !isAllowed {
			rest.SendRESTError(w, r, api.Logger, &rest.Error{
				Err:      fmt.Errorf("requester is not allowed to list ACLs"),
				Status:   http.StatusForbidden,
				Message:  "You are not allowed to list ACLs",
				IsSilent: true,
			})
			return
		}

		aclResources, err := api.OwlSvc.ListAllACLs(req.ToSaramaFilter())
		if err != nil {
			restErr := &rest.Error{
				Err:      err,
				Status:   http.StatusInternalServerError,
				Message:  "Could not list ACLs",
				IsSilent: false,
			}
			rest.SendRESTError(w, r, api.Logger, restErr)
			return
		}

		res := response{
			AclResources: aclResources,
		}
		rest.SendResponse(w, r, api.Logger, http.StatusOK, res)
	}
}
