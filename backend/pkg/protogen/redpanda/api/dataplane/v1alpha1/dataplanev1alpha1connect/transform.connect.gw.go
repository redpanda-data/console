// Code generated by protoc-gen-connect-gateway. DO NOT EDIT.
//
// Source: redpanda/api/dataplane/v1alpha1/transform.proto

package dataplanev1alpha1connect

import (
	context "context"
	fmt "fmt"

	runtime "github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	connect_gateway "go.vallahaye.net/connect-gateway"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// TransformServiceGatewayServer implements the gRPC server API for the TransformService service.
//
// Deprecated: do not use.
type TransformServiceGatewayServer struct {
	v1alpha1.UnimplementedTransformServiceServer
	listTransforms  connect_gateway.UnaryHandler[v1alpha1.ListTransformsRequest, v1alpha1.ListTransformsResponse]
	getTransform    connect_gateway.UnaryHandler[v1alpha1.GetTransformRequest, v1alpha1.GetTransformResponse]
	deleteTransform connect_gateway.UnaryHandler[v1alpha1.DeleteTransformRequest, v1alpha1.DeleteTransformResponse]
}

// NewTransformServiceGatewayServer constructs a Connect-Gateway gRPC server for the
// TransformService service.
//
// Deprecated: do not use.
func NewTransformServiceGatewayServer(svc TransformServiceHandler, opts ...connect_gateway.HandlerOption) *TransformServiceGatewayServer {
	return &TransformServiceGatewayServer{
		listTransforms:  connect_gateway.NewUnaryHandler(TransformServiceListTransformsProcedure, svc.ListTransforms, opts...),
		getTransform:    connect_gateway.NewUnaryHandler(TransformServiceGetTransformProcedure, svc.GetTransform, opts...),
		deleteTransform: connect_gateway.NewUnaryHandler(TransformServiceDeleteTransformProcedure, svc.DeleteTransform, opts...),
	}
}

func (s *TransformServiceGatewayServer) ListTransforms(ctx context.Context, req *v1alpha1.ListTransformsRequest) (*v1alpha1.ListTransformsResponse, error) {
	return s.listTransforms(ctx, req)
}

func (s *TransformServiceGatewayServer) GetTransform(ctx context.Context, req *v1alpha1.GetTransformRequest) (*v1alpha1.GetTransformResponse, error) {
	return s.getTransform(ctx, req)
}

func (s *TransformServiceGatewayServer) DeleteTransform(ctx context.Context, req *v1alpha1.DeleteTransformRequest) (*v1alpha1.DeleteTransformResponse, error) {
	return s.deleteTransform(ctx, req)
}

// RegisterTransformServiceHandlerGatewayServer registers the Connect handlers for the
// TransformService "svc" to "mux".
//
// Deprecated: do not use.
func RegisterTransformServiceHandlerGatewayServer(mux *runtime.ServeMux, svc TransformServiceHandler, opts ...connect_gateway.HandlerOption) {
	if err := v1alpha1.RegisterTransformServiceHandlerServer(context.TODO(), mux, NewTransformServiceGatewayServer(svc, opts...)); err != nil {
		panic(fmt.Errorf("connect-gateway: %w", err))
	}
}
