package api

import (
	"fmt"
	"github.com/gorilla/schema"
	"github.com/twmb/franz-go/pkg/kmsg"
	"net/http"

	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
)

type getAclsOverviewRequest struct {
	// The resource type.
	ResourceType int8 `schema:"resourceType"`

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
	if kmsg.ACLResourceType(g.ResourceType).String() == kmsg.ACLResourceTypeUnknown.String() {
		return fmt.Errorf("resourceType filter is out of bounds")
	}

	if kmsg.ACLResourcePatternType(g.ResourcePatternTypeFilter).String() == kmsg.ACLResourcePatternTypeUnknown.String() {
		return fmt.Errorf("resourcePatternTypeFilter is out of bounds")
	}

	if kmsg.ACLOperation(g.Operation).String() == kmsg.ACLOperationUnknown.String() {
		return fmt.Errorf("operation filter is out of bounds")
	}

	if kmsg.ACLPermissionType(g.PermissionType).String() == kmsg.ACLPermissionTypeUnknown.String() {
		return fmt.Errorf("permission type filter is out of bounds")
	}

	return nil
}

// ToKafkaRequest returns a request struct that complies with the expected request object for the Kafka library
func (g *getAclsOverviewRequest) ToKafkaRequest() kmsg.DescribeACLsRequest {
	return kmsg.DescribeACLsRequest{
		ResourceType:        kmsg.ACLResourceType(g.ResourceType),
		ResourceName:        g.ResourceName,
		ResourcePatternType: kmsg.ACLResourcePatternType(g.ResourcePatternTypeFilter),
		Principal:           g.Principal,
		Host:                g.Host,
		Operation:           kmsg.ACLOperation(g.Operation),
		PermissionType:      kmsg.ACLPermissionType(g.PermissionType),
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

		aclResources, err := api.OwlSvc.ListAllACLs(r.Context(), req.ToKafkaRequest())
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
