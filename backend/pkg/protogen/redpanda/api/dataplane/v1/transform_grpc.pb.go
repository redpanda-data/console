// Code generated by protoc-gen-go-grpc. DO NOT EDIT.
// versions:
// - protoc-gen-go-grpc v1.5.1
// - protoc             (unknown)
// source: redpanda/api/dataplane/v1/transform.proto

package dataplanev1

import (
	context "context"

	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	status "google.golang.org/grpc/status"
)

// This is a compile-time assertion to ensure that this generated file
// is compatible with the grpc package it is being compiled against.
// Requires gRPC-Go v1.64.0 or later.
const _ = grpc.SupportPackageIsVersion9

const (
	TransformService_ListTransforms_FullMethodName  = "/redpanda.api.dataplane.v1.TransformService/ListTransforms"
	TransformService_GetTransform_FullMethodName    = "/redpanda.api.dataplane.v1.TransformService/GetTransform"
	TransformService_DeleteTransform_FullMethodName = "/redpanda.api.dataplane.v1.TransformService/DeleteTransform"
)

// TransformServiceClient is the client API for TransformService service.
//
// For semantics around ctx use and closing/ending streaming RPCs, please refer to https://pkg.go.dev/google.golang.org/grpc/?tab=doc#ClientConn.NewStream.
type TransformServiceClient interface {
	ListTransforms(ctx context.Context, in *ListTransformsRequest, opts ...grpc.CallOption) (*ListTransformsResponse, error)
	GetTransform(ctx context.Context, in *GetTransformRequest, opts ...grpc.CallOption) (*GetTransformResponse, error)
	DeleteTransform(ctx context.Context, in *DeleteTransformRequest, opts ...grpc.CallOption) (*DeleteTransformResponse, error)
}

type transformServiceClient struct {
	cc grpc.ClientConnInterface
}

func NewTransformServiceClient(cc grpc.ClientConnInterface) TransformServiceClient {
	return &transformServiceClient{cc}
}

func (c *transformServiceClient) ListTransforms(ctx context.Context, in *ListTransformsRequest, opts ...grpc.CallOption) (*ListTransformsResponse, error) {
	cOpts := append([]grpc.CallOption{grpc.StaticMethod()}, opts...)
	out := new(ListTransformsResponse)
	err := c.cc.Invoke(ctx, TransformService_ListTransforms_FullMethodName, in, out, cOpts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *transformServiceClient) GetTransform(ctx context.Context, in *GetTransformRequest, opts ...grpc.CallOption) (*GetTransformResponse, error) {
	cOpts := append([]grpc.CallOption{grpc.StaticMethod()}, opts...)
	out := new(GetTransformResponse)
	err := c.cc.Invoke(ctx, TransformService_GetTransform_FullMethodName, in, out, cOpts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (c *transformServiceClient) DeleteTransform(ctx context.Context, in *DeleteTransformRequest, opts ...grpc.CallOption) (*DeleteTransformResponse, error) {
	cOpts := append([]grpc.CallOption{grpc.StaticMethod()}, opts...)
	out := new(DeleteTransformResponse)
	err := c.cc.Invoke(ctx, TransformService_DeleteTransform_FullMethodName, in, out, cOpts...)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// TransformServiceServer is the server API for TransformService service.
// All implementations must embed UnimplementedTransformServiceServer
// for forward compatibility.
type TransformServiceServer interface {
	ListTransforms(context.Context, *ListTransformsRequest) (*ListTransformsResponse, error)
	GetTransform(context.Context, *GetTransformRequest) (*GetTransformResponse, error)
	DeleteTransform(context.Context, *DeleteTransformRequest) (*DeleteTransformResponse, error)
	mustEmbedUnimplementedTransformServiceServer()
}

// UnimplementedTransformServiceServer must be embedded to have
// forward compatible implementations.
//
// NOTE: this should be embedded by value instead of pointer to avoid a nil
// pointer dereference when methods are called.
type UnimplementedTransformServiceServer struct{}

func (UnimplementedTransformServiceServer) ListTransforms(context.Context, *ListTransformsRequest) (*ListTransformsResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method ListTransforms not implemented")
}
func (UnimplementedTransformServiceServer) GetTransform(context.Context, *GetTransformRequest) (*GetTransformResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method GetTransform not implemented")
}
func (UnimplementedTransformServiceServer) DeleteTransform(context.Context, *DeleteTransformRequest) (*DeleteTransformResponse, error) {
	return nil, status.Errorf(codes.Unimplemented, "method DeleteTransform not implemented")
}
func (UnimplementedTransformServiceServer) mustEmbedUnimplementedTransformServiceServer() {}
func (UnimplementedTransformServiceServer) testEmbeddedByValue()                          {}

// UnsafeTransformServiceServer may be embedded to opt out of forward compatibility for this service.
// Use of this interface is not recommended, as added methods to TransformServiceServer will
// result in compilation errors.
type UnsafeTransformServiceServer interface {
	mustEmbedUnimplementedTransformServiceServer()
}

func RegisterTransformServiceServer(s grpc.ServiceRegistrar, srv TransformServiceServer) {
	// If the following call pancis, it indicates UnimplementedTransformServiceServer was
	// embedded by pointer and is nil.  This will cause panics if an
	// unimplemented method is ever invoked, so we test this at initialization
	// time to prevent it from happening at runtime later due to I/O.
	if t, ok := srv.(interface{ testEmbeddedByValue() }); ok {
		t.testEmbeddedByValue()
	}
	s.RegisterService(&TransformService_ServiceDesc, srv)
}

func _TransformService_ListTransforms_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(ListTransformsRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TransformServiceServer).ListTransforms(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: TransformService_ListTransforms_FullMethodName,
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TransformServiceServer).ListTransforms(ctx, req.(*ListTransformsRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _TransformService_GetTransform_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(GetTransformRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TransformServiceServer).GetTransform(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: TransformService_GetTransform_FullMethodName,
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TransformServiceServer).GetTransform(ctx, req.(*GetTransformRequest))
	}
	return interceptor(ctx, in, info, handler)
}

func _TransformService_DeleteTransform_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(DeleteTransformRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(TransformServiceServer).DeleteTransform(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: TransformService_DeleteTransform_FullMethodName,
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(TransformServiceServer).DeleteTransform(ctx, req.(*DeleteTransformRequest))
	}
	return interceptor(ctx, in, info, handler)
}

// TransformService_ServiceDesc is the grpc.ServiceDesc for TransformService service.
// It's only intended for direct use with grpc.RegisterService,
// and not to be introspected or modified (even as a copy)
var TransformService_ServiceDesc = grpc.ServiceDesc{
	ServiceName: "redpanda.api.dataplane.v1.TransformService",
	HandlerType: (*TransformServiceServer)(nil),
	Methods: []grpc.MethodDesc{
		{
			MethodName: "ListTransforms",
			Handler:    _TransformService_ListTransforms_Handler,
		},
		{
			MethodName: "GetTransform",
			Handler:    _TransformService_GetTransform_Handler,
		},
		{
			MethodName: "DeleteTransform",
			Handler:    _TransformService_DeleteTransform_Handler,
		},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "redpanda/api/dataplane/v1/transform.proto",
}
