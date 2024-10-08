// Code generated by protoc-gen-connect-go. DO NOT EDIT.
//
// Source: redpanda/api/console/v1alpha1/license.proto

package consolev1alpha1connect

import (
	context "context"
	errors "errors"
	http "net/http"
	strings "strings"

	connect "connectrpc.com/connect"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

// This is a compile-time assertion to ensure that this generated file and the connect package are
// compatible. If you get a compiler error that this constant is not defined, this code was
// generated with a version of connect newer than the one compiled into your binary. You can fix the
// problem by either regenerating this code with an older version of connect or updating the connect
// version compiled into your binary.
const _ = connect.IsAtLeastVersion1_13_0

const (
	// LicenseServiceName is the fully-qualified name of the LicenseService service.
	LicenseServiceName = "redpanda.api.console.v1alpha1.LicenseService"
)

// These constants are the fully-qualified names of the RPCs defined in this package. They're
// exposed at runtime as Spec.Procedure and as the final two segments of the HTTP route.
//
// Note that these are different from the fully-qualified method names used by
// google.golang.org/protobuf/reflect/protoreflect. To convert from these constants to
// reflection-formatted method names, remove the leading slash and convert the remaining slash to a
// period.
const (
	// LicenseServiceListLicensesProcedure is the fully-qualified name of the LicenseService's
	// ListLicenses RPC.
	LicenseServiceListLicensesProcedure = "/redpanda.api.console.v1alpha1.LicenseService/ListLicenses"
	// LicenseServiceSetLicenseProcedure is the fully-qualified name of the LicenseService's SetLicense
	// RPC.
	LicenseServiceSetLicenseProcedure = "/redpanda.api.console.v1alpha1.LicenseService/SetLicense"
	// LicenseServiceListEnterpriseFeaturesProcedure is the fully-qualified name of the LicenseService's
	// ListEnterpriseFeatures RPC.
	LicenseServiceListEnterpriseFeaturesProcedure = "/redpanda.api.console.v1alpha1.LicenseService/ListEnterpriseFeatures"
)

// These variables are the protoreflect.Descriptor objects for the RPCs defined in this package.
var (
	licenseServiceServiceDescriptor                      = v1alpha1.File_redpanda_api_console_v1alpha1_license_proto.Services().ByName("LicenseService")
	licenseServiceListLicensesMethodDescriptor           = licenseServiceServiceDescriptor.Methods().ByName("ListLicenses")
	licenseServiceSetLicenseMethodDescriptor             = licenseServiceServiceDescriptor.Methods().ByName("SetLicense")
	licenseServiceListEnterpriseFeaturesMethodDescriptor = licenseServiceServiceDescriptor.Methods().ByName("ListEnterpriseFeatures")
)

// LicenseServiceClient is a client for the redpanda.api.console.v1alpha1.LicenseService service.
type LicenseServiceClient interface {
	// ListLicenses lists all the roles based on optional filter.
	ListLicenses(context.Context, *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error)
	// SetLicense installs a new license on the Redpanda cluster.
	// This endpoint only works if the Redpanda Admin API is configured.
	SetLicense(context.Context, *connect.Request[v1alpha1.SetLicenseRequest]) (*connect.Response[v1alpha1.SetLicenseResponse], error)
	// ListEnterpriseFeatures reports the license status and Redpanda enterprise features in use.
	// This can only be reported if the Redpanda Admin API is configured and supports this request.
	ListEnterpriseFeatures(context.Context, *connect.Request[v1alpha1.ListEnterpriseFeaturesRequest]) (*connect.Response[v1alpha1.ListEnterpriseFeaturesResponse], error)
}

// NewLicenseServiceClient constructs a client for the redpanda.api.console.v1alpha1.LicenseService
// service. By default, it uses the Connect protocol with the binary Protobuf Codec, asks for
// gzipped responses, and sends uncompressed requests. To use the gRPC or gRPC-Web protocols, supply
// the connect.WithGRPC() or connect.WithGRPCWeb() options.
//
// The URL supplied here should be the base URL for the Connect or gRPC server (for example,
// http://api.acme.com or https://acme.com/grpc).
func NewLicenseServiceClient(httpClient connect.HTTPClient, baseURL string, opts ...connect.ClientOption) LicenseServiceClient {
	baseURL = strings.TrimRight(baseURL, "/")
	return &licenseServiceClient{
		listLicenses: connect.NewClient[v1alpha1.ListLicensesRequest, v1alpha1.ListLicensesResponse](
			httpClient,
			baseURL+LicenseServiceListLicensesProcedure,
			connect.WithSchema(licenseServiceListLicensesMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		setLicense: connect.NewClient[v1alpha1.SetLicenseRequest, v1alpha1.SetLicenseResponse](
			httpClient,
			baseURL+LicenseServiceSetLicenseProcedure,
			connect.WithSchema(licenseServiceSetLicenseMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
		listEnterpriseFeatures: connect.NewClient[v1alpha1.ListEnterpriseFeaturesRequest, v1alpha1.ListEnterpriseFeaturesResponse](
			httpClient,
			baseURL+LicenseServiceListEnterpriseFeaturesProcedure,
			connect.WithSchema(licenseServiceListEnterpriseFeaturesMethodDescriptor),
			connect.WithClientOptions(opts...),
		),
	}
}

// licenseServiceClient implements LicenseServiceClient.
type licenseServiceClient struct {
	listLicenses           *connect.Client[v1alpha1.ListLicensesRequest, v1alpha1.ListLicensesResponse]
	setLicense             *connect.Client[v1alpha1.SetLicenseRequest, v1alpha1.SetLicenseResponse]
	listEnterpriseFeatures *connect.Client[v1alpha1.ListEnterpriseFeaturesRequest, v1alpha1.ListEnterpriseFeaturesResponse]
}

// ListLicenses calls redpanda.api.console.v1alpha1.LicenseService.ListLicenses.
func (c *licenseServiceClient) ListLicenses(ctx context.Context, req *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error) {
	return c.listLicenses.CallUnary(ctx, req)
}

// SetLicense calls redpanda.api.console.v1alpha1.LicenseService.SetLicense.
func (c *licenseServiceClient) SetLicense(ctx context.Context, req *connect.Request[v1alpha1.SetLicenseRequest]) (*connect.Response[v1alpha1.SetLicenseResponse], error) {
	return c.setLicense.CallUnary(ctx, req)
}

// ListEnterpriseFeatures calls redpanda.api.console.v1alpha1.LicenseService.ListEnterpriseFeatures.
func (c *licenseServiceClient) ListEnterpriseFeatures(ctx context.Context, req *connect.Request[v1alpha1.ListEnterpriseFeaturesRequest]) (*connect.Response[v1alpha1.ListEnterpriseFeaturesResponse], error) {
	return c.listEnterpriseFeatures.CallUnary(ctx, req)
}

// LicenseServiceHandler is an implementation of the redpanda.api.console.v1alpha1.LicenseService
// service.
type LicenseServiceHandler interface {
	// ListLicenses lists all the roles based on optional filter.
	ListLicenses(context.Context, *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error)
	// SetLicense installs a new license on the Redpanda cluster.
	// This endpoint only works if the Redpanda Admin API is configured.
	SetLicense(context.Context, *connect.Request[v1alpha1.SetLicenseRequest]) (*connect.Response[v1alpha1.SetLicenseResponse], error)
	// ListEnterpriseFeatures reports the license status and Redpanda enterprise features in use.
	// This can only be reported if the Redpanda Admin API is configured and supports this request.
	ListEnterpriseFeatures(context.Context, *connect.Request[v1alpha1.ListEnterpriseFeaturesRequest]) (*connect.Response[v1alpha1.ListEnterpriseFeaturesResponse], error)
}

// NewLicenseServiceHandler builds an HTTP handler from the service implementation. It returns the
// path on which to mount the handler and the handler itself.
//
// By default, handlers support the Connect, gRPC, and gRPC-Web protocols with the binary Protobuf
// and JSON codecs. They also support gzip compression.
func NewLicenseServiceHandler(svc LicenseServiceHandler, opts ...connect.HandlerOption) (string, http.Handler) {
	licenseServiceListLicensesHandler := connect.NewUnaryHandler(
		LicenseServiceListLicensesProcedure,
		svc.ListLicenses,
		connect.WithSchema(licenseServiceListLicensesMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	licenseServiceSetLicenseHandler := connect.NewUnaryHandler(
		LicenseServiceSetLicenseProcedure,
		svc.SetLicense,
		connect.WithSchema(licenseServiceSetLicenseMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	licenseServiceListEnterpriseFeaturesHandler := connect.NewUnaryHandler(
		LicenseServiceListEnterpriseFeaturesProcedure,
		svc.ListEnterpriseFeatures,
		connect.WithSchema(licenseServiceListEnterpriseFeaturesMethodDescriptor),
		connect.WithHandlerOptions(opts...),
	)
	return "/redpanda.api.console.v1alpha1.LicenseService/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case LicenseServiceListLicensesProcedure:
			licenseServiceListLicensesHandler.ServeHTTP(w, r)
		case LicenseServiceSetLicenseProcedure:
			licenseServiceSetLicenseHandler.ServeHTTP(w, r)
		case LicenseServiceListEnterpriseFeaturesProcedure:
			licenseServiceListEnterpriseFeaturesHandler.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}

// UnimplementedLicenseServiceHandler returns CodeUnimplemented from all methods.
type UnimplementedLicenseServiceHandler struct{}

func (UnimplementedLicenseServiceHandler) ListLicenses(context.Context, *connect.Request[v1alpha1.ListLicensesRequest]) (*connect.Response[v1alpha1.ListLicensesResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.LicenseService.ListLicenses is not implemented"))
}

func (UnimplementedLicenseServiceHandler) SetLicense(context.Context, *connect.Request[v1alpha1.SetLicenseRequest]) (*connect.Response[v1alpha1.SetLicenseResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.LicenseService.SetLicense is not implemented"))
}

func (UnimplementedLicenseServiceHandler) ListEnterpriseFeatures(context.Context, *connect.Request[v1alpha1.ListEnterpriseFeaturesRequest]) (*connect.Response[v1alpha1.ListEnterpriseFeaturesResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.LicenseService.ListEnterpriseFeatures is not implemented"))
}
