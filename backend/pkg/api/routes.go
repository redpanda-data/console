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
	"connectrpc.com/otelconnect"
	"github.com/bufbuild/protovalidate-go"
	"github.com/cloudhut/common/middleware"
	"github.com/cloudhut/common/rest"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.uber.org/zap"
	connectgateway "go.vallahaye.net/connect-gateway"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/redpanda-data/console/backend/pkg/api/connect/interceptor"
	apiaclsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl"
	consolesvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/console"
	apikafkaconnectsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/kafkaconnect"
	topicsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/topic"
	apiusersvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/user"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/version"
)

// Setup connect and grpc-gateway
func (api *API) setupConnectWithGRPCGateway(r chi.Router) {
	// Setup Interceptors
	v, err := protovalidate.New()
	if err != nil {
		api.Logger.Fatal("failed to create proto validator", zap.Error(err))
	}

	// The exposed metrics are pretty verbose (highly cardinal), but as of today we don't
	// have a way to modify what is being exposed. The buf team has an issue about making
	// this more flexible: https://github.com/connectrpc/connect-go/issues/665
	meterProvider := metric.NewMeterProvider(metric.WithReader(api.promExporter))
	otelInterceptor, err := otelconnect.NewInterceptor(
		otelconnect.WithMeterProvider(meterProvider),
		otelconnect.WithoutServerPeerAttributes(),
		otelconnect.WithoutTracing(),
	)
	if err != nil {
		api.Logger.Fatal("failed to create open telemetry interceptor", zap.Error(err))
	}

	// Define interceptors that shall be used in the community version of Console. We may add further
	// interceptors by calling the hooks.
	baseInterceptors := []connect.Interceptor{
		interceptor.NewErrorLogInterceptor(api.Logger.Named("error_log"), api.Hooks.Console.AdditionalLogFields),
		interceptor.NewRequestValidationInterceptor(v, api.Logger.Named("validator")),
		interceptor.NewEndpointCheckInterceptor(&api.Cfg.Console.API, api.Logger.Named("endpoint_checker")),
		otelInterceptor,
	}

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
	baseRouter.NotFound(rest.HandleNotFound(api.Logger))
	baseRouter.MethodNotAllowed(rest.HandleMethodNotAllowed(api.Logger))

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

	// Websockets live in it's own group because not all middlewares support websockets
	baseRouter.Group(func(wsRouter chi.Router) {
		api.Hooks.Route.ConfigWsRouter(wsRouter)

		wsRouter.Get("/api/topics/{topicName}/messages", api.handleGetMessages())
	})

	return baseRouter
}
