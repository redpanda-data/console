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
	"log/slog"
	"net/http"
	"time"

	"buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"github.com/cloudhut/common/middleware"
	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	commoninterceptor "github.com/redpanda-data/common-go/api/interceptor"
	"github.com/redpanda-data/common-go/api/metrics"
	connectgateway "go.vallahaye.net/connect-gateway"
	"google.golang.org/protobuf/encoding/protojson"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/connect/interceptor"
	apiaclsvcv1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl/v1"
	apiaclsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl/v1alpha1"
	apiaclsvcv1alpha2 "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl/v1alpha2"
	"github.com/redpanda-data/console/backend/pkg/api/connect/service/clusterstatus"
	consolesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/console"
	apikafkaconnectsvcv1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/kafkaconnect/v1"
	apikafkaconnectsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/kafkaconnect/v1alpha1"
	apikafkaconnectsvcv1alpha2 "github.com/redpanda-data/console/backend/pkg/api/connect/service/kafkaconnect/v1alpha2"
	licensesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/license"
	topicsvcv1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/topic/v1"
	topicsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/topic/v1alpha1"
	topicsvcv1alpha2 "github.com/redpanda-data/console/backend/pkg/api/connect/service/topic/v1alpha2"
	transformsvcv1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/transform/v1"
	transformsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/transform/v1alpha1"
	transformsvcv1alpha2 "github.com/redpanda-data/console/backend/pkg/api/connect/service/transform/v1alpha2"
	apiusersvcv1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/user/v1"
	apiusersvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/user/v1alpha1"
	apiusersvcv1alpha2 "github.com/redpanda-data/console/backend/pkg/api/connect/service/user/v1alpha2"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
	"github.com/redpanda-data/console/backend/pkg/version"
)

