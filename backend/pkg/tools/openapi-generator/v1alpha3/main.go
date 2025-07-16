package main

import (
	"encoding/json"
	"errors"
	"flag"
	"os"
	"path/filepath"
	"strings"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/getkin/kin-openapi/openapi2"
	"github.com/getkin/kin-openapi/openapi2conv"
	"github.com/getkin/kin-openapi/openapi3"
	"golang.org/x/exp/slices"
	"google.golang.org/genproto/googleapis/rpc/code"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
)

var (
	in      string
	out     string
	outProd string
)

func init() {
	flag.StringVar(&in, "in", "", "input file, must be JSON")
	flag.StringVar(&out, "out", "", "output file, must be YAML")
	flag.StringVar(&outProd, "out-prod", "", "output file for prod with other envs removed. must be YAML")
}

func main() { //nolint:cyclop,gocognit // this is just some tool
	flag.Parse()
	doc2file, err := os.Open(filepath.Clean(in))
	if err != nil {
		panic(err)
	}
	var doc2 openapi2.T
	err = json.NewDecoder(doc2file).Decode(&doc2)
	if err != nil {
		panic(err)
	}

	if err := doc2file.Close(); err != nil {
		panic(err)
	}

	doc3, err := openapi2conv.ToV3(&doc2)
	if err != nil {
		panic(err)
	}

	updateInfo(doc3)
	updateServers(doc3)
	updateSecurity(doc3)
	removeDummies(doc3)

	// Delete DummyService tag
	for i, tag := range doc3.Tags {
		tag := tag
		if tag != nil {
			if tag.Name == "DummyService" {
				doc3.Tags = slices.Delete(doc3.Tags, i, i+1)
			}
		}
	}

	err = os.MkdirAll(filepath.Dir(out), 0o750)
	if err != nil {
		panic(err)
	}
	{
		bytez, err := json.Marshal(doc3)
		if err != nil {
			panic(err)
		}

		err = os.WriteFile(out, bytez, 0o600)
		if err != nil {
			panic(err)
		}
	}

	// Write copy with only prod stuff

	for _, server := range doc3.Servers {
		if server.Description == "Production" {
			doc3.Servers = openapi3.Servers{
				server,
			}
			break
		}
	}

	for k := range doc3.Components.SecuritySchemes {
		if k != "auth0" {
			delete(doc3.Components.SecuritySchemes, k)
		}
	}

	for _, security := range doc3.Security {
		if len(security) > 0 {
			for k := range security {
				if k == "auth0" {
					doc3.Security = openapi3.SecurityRequirements{
						security,
					}
					break
				}
			}
		}
	}

	// Write prod file
	if outProd != "" {
		bytez, err := json.Marshal(doc3)
		if err != nil {
			panic(err)
		}

		err = os.WriteFile(outProd, bytez, 0o600)
		if err != nil {
			panic(err)
		}
	}
}

func updateServers(doc3 *openapi3.T) {
	doc3.Servers = []*openapi3.Server{
		{
			URL:         "{dataplane_api_url}",
			Description: "Data Plane API",
			Variables: map[string]*openapi3.ServerVariable{
				"dataplane_api_url": {
					Default: "https://{dataplane_api_url}",
					Description: `Find the Data Plane API base URL of a cluster by calling the Get Cluster endpoint of the Control Plane API. The dataplane_api.url field is returned in the response body.<br><br>
					Example (Dedicated): "https://api-a4cb21.ck09mi9c4vs17hng9gig.fmc.prd.cloud.redpanda.com"<br>
					Example (BYOC): "https://api-a4cb21.ck09mi9c4vs17hng9gig.byoc.prd.cloud.redpanda.com"`,
				},
			},
		},
	}
}

func updateSecurity(doc3 *openapi3.T) {
	doc3.Security = []openapi3.SecurityRequirement{
		{
			"auth0": []string{},
		},
	}

	doc3.Components.SecuritySchemes = make(openapi3.SecuritySchemes)
	doc3.Components.SecuritySchemes["auth0"] = &openapi3.SecuritySchemeRef{
		Value: &openapi3.SecurityScheme{
			Type:        "oauth2",
			Description: "RedpandaCloud",
			Flows: &openapi3.OAuthFlows{
				Implicit: &openapi3.OAuthFlow{
					Extensions: map[string]any{
						"x-client-id": "dQjapNIAHhF7EQqQToRla3yEII9sUSap",
					},
					AuthorizationURL: "https://auth.prd.cloud.redpanda.com/oauth/authorize",
					Scopes:           map[string]string{},
				},
			},
		},
	}
}

func updateInfo(doc3 *openapi3.T) {
	doc3.Info = &openapi3.Info{
		Title:   "Redpanda Cloud Data Plane API",
		Version: "v1",
	}
}

func toExample(in proto.Message, summary string, description string, emitUnpopulated bool) *openapi3.Example {
	marshaled, err := protojson.MarshalOptions{
		UseProtoNames:   true,
		EmitUnpopulated: emitUnpopulated,
	}.Marshal(in)
	if err != nil {
		panic(err)
	}

	rawResponse := map[string]any{}
	if err := json.Unmarshal(marshaled, &rawResponse); err != nil {
		panic(err)
	}

	return &openapi3.Example{
		Extensions:    map[string]any{},
		Summary:       summary,
		Description:   description,
		Value:         rawResponse,
		ExternalValue: "",
	}
}

// remove some dummy messages we don't want to see
func removeDummies(doc3 *openapi3.T) {
	for k := range doc3.Components.Schemas {
		if strings.HasPrefix(k, "Dummy") {
			delete(doc3.Components.Schemas, k)
		}
	}
}

func newBadRequestError(fieldValidations ...*errdetails.BadRequest_FieldViolation) *commonv1alpha1.ErrorStatus {
	return connectErrorToErrorStatus(
		apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			errors.New("provided parameters are invalid"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			apierrors.NewBadRequest(fieldValidations...),
		),
	)
}

func connectErrorToErrorStatus(connectErr *connect.Error) *commonv1alpha1.ErrorStatus {
	connectErr.Details()
	details := make([]*anypb.Any, len(connectErr.Details()))

	for i, d := range connectErr.Details() {
		msg, err := d.Value()
		if err != nil {
			panic(err)
		}
		anyDetail, err := anypb.New(msg)
		if err != nil {
			panic(err)
		}
		details[i] = anyDetail
	}
	pb := commonv1alpha1.ErrorStatus{
		Code:    code.Code(connectErr.Code()),
		Message: connectErr.Message(),
		Details: details,
	}

	return &pb
}
