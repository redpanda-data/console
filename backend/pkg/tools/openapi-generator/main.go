package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/getkin/kin-openapi/openapi2"
	"github.com/getkin/kin-openapi/openapi2conv"
	"github.com/getkin/kin-openapi/openapi3"
	"github.com/twmb/franz-go/pkg/kmsg"
	"golang.org/x/exp/slices"
	"google.golang.org/genproto/googleapis/rpc/code"
	"google.golang.org/genproto/googleapis/rpc/errdetails"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
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
	updateOperations(doc3)
	updateUsers(doc3)
	updateTransforms(doc3)
	updateAny(doc3)
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
					AuthorizationURL: "https://prod-cloudv2.us.auth0.com/oauth/authorize",
					Scopes:           map[string]string{},
				},
			},
		},
	}
}

func updateInfo(doc3 *openapi3.T) {
	doc3.Info = &openapi3.Info{
		Title:   "Redpanda Cloud Data Plane API",
		Version: "v1alpha2",
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

// updateAny fixes any "proto any" related descriptions etc. Some of them are too long and contain irrelevant google stuff.
func updateAny(doc3 *openapi3.T) {
	// We replaced all cases of any with our own custom types. Safe to remove it.
	delete(doc3.Components.Schemas, "Any")
	// Status (error response)
	{
		schema := doc3.Components.Schemas["rpc.Status"].Value
		schema.Properties["code"].Value.Description = "RPC status code, as described [here](https://github.com/googleapis/googleapis/blob/b4c238feaa1097c53798ed77035bbfeb7fc72e96/google/rpc/code.proto#L32)."
		schema.Properties["code"].Value.Type = &openapi3.Types{openapi3.TypeString}
		schema.Properties["code"].Value.Enum = []any{
			"OK",
			"CANCELLED",
			"UNKNOWN",
			"INVALID_ARGUMENT",
			"DEADLINE_EXCEEDED",
			"NOT_FOUND",
			"ALREADY_EXISTS",
			"PERMISSION_DENIED",
			"UNAUTHENTICATED",
			"RESOURCE_EXHAUSTED",
			"FAILED_PRECONDITION",
			"ABORTED",
			"OUT_OF_RANGE",
			"UNIMPLEMENTED",
			"INTERNAL",
			"UNAVAILABLE",
			"DATA_LOSS",
		}
		schema.Properties["message"].Value.Description = "Detailed error message. No compatibility guarantees are given for the text contained in this message."
		schema.Properties["details"] = &openapi3.SchemaRef{
			Value: &openapi3.Schema{
				Type: &openapi3.Types{openapi3.TypeArray},
				Items: &openapi3.SchemaRef{
					Value: &openapi3.Schema{
						Description: "Details of the error.",
						OneOf: []*openapi3.SchemaRef{
							// BadRequest
							{
								Value: &openapi3.Schema{
									AllOf: []*openapi3.SchemaRef{
										{
											Value: &openapi3.Schema{
												Properties: openapi3.Schemas{
													"@type": &openapi3.SchemaRef{
														Value: &openapi3.Schema{
															Description: "Fully qualified protobuf type name of the underlying response, prefixed with `type.googleapis.com/`.",
															Type:        &openapi3.Types{openapi3.TypeString},
															Enum: []any{
																"type.googleapis.com/google.rpc.BadRequest",
															},
														},
													},
												},
											},
										},
										{
											Ref: "#/components/schemas/BadRequest",
										},
									},
								},
							},
							// ErrorInfo
							{
								Value: &openapi3.Schema{
									AllOf: []*openapi3.SchemaRef{
										{
											Value: &openapi3.Schema{
												Properties: openapi3.Schemas{
													"@type": &openapi3.SchemaRef{
														Value: &openapi3.Schema{
															Description: "Fully qualified protobuf type name of the underlying response, prefixed with `type.googleapis.com/`.",
															Type:        &openapi3.Types{openapi3.TypeString},
															Enum: []any{
																"type.googleapis.com/google.rpc.ErrorInfo",
															},
														},
													},
												},
											},
										},
										{
											Ref: "#/components/schemas/ErrorInfo",
										},
									},
								},
							},
							// QuotaFailure
							{
								Value: &openapi3.Schema{
									AllOf: []*openapi3.SchemaRef{
										{
											Value: &openapi3.Schema{
												Properties: openapi3.Schemas{
													"@type": &openapi3.SchemaRef{
														Value: &openapi3.Schema{
															Description: "Fully qualified protobuf type name of the underlying response, prefixed with `type.googleapis.com/`.",
															Type:        &openapi3.Types{openapi3.TypeString},
															Enum: []any{
																"type.googleapis.com/google.rpc.QuotaFailure",
															},
														},
													},
												},
											},
										},
										{
											Ref: "#/components/schemas/QuotaFailure",
										},
									},
								},
							},
							// Help
							{
								Value: &openapi3.Schema{
									AllOf: []*openapi3.SchemaRef{
										{
											Value: &openapi3.Schema{
												Properties: openapi3.Schemas{
													"@type": &openapi3.SchemaRef{
														Value: &openapi3.Schema{
															Description: "Fully qualified protobuf type name of the underlying response, prefixed with `type.googleapis.com/`.",
															Type:        &openapi3.Types{openapi3.TypeString},
															Enum: []any{
																"type.googleapis.com/google.rpc.Help",
															},
														},
													},
												},
											},
										},
										{
											Ref: "#/components/schemas/Help",
										},
									},
								},
							},
						},
					},
				},
			},
		}
	}
}

func updateOperations(doc3 *openapi3.T) {
	doc3.Components.Schemas["BadRequest"].Value.Title = "BadRequest"
	doc3.Components.Schemas["ErrorInfo"].Value.Title = "ErrorInfo"
	doc3.Components.Schemas["QuotaFailure"].Value.Title = "QuotaFailure"
	doc3.Components.Schemas["Help"].Value.Title = "Help"
}

func updateUsers(doc3 *openapi3.T) {
	// Get /users
	{
		users := []*v1alpha2.ListUsersResponse_User{
			{
				Name: "payment-service",
			},
			{
				Name: "jane",
			},
		}
		response := &v1alpha2.ListUsersResponse{Users: users}
		responseExample := toExample(response, "List Users", "List users", true)
		doc3.Paths.Value("/v1alpha2/users").Get.Responses.Status(http.StatusOK).Value.Content.Get("application/json").Example = responseExample.Value
	}

	// POST /users
	{
		// Request
		createUserReq := &v1alpha2.CreateUserRequest{User: &v1alpha2.CreateUserRequest_User{
			Name:      "payment-service",
			Password:  "secure-password",
			Mechanism: v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
		}}
		doc3.Paths.Value("/v1alpha2/users").Post.RequestBody.Value.Content["application/json"].Example = toExample(createUserReq.User, "Create User", "Create user", false).Value

		// Responses
		response := &v1alpha2.CreateUserResponse{User: &v1alpha2.CreateUserResponse_User{
			Name:      "payment-service",
			Mechanism: v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256.Enum(),
		}}
		responseExample := toExample(response, "Create User", "Create user", true)
		doc3.Paths.Value("/v1alpha2/users").Post.Responses.Status(http.StatusCreated).Value.Content.Get("application/json").Example = responseExample.Value

		badRequestExample := toExample(
			newBadRequestError(
				&errdetails.BadRequest_FieldViolation{
					Field:       "user.password",
					Description: "value length must be at least 3 characters",
				},
				&errdetails.BadRequest_FieldViolation{
					Field:       "user.mechanism",
					Description: "value is required",
				},
			),
			"Bad Request",
			"Bad Request",
			true)
		doc3.Paths.Value("/v1alpha2/users").Post.Responses.Status(http.StatusBadRequest).Value.Content.Get("application/json").Example = badRequestExample.Value
	}

	// PUT /users/{user.name}
	{
		// Request
		updateUserReq := &v1alpha2.UpdateUserRequest{
			User: &v1alpha2.UpdateUserRequest_User{
				// Name:      "payment-service", // Will be populated from URL param
				Password:  "new-password",
				Mechanism: v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256,
			},
		}
		doc3.Paths.Value("/v1alpha2/users/{user.name}").Put.RequestBody.Value.Content["application/json"].Example = toExample(updateUserReq, "Update User", "Update user", false).Value

		// Responses
		response := &v1alpha2.UpdateUserResponse{
			User: &v1alpha2.UpdateUserResponse_User{
				Name:      "payment-service",
				Mechanism: v1alpha2.SASLMechanism_SASL_MECHANISM_SCRAM_SHA_256.Enum(),
			},
		}
		responseExample := toExample(response, "Update User", "Update user", true)
		doc3.Paths.Value("/v1alpha2/users/{user.name}").Put.Responses.Status(http.StatusOK).Value.Content.Get("application/json").Example = responseExample.Value

		badRequestExample := toExample(
			newBadRequestError(
				&errdetails.BadRequest_FieldViolation{
					Field:       "user.password",
					Description: "value length must be at least 3 characters",
				},
				&errdetails.BadRequest_FieldViolation{
					Field:       "user.mechanism",
					Description: "value is required",
				},
			),
			"Bad Request",
			"Bad Request",
			true)
		doc3.Paths.Value("/v1alpha2/users/{user.name}").Put.Responses.Status(http.StatusBadRequest).Value.Content.Get("application/json").Example = badRequestExample.Value
	}

	// DELETE /users/{name}
	{
		// Response
		response := &v1alpha2.DeleteUserResponse{}
		responseExample := toExample(response, "Delete User", "Delete user", true)
		doc3.Paths.Value("/v1alpha2/users/{name}").Delete.Responses.Status(http.StatusNoContent).Value.Content.Get("application/json").Example = responseExample.Value

		notFoundExample := toExample(
			connectErrorToErrorStatus(
				apierrors.NewConnectError(
					connect.CodeNotFound,
					fmt.Errorf("user not found"),
					apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
				),
			),
			"Bad Request",
			"Bad Request",
			true)
		doc3.Paths.Value("/v1alpha2/users/{name}").Delete.Responses.Status(http.StatusNotFound).Value.Content.Get("application/json").Example = notFoundExample.Value
	}
}

func updateTransforms(doc3 *openapi3.T) {
	// GET /transforms
	{
		transforms := []*v1alpha2.TransformMetadata{
			{
				Name:             "transform1",
				InputTopicName:   "topic1",
				OutputTopicNames: []string{"output-topic11", "output-topic12"},
				Statuses: []*v1alpha2.PartitionTransformStatus{
					{
						BrokerId:    int32(1),
						PartitionId: int32(1),
						Status:      v1alpha2.PartitionTransformStatus_PARTITION_STATUS_RUNNING,
						Lag:         int32(1),
					},
				},
			},
			{
				Name:             "transform2",
				InputTopicName:   "topic2",
				OutputTopicNames: []string{"output-topic21", "output-topic22"},
				Statuses: []*v1alpha2.PartitionTransformStatus{
					{
						BrokerId:    int32(2),
						PartitionId: int32(2),
						Status:      v1alpha2.PartitionTransformStatus_PARTITION_STATUS_RUNNING,
						Lag:         int32(2),
					},
				},
			},
		}
		responseExample := toExample(&v1alpha2.ListTransformsResponse{Transforms: transforms}, "List Transforms", "List transforms", true)
		doc3.Paths.Value("/v1alpha2/transforms").Get.Responses.Status(http.StatusOK).Value.Content.Get("application/json").Example = responseExample.Value
	}
	// PUT /transforms
	{
		// Create request sample
		deployTransformReq := v1alpha2.DeployTransformRequest{
			Name:             "redact-orders",
			InputTopicName:   "orders",
			OutputTopicNames: []string{"orders-redacted"},
			EnvironmentVariables: []*v1alpha2.TransformMetadata_EnvironmentVariable{
				{
					Key:   "LOGGER_LEVEL",
					Value: "DEBUG",
				},
			},
		}
		deployTransformReqMarshaled, err := protojson.MarshalOptions{UseProtoNames: true}.Marshal(&deployTransformReq)
		if err != nil {
			panic(err)
		}

		multipartProps := openapi3.Schemas{}
		multipartProps["metadata"] = &openapi3.SchemaRef{
			Ref: "#/components/schemas/DeployTransformRequest",
			Value: &openapi3.Schema{
				AllowEmptyValue: false,
				Type:            &openapi3.Types{openapi3.TypeString},
				Description:     "Serialized JSON object containing metadata for the transform. This includes information such as the transform name, description, env vars, etc.",
				Example:         string(deployTransformReqMarshaled),
			},
		}
		multipartProps["wasm_binary"] = &openapi3.SchemaRef{
			Value: &openapi3.Schema{
				AllowEmptyValue: false,
				Type:            &openapi3.Types{openapi3.TypeString},
				Format:          "binary",
				Description:     "Binary file containing the compiled WASM transform. The maximum size for this file is 10MiB.",
			},
		}

		// Create response sample
		deployTransformResponse := v1alpha2.TransformMetadata{
			Name:             deployTransformReq.Name,
			InputTopicName:   deployTransformReq.InputTopicName,
			OutputTopicNames: deployTransformReq.OutputTopicNames,
			Statuses: []*v1alpha2.PartitionTransformStatus{
				{
					BrokerId:    0,
					PartitionId: 0,
					Status:      v1alpha2.PartitionTransformStatus_PARTITION_STATUS_UNKNOWN,
					Lag:         0,
				},
				{
					BrokerId:    1,
					PartitionId: 1,
					Status:      v1alpha2.PartitionTransformStatus_PARTITION_STATUS_UNKNOWN,
					Lag:         0,
				},
			},
			EnvironmentVariables: deployTransformReq.EnvironmentVariables,
		}

		// We copy the majority of the propertis from an existing endpoint description, so
		// that we don't need to construct all properties of the openapi3.Operation struct.
		transformsOperation := *doc3.Paths.Value("/v1alpha2/transforms").Get
		transformsOperation.OperationID = "TransformService_DeployTransform"
		transformsOperation.Summary = "Deploy Transform"
		transformsOperation.Description = "Initiate deployment of a new Wasm transform. This endpoint uses " +
			"multipart/form-data encoding. Following deployment, a brief period is required before the Wasm " +
			"transform becomes operational. Monitor the partition statuses to check whether the " +
			"transform is active. This usually takes around 3s, but no longer than 10s."
		transformsOperation.Parameters = nil
		transformsOperation.RequestBody = &openapi3.RequestBodyRef{
			Value: &openapi3.RequestBody{
				Description: "Transform metadata as well as the WASM binary",
				Required:    true,
				Content: openapi3.NewContentWithFormDataSchemaRef(&openapi3.SchemaRef{
					Value: &openapi3.Schema{
						Type:       &openapi3.Types{openapi3.TypeObject},
						Example:    string(deployTransformReqMarshaled),
						Properties: multipartProps,
					},
				}),
			},
		}
		transformsOperation.Responses = openapi3.NewResponses(
			openapi3.WithStatus(http.StatusCreated, &openapi3.ResponseRef{
				Value: &openapi3.Response{
					Description: kmsg.StringPtr("Created"),
					Content: openapi3.NewContentWithJSONSchemaRef(&openapi3.SchemaRef{
						Ref: "#/components/schemas/TransformMetadata",
						Value: &openapi3.Schema{
							Example: toExample(&deployTransformResponse, "Deploy Transform Response", "Sample res", false),
						},
					}),
				},
			}),
		)
		doc3.Paths.Value("/v1alpha2/transforms").Put = &transformsOperation
	}
	// Get /transforms/{name}
	{
		// Request
		request := &v1alpha2.GetTransformRequest{
			Name: "transform1",
		}
		doc3.Paths.Value("/v1alpha2/transforms/{name}").Get.Parameters[0].Value.Example = toExample(request, "Get Transform", "Get transform", false).Value

		// Response
		response := &v1alpha2.GetTransformResponse{
			Transform: &v1alpha2.TransformMetadata{
				Name:             "transform1",
				InputTopicName:   "topic1",
				OutputTopicNames: []string{"output-topic1", "output-topic2"},
				Statuses: []*v1alpha2.PartitionTransformStatus{
					{
						BrokerId:    int32(1),
						PartitionId: int32(1),
						Status:      v1alpha2.PartitionTransformStatus_PARTITION_STATUS_RUNNING,
						Lag:         int32(1),
					},
				},
			},
		}
		responseExample := toExample(response, "Get Transform", "Get transform", true)
		doc3.Paths.Value("/v1alpha2/transforms/{name}").Get.Responses.Status(http.StatusOK).Value.Content.Get("application/json").Example = responseExample.Value
	}
	// Delete /transforms/{name}
	{
		// Request
		request := &v1alpha2.DeleteTransformRequest{
			Name: "transform1",
		}
		doc3.Paths.Value("/v1alpha2/transforms/{name}").Delete.Parameters[0].Value.Example = toExample(request, "Delete Transform", "Delete transform", false).Value

		// Response
		response := &v1alpha2.DeleteTransformResponse{}
		responseExample := toExample(response, "Delete Transform", "Delete transform", true)
		doc3.Paths.Value("/v1alpha2/transforms/{name}").Delete.Responses.Status(http.StatusNoContent).Value.Content.Get("application/json").Example = responseExample.Value
	}
}

func newBadRequestError(fieldValidations ...*errdetails.BadRequest_FieldViolation) *commonv1alpha1.ErrorStatus {
	return connectErrorToErrorStatus(
		apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("provided parameters are invalid"),
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