// Setup connect and grpc-gateway
func (api *API) setupConnectWithGRPCGateway(r chi.Router) {
	// Setup Interceptors
	v, err := protovalidate.New()
	if err != nil {
		loggerpkg.Fatal(api.Logger, "failed to create proto validator", slog.Any("error", err))
	}

	// Define interceptors that shall be used in the community version of Console. We may add further
	// interceptors by calling the hooks.
	apiProm, err := metrics.NewPrometheus(
		metrics.WithRegistry(api.PrometheusRegistry),
		metrics.WithMetricsNamespace("redpanda_api"),
	)
	if err != nil {
		loggerpkg.Fatal(api.Logger, "failed to create prometheus adapter", slog.Any("error", err))
	}
	observerInterceptor := commoninterceptor.NewObserver(apiProm.ObserverAdapter())
	baseInterceptors := []connect.Interceptor{
		observerInterceptor,
		interceptor.NewErrorLogInterceptor(),
		interceptor.NewRequestValidationInterceptor(v, loggerpkg.Named(api.Logger, "validator")),
		interceptor.NewEndpointCheckInterceptor(&api.Cfg.Console.API, loggerpkg.Named(api.Logger, "endpoint_checker")),
	}

	api.Hooks.Route.InitConnectRPCRouter(r)

	r.Use(observerInterceptor.WrapHandler)

	// Setup gRPC-Gateway
	gwMux := runtime.NewServeMux(
		runtime.WithForwardResponseOption(GetHTTPResponseModifier()),
		runtime.WithErrorHandler(apierrors.NiceHTTPErrorHandler),
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
		runtime.WithUnescapingMode(runtime.UnescapingModeAllExceptReserved),
	)

	sunsetInterceptor := commoninterceptor.NewSunset(
		time.Date(2025, time.November, 30, 0, 0, 0, 0, time.UTC),
		commoninterceptor.WithDeprecationDate(time.Date(2025, time.May, 30, 0, 0, 0, 0, time.UTC)),
	)

	// v1
	aclSvcV1 := apiaclsvcv1.NewService(api.Cfg, loggerpkg.Named(api.Logger, "kafka_service"), api.ConsoleSvc)
	topicSvcV1 := topicsvcv1.NewService(api.Cfg, loggerpkg.Named(api.Logger, "topic_service"), api.ConsoleSvc)
	var userSvcV1 dataplanev1connect.UserServiceHandler = apiusersvcv1.NewService(api.Cfg, loggerpkg.Named(api.Logger, "user_service"), api.ConsoleSvc, api.RedpandaClientProvider)
	transformSvcV1 := transformsvcv1.NewService(api.Cfg, loggerpkg.Named(api.Logger, "transform_service"), v, api.RedpandaClientProvider)
	kafkaConnectSvcV1 := apikafkaconnectsvcv1.NewService(api.Cfg, loggerpkg.Named(api.Logger, "kafka_connect_service"), api.ConnectSvc)
	consoleTransformSvcV1 := &transformsvcv1.ConsoleService{Impl: transformSvcV1}

	// v1alpha2

	aclSvcV1alpha2 := apiaclsvcv1alpha2.NewService(api.Cfg, loggerpkg.Named(api.Logger, "kafka_service"), api.ConsoleSvc)
	topicSvcV1alpha2 := topicsvcv1alpha2.NewService(api.Cfg, loggerpkg.Named(api.Logger, "topic_service"), api.ConsoleSvc)
	var userSvcV1alpha2 dataplanev1alpha2connect.UserServiceHandler = apiusersvcv1alpha2.NewService(api.Cfg, loggerpkg.Named(api.Logger, "user_service"), api.RedpandaClientProvider, api.ConsoleSvc)
	transformSvcV1alpha2 := transformsvcv1alpha2.NewService(api.Cfg, loggerpkg.Named(api.Logger, "transform_service"), v, api.RedpandaClientProvider)
	kafkaConnectSvcV1alpha2 := apikafkaconnectsvcv1alpha2.NewService(api.Cfg, loggerpkg.Named(api.Logger, "kafka_connect_service"), api.ConnectSvc)

	// v1alpha1

	// Create OSS Connect handlers only after calling hook. We need the hook output's final list of interceptors.
	userSvcV1alpha1 := apiusersvcv1alpha1.NewService(userSvcV1alpha2)
	aclSvcV1alpha1 := apiaclsvcv1alpha1.NewService(aclSvcV1alpha2)
	kafkaConnectSvcV1alpha1 := apikafkaconnectsvcv1alpha1.NewService(kafkaConnectSvcV1alpha2)
	topicSvcV1alpha1 := topicsvcv1alpha1.NewService(topicSvcV1alpha2)
	transformSvcV1alpha1 := transformsvcv1alpha1.NewService(transformSvcV1alpha2)
	consoleSvc := consolesvc.NewService(loggerpkg.Named(api.Logger, "console_service"), api.ConsoleSvc)
	licenseSvc, err := licensesvc.NewService(loggerpkg.Named(api.Logger, "license_service"), api.RedpandaClientProvider, api.License)
	if err != nil {
		loggerpkg.Fatal(api.Logger, "failed to create license service", slog.Any("error", err))
	}
	clusterStatusSvc := clusterstatus.NewService(
		api.Cfg,
		loggerpkg.Named(api.Logger, "redpanda_cluster_status_service"),
		api.KafkaClientProvider,
		api.RedpandaClientProvider,
		api.SchemaClientProvider,
		api.ConnectSvc,
	)

	// Call Hook
	hookOutput := api.Hooks.Route.ConfigConnectRPC(ConfigConnectRPCRequest{
		BaseInterceptors: baseInterceptors,
		GRPCGatewayMux:   gwMux,
		Services: map[string]any{
			dataplanev1alpha1connect.UserServiceName:         userSvcV1alpha1,
			dataplanev1alpha1connect.ACLServiceName:          aclSvcV1alpha1,
			dataplanev1alpha1connect.KafkaConnectServiceName: kafkaConnectSvcV1alpha1,
			dataplanev1alpha1connect.TopicServiceName:        topicSvcV1alpha1,
			dataplanev1alpha1connect.TransformServiceName:    transformSvcV1alpha1,
			consolev1alpha1connect.ConsoleServiceName:        consoleSvc,
			consolev1alpha1connect.SecurityServiceName:       consolev1alpha1connect.UnimplementedSecurityServiceHandler{},
			consolev1alpha1connect.LicenseServiceName:        licenseSvc,
			consolev1alpha1connect.TransformServiceName:      consoleTransformSvcV1,
			consolev1alpha1connect.AuthenticationServiceName: &AuthenticationDefaultHandler{},
			consolev1alpha1connect.ClusterStatusServiceName:  clusterStatusSvc,
			consolev1alpha1connect.SecretServiceName:         consolev1alpha1connect.UnimplementedSecretServiceHandler{},
			dataplanev1alpha2connect.ACLServiceName:          aclSvcV1alpha2,
			dataplanev1alpha2connect.TopicServiceName:        topicSvcV1alpha2,
			dataplanev1alpha2connect.UserServiceName:         userSvcV1alpha2,
			dataplanev1alpha2connect.TransformServiceName:    transformSvcV1alpha2,
			dataplanev1alpha2connect.KafkaConnectServiceName: kafkaConnectSvcV1alpha2,
			dataplanev1alpha2connect.CloudStorageServiceName: dataplanev1alpha2connect.UnimplementedCloudStorageServiceHandler{},
			dataplanev1connect.ACLServiceName:                aclSvcV1,
			dataplanev1connect.TopicServiceName:              topicSvcV1,
			dataplanev1connect.UserServiceName:               userSvcV1,
			dataplanev1connect.TransformServiceName:          transformSvcV1,
			dataplanev1connect.KafkaConnectServiceName:       kafkaConnectSvcV1,
			dataplanev1connect.CloudStorageServiceName:       dataplanev1connect.UnimplementedCloudStorageServiceHandler{},
			dataplanev1connect.SecurityServiceName:           dataplanev1connect.UnimplementedSecurityServiceHandler{},
		},
	})

	// rewrite local variables that may have been replaced in the hooks
	// that we need to use later on in the function to register services
	// TODO properly rewrite all variables
	newUserSvcV1Alpha2, ok := hookOutput.Services[dataplanev1alpha2connect.UserServiceName].(dataplanev1alpha2connect.UserServiceHandler)
	if ok {
		userSvcV1alpha2 = newUserSvcV1Alpha2
	}
	newUserSvcV1, ok := hookOutput.Services[dataplanev1connect.UserServiceName].(dataplanev1connect.UserServiceHandler)
	if ok {
		userSvcV1 = newUserSvcV1
	}

	// Use HTTP Middlewares that are configured by the Hook
	if len(hookOutput.HTTPMiddlewares) > 0 {
		r.Use(hookOutput.HTTPMiddlewares...)
	}

	r.Mount("/v1alpha1", gwMux)
	r.Mount("/v1alpha2", gwMux)
	r.Mount("/v1", gwMux)

	// Wasm Transforms
	r.Put("/v1alpha1/transforms", transformSvcV1alpha1.HandleDeployTransform())
	r.Put("/v1alpha2/transforms", transformSvcV1alpha2.HandleDeployTransform())
	r.Put("/v1/transforms", transformSvcV1.HandleDeployTransform())

	// v1alpha1

	userSvcPathV1Alpha1, userSvcHandlerV1Alpha1 := dataplanev1alpha1connect.NewUserServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.UserServiceName].(dataplanev1alpha1connect.UserServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	aclSvcPathV1Alpha1, aclSvcHandlerV1Alpha1 := dataplanev1alpha1connect.NewACLServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.ACLServiceName].(dataplanev1alpha1connect.ACLServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	kafkaConnectPathV1Alpha1, kafkaConnectHandlerV1Alpha1 := dataplanev1alpha1connect.NewKafkaConnectServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.KafkaConnectServiceName].(dataplanev1alpha1connect.KafkaConnectServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	topicSvcPathV1Alpha1, topicSvcHandlerV1Alpha1 := dataplanev1alpha1connect.NewTopicServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.TopicServiceName].(dataplanev1alpha1connect.TopicServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	transformSvcPathV1alpha1, transformSvcHandlerV1alpha1 := dataplanev1alpha1connect.NewTransformServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.TransformServiceName].(dataplanev1alpha1connect.TransformServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))

	// Console v1alpha1

	consoleServicePath, consoleServiceHandler := consolev1alpha1connect.NewConsoleServiceHandler(
		hookOutput.Services[consolev1alpha1connect.ConsoleServiceName].(consolev1alpha1connect.ConsoleServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	securityServicePath, securityServiceHandler := consolev1alpha1connect.NewSecurityServiceHandler(
		hookOutput.Services[consolev1alpha1connect.SecurityServiceName].(consolev1alpha1connect.SecurityServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	consoleTransformSvcPath, consoleTransformSvcHandler := consolev1alpha1connect.NewTransformServiceHandler(
		hookOutput.Services[consolev1alpha1connect.TransformServiceName].(consolev1alpha1connect.TransformServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	licenseSvcPath, licenseSvcHandler := consolev1alpha1connect.NewLicenseServiceHandler(hookOutput.Services[consolev1alpha1connect.LicenseServiceName].(consolev1alpha1connect.LicenseServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	authenticationSvcPath, authenticationSvcHandler := consolev1alpha1connect.NewAuthenticationServiceHandler(hookOutput.Services[consolev1alpha1connect.AuthenticationServiceName].(consolev1alpha1connect.AuthenticationServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	clusterStatusSvcPath, clusterStatusSvcHandler := consolev1alpha1connect.NewClusterStatusServiceHandler(hookOutput.Services[consolev1alpha1connect.ClusterStatusServiceName].(consolev1alpha1connect.ClusterStatusServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	consoleSecretsServicePath, consoleSecretsServiceHandler := consolev1alpha1connect.NewSecretServiceHandler(
		hookOutput.Services[consolev1alpha1connect.SecretServiceName].(consolev1alpha1connect.SecretServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))

	// v1alpha2

	aclSvcPathV1Alpha2, aclSvcHandlerV1Alpha2 := dataplanev1alpha2connect.NewACLServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.ACLServiceName].(dataplanev1alpha2connect.ACLServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	topicSvcPathV1Alpha2, topicSvcHandlerV1Alpha2 := dataplanev1alpha2connect.NewTopicServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.TopicServiceName].(dataplanev1alpha2connect.TopicServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	userSvcPathV1Alpha2, userSvcHandlerV1alpha2 := dataplanev1alpha2connect.NewUserServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.UserServiceName].(dataplanev1alpha2connect.UserServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	transformSvcPathV1Alpha2, transformSvcHandlerV1Alpha2 := dataplanev1alpha2connect.NewTransformServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.TransformServiceName].(dataplanev1alpha2connect.TransformServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	kafkaConnectSvcPathV1Alpha2, kafkaConnectSvcHandlerV1Alpha2 := dataplanev1alpha2connect.NewKafkaConnectServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.KafkaConnectServiceName].(dataplanev1alpha2connect.KafkaConnectServiceHandler),
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	cloudStorageSvcV1Alpha2 := hookOutput.Services[dataplanev1alpha2connect.CloudStorageServiceName].(dataplanev1alpha2connect.CloudStorageServiceHandler) //nolint:revive // we control the map
	cloudStorageSvcPathV1Alpha2, cloudStorageSvcHandlerV1Alpha2 := dataplanev1alpha2connect.NewCloudStorageServiceHandler(
		cloudStorageSvcV1Alpha2,
		connect.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))

	// v1

	aclSvcPathV1, aclSvcHandlerV1 := dataplanev1connect.NewACLServiceHandler(
		hookOutput.Services[dataplanev1connect.ACLServiceName].(dataplanev1connect.ACLServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	topicSvcPathV1, topicSvcHandlerV1 := dataplanev1connect.NewTopicServiceHandler(
		hookOutput.Services[dataplanev1connect.TopicServiceName].(dataplanev1connect.TopicServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	userSvcPathV1, userSvcHandlerV1 := dataplanev1connect.NewUserServiceHandler(
		hookOutput.Services[dataplanev1connect.UserServiceName].(dataplanev1connect.UserServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	transformSvcPathV1, transformSvcHandlerV1 := dataplanev1connect.NewTransformServiceHandler(
		hookOutput.Services[dataplanev1connect.TransformServiceName].(dataplanev1connect.TransformServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	kafkaConnectSvcPathV1, kafkaConnectSvcHandlerV1 := dataplanev1connect.NewKafkaConnectServiceHandler(
		hookOutput.Services[dataplanev1connect.KafkaConnectServiceName].(dataplanev1connect.KafkaConnectServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	cloudStorageSvcV1 := hookOutput.Services[dataplanev1connect.CloudStorageServiceName].(dataplanev1connect.CloudStorageServiceHandler) //nolint:revive // we control the map
	cloudStorageSvcPathV1, cloudStorageSvcHandlerV1 := dataplanev1connect.NewCloudStorageServiceHandler(
		cloudStorageSvcV1,
		connect.WithInterceptors(hookOutput.Interceptors...))
	securitySvcV1 := hookOutput.Services[dataplanev1connect.SecurityServiceName].(dataplanev1connect.SecurityServiceHandler) //nolint:revive // we control the map
	securitySvcPathV1, securitySvcHandlerV1 := dataplanev1connect.NewSecurityServiceHandler(
		securitySvcV1,
		connect.WithInterceptors(hookOutput.Interceptors...))

	ossServices := []ConnectService{
		{
			ServiceName: dataplanev1alpha1connect.UserServiceName,
			MountPath:   userSvcPathV1Alpha1,
			Handler:     userSvcHandlerV1Alpha1,
		},
		{
			ServiceName: dataplanev1alpha1connect.ACLServiceName,
			MountPath:   aclSvcPathV1Alpha1,
			Handler:     aclSvcHandlerV1Alpha1,
		},
		{
			ServiceName: consolev1alpha1connect.ConsoleServiceName,
			MountPath:   consoleServicePath,
			Handler:     consoleServiceHandler,
		},
		{
			ServiceName: consolev1alpha1connect.AuthenticationServiceName,
			MountPath:   authenticationSvcPath,
			Handler:     authenticationSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha1connect.KafkaConnectServiceName,
			MountPath:   kafkaConnectPathV1Alpha1,
			Handler:     kafkaConnectHandlerV1Alpha1,
		},
		{
			ServiceName: dataplanev1alpha1connect.TopicServiceName,
			MountPath:   topicSvcPathV1Alpha1,
			Handler:     topicSvcHandlerV1Alpha1,
		},
		{
			ServiceName: dataplanev1alpha1connect.TransformServiceName,
			MountPath:   transformSvcPathV1alpha1,
			Handler:     transformSvcHandlerV1alpha1,
		},
		{
			ServiceName: consolev1alpha1connect.SecurityServiceName,
			MountPath:   securityServicePath,
			Handler:     securityServiceHandler,
		},
		{
			ServiceName: consolev1alpha1connect.TransformServiceName,
			MountPath:   consoleTransformSvcPath,
			Handler:     consoleTransformSvcHandler,
		},
		{
			ServiceName: consolev1alpha1connect.LicenseServiceName,
			MountPath:   licenseSvcPath,
			Handler:     licenseSvcHandler,
		},
		{
			ServiceName: consolev1alpha1connect.ClusterStatusServiceName,
			MountPath:   clusterStatusSvcPath,
			Handler:     clusterStatusSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha2connect.ACLServiceName,
			MountPath:   aclSvcPathV1Alpha2,
			Handler:     aclSvcHandlerV1Alpha2,
		},
		{
			ServiceName: dataplanev1alpha2connect.TopicServiceName,
			MountPath:   topicSvcPathV1Alpha2,
			Handler:     topicSvcHandlerV1Alpha2,
		},
		{
			ServiceName: dataplanev1alpha2connect.UserServiceName,
			MountPath:   userSvcPathV1Alpha2,
			Handler:     userSvcHandlerV1alpha2,
		},
		{
			ServiceName: dataplanev1alpha2connect.TransformServiceName,
			MountPath:   transformSvcPathV1Alpha2,
			Handler:     transformSvcHandlerV1Alpha2,
		},
		{
			ServiceName: dataplanev1alpha2connect.KafkaConnectServiceName,
			MountPath:   kafkaConnectSvcPathV1Alpha2,
			Handler:     kafkaConnectSvcHandlerV1Alpha2,
		},
		{
			ServiceName: dataplanev1alpha2connect.CloudStorageServiceName,
			MountPath:   cloudStorageSvcPathV1Alpha2,
			Handler:     cloudStorageSvcHandlerV1Alpha2,
		},
		{
			ServiceName: dataplanev1connect.ACLServiceName,
			MountPath:   aclSvcPathV1,
			Handler:     aclSvcHandlerV1,
		},
		{
			ServiceName: dataplanev1connect.TopicServiceName,
			MountPath:   topicSvcPathV1,
			Handler:     topicSvcHandlerV1,
		},
		{
			ServiceName: dataplanev1connect.UserServiceName,
			MountPath:   userSvcPathV1,
			Handler:     userSvcHandlerV1,
		},
		{
			ServiceName: dataplanev1connect.TransformServiceName,
			MountPath:   transformSvcPathV1,
			Handler:     transformSvcHandlerV1,
		},
		{
			ServiceName: dataplanev1connect.KafkaConnectServiceName,
			MountPath:   kafkaConnectSvcPathV1,
			Handler:     kafkaConnectSvcHandlerV1,
		},
		{
			ServiceName: dataplanev1connect.CloudStorageServiceName,
			MountPath:   cloudStorageSvcPathV1,
			Handler:     cloudStorageSvcHandlerV1,
		},
		{
			ServiceName: consolev1alpha1connect.SecretServiceName,
			MountPath:   consoleSecretsServicePath,
			Handler:     consoleSecretsServiceHandler,
		},
		{
			ServiceName: dataplanev1connect.SecurityServiceName,
			MountPath:   securitySvcPathV1,
			Handler:     securitySvcHandlerV1,
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

	// v1alpha1

	// Register gRPC-Gateway Handlers of OSS. Enterprise handlers are directly registered in the hook via the *runtime.ServeMux passed.
	dataplanev1alpha1connect.RegisterUserServiceHandlerGatewayServer(gwMux, userSvcV1alpha1, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha1connect.RegisterACLServiceHandlerGatewayServer(gwMux, aclSvcV1alpha1, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha1connect.RegisterKafkaConnectServiceHandlerGatewayServer(gwMux, kafkaConnectSvcV1alpha1, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha1connect.RegisterTopicServiceHandlerGatewayServer(gwMux, topicSvcV1alpha1, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha1connect.RegisterTransformServiceHandlerGatewayServer(gwMux, transformSvcV1alpha1, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))

	// v1alpha2

	dataplanev1alpha2connect.RegisterACLServiceHandlerGatewayServer(gwMux, aclSvcV1alpha2, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha2connect.RegisterTopicServiceHandlerGatewayServer(gwMux, topicSvcV1alpha2, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha2connect.RegisterUserServiceHandlerGatewayServer(gwMux, userSvcV1alpha2, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha2connect.RegisterTransformServiceHandlerGatewayServer(gwMux, transformSvcV1alpha2, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha2connect.RegisterKafkaConnectServiceHandlerGatewayServer(gwMux, kafkaConnectSvcV1alpha2, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))
	dataplanev1alpha2connect.RegisterCloudStorageServiceHandlerGatewayServer(gwMux, cloudStorageSvcV1Alpha2, connectgateway.WithInterceptors(append(hookOutput.Interceptors, sunsetInterceptor)...))

	// v1

	dataplanev1connect.RegisterACLServiceHandlerGatewayServer(gwMux, aclSvcV1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1connect.RegisterTopicServiceHandlerGatewayServer(gwMux, topicSvcV1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1connect.RegisterUserServiceHandlerGatewayServer(gwMux, userSvcV1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1connect.RegisterTransformServiceHandlerGatewayServer(gwMux, transformSvcV1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1connect.RegisterKafkaConnectServiceHandlerGatewayServer(gwMux, kafkaConnectSvcV1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1connect.RegisterCloudStorageServiceHandlerGatewayServer(gwMux, cloudStorageSvcV1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1connect.RegisterSecurityServiceHandlerGatewayServer(gwMux, securitySvcV1, connectgateway.WithInterceptors(hookOutput.Interceptors...))

	// mount

	reflector := grpcreflect.NewStaticReflector(reflectServiceNames...)
	r.Mount(grpcreflect.NewHandlerV1(reflector))
	r.Mount(grpcreflect.NewHandlerV1Alpha(reflector))
}

// All the routes for the application are defined in one place.
func (api *API) routes() *chi.Mux {
	baseRouter := chi.NewRouter()
	baseRouter.NotFound(rest.HandleNotFound(api.Logger))
	baseRouter.MethodNotAllowed(rest.HandleMethodNotAllowed(api.Logger))

	v, err := protovalidate.New()
	if err != nil {
		loggerpkg.Fatal(api.Logger, "failed to create proto validator", slog.Any("error", err))
	}
	transformSvc := transformsvcv1alpha2.NewService(api.Cfg, loggerpkg.Named(api.Logger, "transform_service"), v, api.RedpandaClientProvider)

	instrument := middleware.NewInstrument(api.Cfg.MetricsNamespace)
	recoverer := middleware.Recoverer{Logger: api.Logger}
	checkOriginFn := originsCheckFunc(api.Cfg.REST.AllowedOrigins)
	basePath := newBasePathMiddleware(
		api.Cfg.REST.BasePath,
		api.Cfg.REST.SetBasePathFromXForwardedPrefix,
		api.Cfg.REST.StripPrefix)

	baseRouter.Use(recoverer.Wrap)
	baseRouter.Use(chimiddleware.RealIP)
	baseRouter.Use(basePath.Wrap)
	baseRouter.Use(cors.Handler(cors.Options{
		AllowOriginFunc: func(r *http.Request, _ string) bool {
			isAllowed := checkOriginFn(r)
			if !isAllowed {
				api.Logger.Debug("CORS check failed", slog.String("request_origin", r.Header.Get("Origin")))
			}
			return isAllowed
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	// Fork a new router so that we can inject middlewares that are specific to the Connect API
	baseRouter.Group(func(router chi.Router) {
		api.setupConnectWithGRPCGateway(router)
	})

	baseRouter.Group(func(router chi.Router) {
		// Init middlewares - Do set up of any shared/third-party middleware and handlers
		if api.Cfg.REST.CompressionLevel > 0 {
			api.Logger.Debug("using compression for all http routes", slog.Int("level", api.Cfg.REST.CompressionLevel))
			compressor := chimiddleware.NewCompressor(api.Cfg.REST.CompressionLevel)
			router.Use(compressor.Handler)
		}

		router.Use(
			middleware.Intercept,
			instrument.Wrap,
			// TODO: Add timeout middleware which allows route excludes
		)

		// This should be called here so that you can still add middlewares in the hook function.
		// Middlewares must be defined before routes.
		api.Hooks.Route.ConfigRouter(router)

		// Private routes - these should only be accessible from within Kubernetes or a protected ingress
		router.Group(func(r chi.Router) {
			api.Hooks.Route.ConfigInternalRouter(r)
			r.Handle("/admin/metrics", promhttp.Handler())
			r.Handle("/admin/health", api.handleLivenessProbe())
			r.Handle("/admin/startup", api.handleStartupProbe())
		})

		// Debug routes
		if api.Cfg.REST.Debug.Enabled {
			router.Group(func(r chi.Router) {
				if api.Cfg.REST.Debug.ForceLoopback {
					r.Use(forceLoopbackMiddleware(api.Logger))
				}

				// Path must be prefixed with /debug otherwise it will be overridden, see: https://golang.org/pkg/net/http/pprof/
				r.Mount("/debug", chimiddleware.Profiler())
			})
		}

		// API routes
		router.Group(func(r chi.Router) {
			r.Use(createSetVersionInfoHeader(version.BuiltAt))
			api.Hooks.Route.ConfigAPIRouter(r)

			r.Route("/api", func(r chi.Router) {
				// Overview
				r.Get("/cluster", api.handleDescribeCluster())
				r.Get("/brokers", api.handleGetBrokers())
				r.Get("/brokers/{brokerID}/config", api.handleBrokerConfig())
				r.Get("/api-versions", api.handleGetAPIVersions())

				// ACLs
				r.Get("/acls", api.handleGetACLsOverview())
				r.Post("/acls", api.handleCreateACL())
				r.Delete("/acls", api.handleDeleteACLs())

				// Kafka Users/Principals
				r.Get("/users", api.handleGetUsers())
				r.Post("/users", api.handleCreateUser())
				r.Delete("/users/{principalID}", api.handleDeleteUser())

				// Topics
				r.Get("/topics-configs", api.handleGetTopicsConfigs())
				r.Get("/topics-offsets", api.handleGetTopicsOffsets())
				r.Post("/topics-records", api.handlePublishTopicsRecords())
				r.Get("/topics", api.handleGetTopics())
				r.Post("/topics", api.handleCreateTopic())
				r.Delete("/topics/{topicName}", api.handleDeleteTopic())
				r.Delete("/topics/{topicName}/records", api.handleDeleteTopicRecords())
				r.Get("/topics/{topicName}/partitions", api.handleGetPartitions())
				r.Get("/topics/{topicName}/configuration", api.handleGetTopicConfig())
				r.Patch("/topics/{topicName}/configuration", api.handleEditTopicConfig())
				r.Get("/topics/{topicName}/consumers", api.handleGetTopicConsumers())
				r.Get("/topics/{topicName}/documentation", api.handleGetTopicDocumentation())

				// Quotas
				r.Get("/quotas", api.handleGetQuotas())

				// Consumer Groups
				r.Get("/consumer-groups", api.handleGetConsumerGroups())
				r.Get("/consumer-groups/{groupId}", api.handleGetConsumerGroup())
				r.Patch("/consumer-groups/{groupId}", api.handlePatchConsumerGroup())
				r.Delete("/consumer-groups/{groupId}/offsets", api.handleDeleteConsumerGroupOffsets())
				r.Delete("/consumer-groups/{groupId}", api.handleDeleteConsumerGroup())

				// Bulk Operations
				r.Get("/operations/topic-details", api.handleGetAllTopicDetails())
				r.Get("/operations/reassign-partitions", api.handleGetPartitionReassignments())
				r.Patch("/operations/reassign-partitions", api.handlePatchPartitionAssignments())
				r.Patch("/operations/configs", api.handlePatchConfigs())

				// Schema Registry
				r.Get("/schema-registry/mode", api.handleGetSchemaRegistryMode())
				r.Get("/schema-registry/config", api.handleGetSchemaRegistryConfig())
				r.Put("/schema-registry/config", api.handlePutSchemaRegistryConfig())
				r.Put("/schema-registry/config/{subject}", api.handlePutSchemaRegistrySubjectConfig())
				r.Delete("/schema-registry/config/{subject}", api.handleDeleteSchemaRegistrySubjectConfig())
				r.Get("/schema-registry/subjects", api.handleGetSchemaSubjects())
				r.Get("/schema-registry/schemas/types", api.handleGetSchemaRegistrySchemaTypes())
				r.Get("/schema-registry/schemas/ids/{id}/versions", api.handleGetSchemaUsagesByID())
				r.Delete("/schema-registry/subjects/{subject}", api.handleDeleteSubject())
				r.Post("/schema-registry/subjects/{subject}/versions", api.handleCreateSchema())
				r.Post("/schema-registry/subjects/{subject}/versions/{version}/validate", api.handleValidateSchema())
				r.Delete("/schema-registry/subjects/{subject}/versions/{version}", api.handleDeleteSubjectVersion())
				r.Get("/schema-registry/subjects/{subject}/versions/{version}", api.handleGetSchemaSubjectDetails())
				r.Get("/schema-registry/subjects/{subject}/versions/{version}/referencedby", api.handleGetSchemaReferencedBy())

				// Kafka Connect
				r.Get("/kafka-connect/connectors", api.handleGetConnectors())
				r.Get("/kafka-connect/clusters/{clusterName}", api.handleGetClusterInfo())
				r.Get("/kafka-connect/clusters/{clusterName}/connectors", api.handleGetClusterConnectors())
				r.Post("/kafka-connect/clusters/{clusterName}/connectors", api.handleCreateConnector())
				r.Get("/kafka-connect/clusters/{clusterName}/connectors/{connector}", api.handleGetConnector())
				r.Put("/kafka-connect/clusters/{clusterName}/connectors/{connector}", api.handlePutConnectorConfig())
				r.Put("/kafka-connect/clusters/{clusterName}/connector-plugins/{pluginClassName}/config/validate", api.handlePutValidateConnectorConfig())
				r.Delete("/kafka-connect/clusters/{clusterName}/connectors/{connector}", api.handleDeleteConnector())
				r.Put("/kafka-connect/clusters/{clusterName}/connectors/{connector}/pause", api.handlePauseConnector())
				r.Put("/kafka-connect/clusters/{clusterName}/connectors/{connector}/resume", api.handleResumeConnector())
				r.Post("/kafka-connect/clusters/{clusterName}/connectors/{connector}/restart", api.handleRestartConnector())
				r.Post("/kafka-connect/clusters/{clusterName}/connectors/{connector}/tasks/{taskID}/restart", api.handleRestartConnectorTask())

				// Wasm Transforms
				r.Put("/transforms", transformSvc.HandleDeployTransform())

				// Console Endpoints that inform which endpoints & features are available to the frontend.
				r.Get("/console/endpoints", api.handleGetEndpoints())
			})

			api.Hooks.Route.ConfigAPIRouterPostRegistration(r)
		})

		if api.Cfg.ServeFrontend {
			// SPA Files
			router.Group(func(r chi.Router) {
				r.Get("/*", api.handleFrontendResources())
			})
		} else {
			api.Logger.Info("no static files will be served as serving the frontend has been disabled")
		}
	})

	return baseRouter
}
