// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"github.com/go-chi/chi/v5"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	connectgateway "go.vallahaye.net/connect-gateway"
	"google.golang.org/protobuf/encoding/protojson"

	apiaclsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl"
	consolesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/console"
	apikafkaconnectsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/kafkaconnect"
	topicsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/topic"
	apiusersvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/user"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

// Setup connect and grpc-gateway
func (api *API) setupConnectWithGRPCGateway(r chi.Router) {
	// Base baseInterceptors configured in OSS.
	baseInterceptors := []connect.Interceptor{}

	// Setup gRPC-Gateway
	gwMux := runtime.NewServeMux(
		runtime.WithForwardResponseOption(GetHTTPResponseModifier()),
		runtime.WithErrorHandler(NiceHTTPErrorHandler),
		runtime.WithMarshalerOption(runtime.MIMEWildcard, &runtime.HTTPBodyMarshaler{
			Marshaler: &runtime.JSONPb{
				MarshalOptions: protojson.MarshalOptions{
					UseProtoNames: true, // use snake_case
					// Do not use EmitUnpopulated, so we don't emit nulls (they are ugly, and provide no benefit. they transport no information, even in "normal" json).
					EmitUnpopulated: false,
					// Instead, use EmitDefaultValues, which is new and like EmitUnpopulated, but
					// skips nulls (which we consider ugly, and provides no benefit over skipping the field)
					EmitDefaultValues: true,
				},
				UnmarshalOptions: protojson.UnmarshalOptions{
					DiscardUnknown: true,
				},
			},
		}),
	)

	// Call Hook
	hookOutput := api.Hooks.Route.ConfigConnectRPC(ConfigConnectRPCRequest{
		BaseInterceptors: baseInterceptors,
		GRPCGatewayMux:   gwMux,
	})

	// Use HTTP Middlewares that are configured by the Hook
	if len(hookOutput.HTTPMiddlewares) > 0 {
		r.Use(hookOutput.HTTPMiddlewares...)
	}
	r.Mount("/v1alpha1", gwMux) // Dataplane API

	// Create OSS Connect handlers only after calling hook. We need the hook output's final list of interceptors.
	userSvc := apiusersvc.NewService(api.Cfg, api.Logger.Named("user_service"), api.RedpandaSvc, api.ConsoleSvc, api.Hooks.Authorization.IsProtectedKafkaUser)
	aclSvc := apiaclsvc.NewService(api.Cfg, api.Logger.Named("kafka_service"), api.ConsoleSvc)
	consoleSvc := consolesvc.NewService(api.Logger.Named("console_service"), api.ConsoleSvc, api.Hooks.Authorization)
	kafkaConnectSvc := apikafkaconnectsvc.NewService(api.Cfg, api.Logger.Named("kafka_connect_service"), api.ConnectSvc)
	topicSvc := topicsvc.NewService(api.Cfg, api.Logger.Named("topic_service"), api.ConsoleSvc)

	userSvcPath, userSvcHandler := dataplanev1alpha1connect.NewUserServiceHandler(userSvc, connect.WithInterceptors(hookOutput.Interceptors...))
	aclSvcPath, aclSvcHandler := dataplanev1alpha1connect.NewACLServiceHandler(aclSvc, connect.WithInterceptors(hookOutput.Interceptors...))
	kafkaConnectPath, kafkaConnectHandler := dataplanev1alpha1connect.NewKafkaConnectServiceHandler(kafkaConnectSvc, connect.WithInterceptors(hookOutput.Interceptors...))
	consoleServicePath, consoleServiceHandler := consolev1alpha1connect.NewConsoleServiceHandler(consoleSvc, connect.WithInterceptors(hookOutput.Interceptors...))
	topicSvcPath, topicSvcHandler := dataplanev1alpha1connect.NewTopicServiceHandler(topicSvc, connect.WithInterceptors(hookOutput.Interceptors...))

	ossServices := []ConnectService{
		{
			ServiceName: dataplanev1alpha1connect.UserServiceName,
			MountPath:   userSvcPath,
			Handler:     userSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha1connect.ACLServiceName,
			MountPath:   aclSvcPath,
			Handler:     aclSvcHandler,
		},
		{
			ServiceName: consolev1alpha1connect.ConsoleServiceName,
			MountPath:   consoleServicePath,
			Handler:     consoleServiceHandler,
		},
		{
			ServiceName: dataplanev1alpha1connect.KafkaConnectServiceName,
			MountPath:   kafkaConnectPath,
			Handler:     kafkaConnectHandler,
		},
		{
			ServiceName: dataplanev1alpha1connect.TopicServiceName,
			MountPath:   topicSvcPath,
			Handler:     topicSvcHandler,
		},
	}

	// Order matters. OSS services first, so Enterprise handlers override OSS.
	//nolint:gocritic // It's okay to use append here, since we no longer need to access both given slices anymore
	allServices := append(ossServices, hookOutput.AdditionalServices...)

	var reflectServiceNames []string
	for _, svc := range allServices {
		reflectServiceNames = append(reflectServiceNames, svc.ServiceName)
		r.Mount(svc.MountPath, svc.Handler)
	}

	// Register gRPC-Gateway Handlers of OSS. Enterprise handlers are directly registered in the hook via the *runtime.ServeMux passed.
	dataplanev1alpha1connect.RegisterUserServiceHandlerGatewayServer(gwMux, userSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha1connect.RegisterACLServiceHandlerGatewayServer(gwMux, aclSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha1connect.RegisterKafkaConnectServiceHandlerGatewayServer(gwMux, kafkaConnectSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha1connect.RegisterTopicServiceHandlerGatewayServer(gwMux, topicSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))

	reflector := grpcreflect.NewStaticReflector(reflectServiceNames...)
	r.Mount(grpcreflect.NewHandlerV1(reflector))
	r.Mount(grpcreflect.NewHandlerV1Alpha(reflector))
}

// All the routes for the application are defined in one place.
func (api *API) routes() *chi.Mux {
	baseRouter := chi.NewRouter()

	// Fork a new router so that we can inject middlewares that are specific to the Connect API
	baseRouter.Group(func(router chi.Router) {
		api.setupConnectWithGRPCGateway(router)
	})

	return baseRouter
}
