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
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
	connectgateway "go.vallahaye.net/connect-gateway"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/redpanda-data/console/backend/pkg/api/connect/interceptor"
	apiaclsvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/acl"
	apiusersvc "github.com/redpanda-data/console/backend/pkg/api/connect/service/user"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha/consolev1alphaconnect"
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

	// Base baseInterceptors configured in OSS.
	baseInterceptors := []connect.Interceptor{
		interceptor.NewRequestValidationInterceptor(v, api.Logger.Named("validator")),
	}

	// Setup gRPC-Gateway
	gwMux := runtime.NewServeMux(
		runtime.WithErrorHandler(NiceHTTPErrorHandler),
		runtime.WithMarshalerOption(runtime.MIMEWildcard, &runtime.HTTPBodyMarshaler{
			Marshaler: &runtime.JSONPb{
				MarshalOptions: protojson.MarshalOptions{
					UseProtoNames:   true, // use snake_case
					EmitUnpopulated: true, // output zero values e.g. 0, "", false
				},
				UnmarshalOptions: protojson.UnmarshalOptions{
					DiscardUnknown: true,
				},
			},
		}),
	)
	r.Mount("/v1alpha1", gwMux) // Dataplane API

	// Call Hook
	hookOutput := api.Hooks.Route.ConfigConnectRPC(ConfigConnectRPCRequest{
		BaseInterceptors: baseInterceptors,
		GRPCGatewayMux:   gwMux,
	})

	// Create OSS Connect handlers only after calling hook. We need the hook output's final list of interceptors.
	userSvc := apiusersvc.NewService(api.Cfg, api.Logger.Named("user_service"), api.RedpandaSvc, api.ConsoleSvc, api.Hooks.Authorization.IsProtectedKafkaUser)
	aclSvc := apiaclsvc.NewService(api.Cfg, api.Logger.Named("kafka_service"), api.ConsoleSvc)

	userSvcPath, userSvcHandler := dataplanev1alpha1connect.NewUserServiceHandler(userSvc, connect.WithInterceptors(hookOutput.Interceptors...))
	aclSvcPath, aclSvcHandler := dataplanev1alpha1connect.NewACLServiceHandler(aclSvc, connect.WithInterceptors(hookOutput.Interceptors...))
	consoleServicePath, consoleServiceHandler := consolev1alphaconnect.NewConsoleServiceHandler(consolev1alphaconnect.UnimplementedConsoleServiceHandler{}, connect.WithInterceptors(hookOutput.Interceptors...))

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
			ServiceName: consolev1alphaconnect.ConsoleServiceName,
			MountPath:   consoleServicePath,
			Handler:     consoleServiceHandler,
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
			return checkOriginFn(r)
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	api.setupConnectWithGRPCGateway(baseRouter)

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

			// Path must be prefixed with /debug otherwise it will be overridden, see: https://golang.org/pkg/net/http/pprof/
			r.Mount("/debug", chimiddleware.Profiler())
		})

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
