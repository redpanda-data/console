// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package main

import (
	"context"
	"time"

	"github.com/redpanda-data/console/backend/pkg/api"
	"github.com/redpanda-data/console/backend/pkg/config"
	loggerpkg "github.com/redpanda-data/console/backend/pkg/logger"
)

func main() {
	defaultLogger := loggerpkg.NewSlogLogger()

	cfg, err := config.LoadConfig(defaultLogger)
	if err != nil {
		loggerpkg.FatalStartup("failed to load config", err)
	}
	err = cfg.Validate()
	if err != nil {
		loggerpkg.FatalStartup("failed to validate config", err)
	}

	a, err := api.New(&cfg)
	if err != nil {
		loggerpkg.FatalStartup("failed to create API", err)
	}

	// Create startup context with timeout
	startupTimeout := 6*time.Second + cfg.Kafka.Startup.TotalMaxTime()
	ctx, cancel := context.WithTimeout(context.Background(), startupTimeout)
	defer cancel()

	if err := a.Start(ctx); err != nil {
		loggerpkg.FatalStartup("failed to start API", err)
	}
}
