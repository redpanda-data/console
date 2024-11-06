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
	"net/http"

	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"github.com/bufbuild/protovalidate-go"
	"github.com/cloudhut/common/middleware"
	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	commoninterceptor "github.com/redpanda-data/common-go/api/interceptor"
	"github.com/redpanda-data/common-go/api/metrics"
	"go.uber.org/zap"
	connectgateway "go.vallahaye.net/connect-gateway"
	"google.golang.org/protobuf/encoding/protojson"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/connect/interceptor"
	apiaclsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl/v1alpha1"
	apiaclsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl/v1alpha2"
	consolesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/console"
	apikafkaconnectsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/kafkaconnect/v1alpha1"
	apikafkaconnectsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/kafkaconnect/v1alpha2"
	licensesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/license"
	"github.com/redpanda-data/console/backend/pkg/api/connect/service/rpconnect"
	topicsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/topic/v1alpha1"
	topicsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/topic/v1alpha2"
	transformsvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/transform/v1alpha1"
	transformsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/transform/v1alpha2"
	apiusersvcv1alpha1 "github.com/redpanda-data/console/backend/pkg/api/connect/service/user/v1alpha1"
	apiusersvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/user/v1alpha2"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
	"github.com/redpanda-data/console/backend/pkg/version"
)

// Setup connect and grpc-gateway
func (api *API) setupConnectWithGRPCGateway(r chi.Router) {
	// Setup Interceptors
	v, err := protovalidate.New()
	if err != nil {
		api.Logger.Fatal("failed to create proto validator", zap.Error(err))
	}

	// Define interceptors that shall be used in the community version of Console. We may add further
	// interceptors by calling the hooks.
	apiProm, err := metrics.NewPrometheus(
		metrics.WithRegistry(prometheus.DefaultRegisterer),
		metrics.WithMetricsNamespace("redpanda_api"),
	)
	if err != nil {
		api.Logger.Fatal("failed to create prometheus adapter", zap.Error(err))
	}
	observerInterceptor := commoninterceptor.NewObserver(apiProm.ObserverAdapter())
	baseInterceptors := []connect.Interceptor{
		observerInterceptor,
		interceptor.NewErrorLogInterceptor(api.Logger.Named("error_log"), api.Hooks.Console.AdditionalLogFields),
		interceptor.NewRequestValidationInterceptor(v, api.Logger.Named("validator")),
		interceptor.NewEndpointCheckInterceptor(&api.Cfg.Console.API, api.Logger.Named("endpoint_checker")),
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

	// v1alpha2

	aclSvc := apiaclsvc.NewService(api.Cfg, api.Logger.Named("kafka_service"), api.ConsoleSvc)
	topicSvc := topicsvc.NewService(api.Cfg, api.Logger.Named("topic_service"), api.ConsoleSvc, api.RedpandaSvc)
	var userSvc dataplanev1alpha2connect.UserServiceHandler = apiusersvc.NewService(api.Cfg, api.Logger.Named("user_service"), api.RedpandaSvc, api.ConsoleSvc, api.Hooks.Authorization.IsProtectedKafkaUser)
	transformSvc := transformsvc.NewService(api.Cfg, api.Logger.Named("transform_service"), api.RedpandaSvc, v)
	kafkaConnectSvc := apikafkaconnectsvc.NewService(api.Cfg, api.Logger.Named("kafka_connect_service"), api.ConnectSvc)
	consoleTransformSvc := &transformsvc.ConsoleService{Impl: transformSvc}

	// v1alpha1

	// Create OSS Connect handlers only after calling hook. We need the hook output's final list of interceptors.
	userSvcV1alpha1 := apiusersvcv1alpha1.NewService(userSvc)
	aclSvcV1alpha1 := apiaclsvcv1alpha1.NewService(aclSvc)
	kafkaConnectSvcV1alpha1 := apikafkaconnectsvcv1alpha1.NewService(kafkaConnectSvc)
	topicSvcV1alpha1 := topicsvcv1alpha1.NewService(topicSvc)
	transformSvcV1alpha1 := transformsvcv1alpha1.NewService(transformSvc)
	consoleSvc := consolesvc.NewService(api.Logger.Named("console_service"), api.ConsoleSvc, api.Hooks.Authorization)
	securitySvc := consolev1alpha1connect.UnimplementedSecurityServiceHandler{}
	licenseSvc, err := licensesvc.NewService(api.Logger.Named("license_service"), api.Cfg, api.License, api.Hooks.Authorization)
	if err != nil {
		api.Logger.Fatal("failed to create license service", zap.Error(err))
	}
	rpConnectSvc, err := rpconnect.NewService(api.Logger.Named("redpanda_connect_service"), api.Hooks.Authorization)
	if err != nil {
		api.Logger.Fatal("failed to create redpanda connect service", zap.Error(err))
	}

	// Call Hook
	hookOutput := api.Hooks.Route.ConfigConnectRPC(ConfigConnectRPCRequest{
		BaseInterceptors: baseInterceptors,
		GRPCGatewayMux:   gwMux,
		Services: map[string]any{
			dataplanev1alpha1connect.UserServiceName:          userSvcV1alpha1,
			dataplanev1alpha1connect.ACLServiceName:           aclSvcV1alpha1,
			dataplanev1alpha1connect.KafkaConnectServiceName:  kafkaConnectSvcV1alpha1,
			dataplanev1alpha1connect.TopicServiceName:         topicSvcV1alpha1,
			dataplanev1alpha1connect.TransformServiceName:     transformSvcV1alpha1,
			consolev1alpha1connect.ConsoleServiceName:         consoleSvc,
			consolev1alpha1connect.SecurityServiceName:        securitySvc,
			consolev1alpha1connect.LicenseServiceName:         licenseSvc,
			consolev1alpha1connect.RedpandaConnectServiceName: rpConnectSvc,
			consolev1alpha1connect.TransformServiceName:       consoleTransformSvc,
			dataplanev1alpha2connect.ACLServiceName:           aclSvc,
			dataplanev1alpha2connect.TopicServiceName:         topicSvc,
			dataplanev1alpha2connect.UserServiceName:          userSvc,
			dataplanev1alpha2connect.TransformServiceName:     transformSvc,
			dataplanev1alpha2connect.KafkaConnectServiceName:  kafkaConnectSvc,
			dataplanev1alpha2connect.CloudStorageServiceName:  dataplanev1alpha2connect.UnimplementedCloudStorageServiceHandler{},
		},
	})

	// rewrite local variables that may have been replaced in the hooks
	// that we need to use later on in the function to register services
	// TODO properly rewrite all variables
	newUserSvc, ok := hookOutput.Services[dataplanev1alpha2connect.UserServiceName].(dataplanev1alpha2connect.UserServiceHandler)
	if ok {
		userSvc = newUserSvc
	}

	// Use HTTP Middlewares that are configured by the Hook
	if len(hookOutput.HTTPMiddlewares) > 0 {
		r.Use(hookOutput.HTTPMiddlewares...)
	}

	r.Mount("/v1alpha1", gwMux)
	r.Mount("/v1alpha2", gwMux)

	// Wasm Transforms
	r.Put("/v1alpha1/transforms", transformSvcV1alpha1.HandleDeployTransform())
	r.Put("/v1alpha2/transforms", transformSvc.HandleDeployTransform())

	// v1alpha1

	userSvcPathV1Alpha1, userSvcHandlerV1Alpha1 := dataplanev1alpha1connect.NewUserServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.UserServiceName].(dataplanev1alpha1connect.UserServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	aclSvcPathV1Alpha1, aclSvcHandlerV1Alpha1 := dataplanev1alpha1connect.NewACLServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.ACLServiceName].(dataplanev1alpha1connect.ACLServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	kafkaConnectPathV1Alpha1, kafkaConnectHandlerV1Alpha1 := dataplanev1alpha1connect.NewKafkaConnectServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.KafkaConnectServiceName].(dataplanev1alpha1connect.KafkaConnectServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	topicSvcPathV1Alpha1, topicSvcHandlerV1Alpha1 := dataplanev1alpha1connect.NewTopicServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.TopicServiceName].(dataplanev1alpha1connect.TopicServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	transformSvcPathV1alpha1, transformSvcHandlerV1alpha1 := dataplanev1alpha1connect.NewTransformServiceHandler(
		hookOutput.Services[dataplanev1alpha1connect.TransformServiceName].(dataplanev1alpha1connect.TransformServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))

	// Console v1alpha1

	consoleServicePath, consoleServiceHandler := consolev1alpha1connect.NewConsoleServiceHandler(
		hookOutput.Services[consolev1alpha1connect.ConsoleServiceName].(consolev1alpha1connect.ConsoleServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	securityServicePath, securityServiceHandler := consolev1alpha1connect.NewSecurityServiceHandler(
		hookOutput.Services[consolev1alpha1connect.SecurityServiceName].(consolev1alpha1connect.SecurityServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	rpconnectServicePath, rpconnectServiceHandler := consolev1alpha1connect.NewRedpandaConnectServiceHandler(
		hookOutput.Services[consolev1alpha1connect.RedpandaConnectServiceName].(consolev1alpha1connect.RedpandaConnectServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	consoleTransformSvcPath, consoleTransformSvcHandler := consolev1alpha1connect.NewTransformServiceHandler(
		hookOutput.Services[consolev1alpha1connect.TransformServiceName].(consolev1alpha1connect.TransformServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	licenseSvcPath, licenseSvcHandler := consolev1alpha1connect.NewLicenseServiceHandler(hookOutput.Services[consolev1alpha1connect.LicenseServiceName].(consolev1alpha1connect.LicenseServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))

	// v1alpha2

	aclSvcPath, aclSvcHandler := dataplanev1alpha2connect.NewACLServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.ACLServiceName].(dataplanev1alpha2connect.ACLServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	topicSvcPath, topicSvcHandler := dataplanev1alpha2connect.NewTopicServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.TopicServiceName].(dataplanev1alpha2connect.TopicServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	userSvcPath, userSvcHandler := dataplanev1alpha2connect.NewUserServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.UserServiceName].(dataplanev1alpha2connect.UserServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	transformSvcPath, transformSvcHandler := dataplanev1alpha2connect.NewTransformServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.TransformServiceName].(dataplanev1alpha2connect.TransformServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	kafkaConnectSvcPath, kafkaConnectSvcHandler := dataplanev1alpha2connect.NewKafkaConnectServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.KafkaConnectServiceName].(dataplanev1alpha2connect.KafkaConnectServiceHandler),
		connect.WithInterceptors(hookOutput.Interceptors...))
	cloudStorageSvcPath, cloudStorageSvcHandler := dataplanev1alpha2connect.NewCloudStorageServiceHandler(
		hookOutput.Services[dataplanev1alpha2connect.CloudStorageServiceName].(dataplanev1alpha2connect.CloudStorageServiceHandler),
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
			ServiceName: consolev1alpha1connect.RedpandaConnectServiceName,
			MountPath:   rpconnectServicePath,
			Handler:     rpconnectServiceHandler,
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
			ServiceName: dataplanev1alpha2connect.ACLServiceName,
			MountPath:   aclSvcPath,
			Handler:     aclSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha2connect.TopicServiceName,
			MountPath:   topicSvcPath,
			Handler:     topicSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha2connect.UserServiceName,
			MountPath:   userSvcPath,
			Handler:     userSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha2connect.TransformServiceName,
			MountPath:   transformSvcPath,
			Handler:     transformSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha2connect.KafkaConnectServiceName,
			MountPath:   kafkaConnectSvcPath,
			Handler:     kafkaConnectSvcHandler,
		},
		{
			ServiceName: dataplanev1alpha2connect.CloudStorageServiceName,
			MountPath:   cloudStorageSvcPath,
			Handler:     cloudStorageSvcHandler,
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
	dataplanev1alpha1connect.RegisterUserServiceHandlerGatewayServer(gwMux, userSvcV1alpha1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha1connect.RegisterACLServiceHandlerGatewayServer(gwMux, aclSvcV1alpha1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha1connect.RegisterKafkaConnectServiceHandlerGatewayServer(gwMux, kafkaConnectSvcV1alpha1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha1connect.RegisterTopicServiceHandlerGatewayServer(gwMux, topicSvcV1alpha1, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha1connect.RegisterTransformServiceHandlerGatewayServer(gwMux, transformSvcV1alpha1, connectgateway.WithInterceptors(hookOutput.Interceptors...))

	// v1alpha2

	dataplanev1alpha2connect.RegisterACLServiceHandlerGatewayServer(gwMux, aclSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha2connect.RegisterTopicServiceHandlerGatewayServer(gwMux, topicSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha2connect.RegisterUserServiceHandlerGatewayServer(gwMux, userSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha2connect.RegisterTransformServiceHandlerGatewayServer(gwMux, transformSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))
	dataplanev1alpha2connect.RegisterKafkaConnectServiceHandlerGatewayServer(gwMux, kafkaConnectSvc, connectgateway.WithInterceptors(hookOutput.Interceptors...))

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
		api.Logger.Fatal("failed to create proto validator", zap.Error(err))
	}
	transformSvc := transformsvc.NewService(api.Cfg, api.Logger.Named("transform_service"), api.RedpandaSvc, v)

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
				api.Logger.Debug("CORS check failed", zap.String("request_origin", r.Header.Get("Origin")))
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
			api.Logger.Debug("using compression for all http routes", zap.Int("level", api.Cfg.REST.CompressionLevel))
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
				r.Get("/cluster/overview", api.handleOverview())
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
