package api

import (
	"os"
	"strconv"
	"time"

	"go.uber.org/zap"
)

type versionInfo struct {
	gitSha         string
	gitShaBusiness string

	gitRef         string
	gitRefBusiness string

	timestamp time.Time
}

func loadVersionInfo(logger *zap.Logger) versionInfo {
	version := versionInfo{
		gitSha:         os.Getenv("REACT_APP_KOWL_GIT_SHA"),
		gitRef:         os.Getenv("REACT_APP_KOWL_GIT_REF"),
		gitShaBusiness: os.Getenv("REACT_APP_KOWL_BUSINESS_GIT_SHA"),
		gitRefBusiness: os.Getenv("REACT_APP_KOWL_BUSINESS_GIT_REF"),
		timestamp:      time.Time{},
	}

	timestamp := os.Getenv("REACT_APP_KOWL_TIMESTAMP")
	name := "Kowl"
	if version.gitShaBusiness != "" {
		name = "Kowl Business"
	}

	// Early out: dev mode
	if version.gitSha == "" {
		version.gitSha = "dev"
		logger.Info("started "+name, zap.String("version", "dev"))
		return version
	}

	// Parse timestamp
	t1, err := strconv.ParseInt(timestamp, 10, 64)
	var timeStr1 string
	if err != nil {
		logger.Warn("failed to parse timestamp as int64", zap.String("timestamp", timestamp), zap.Error(err))
		timeStr1 = "(parsing error)"
	} else {
		version.timestamp = time.Unix(t1, 0)
		timeStr1 = version.timestamp.Format(time.RFC3339)
	}

	// Print startup message
	logger.Info("started "+name,
		zap.String("version", version.gitRef),
		zap.String("git_sha", version.gitSha),
		zap.String("built", timeStr1),
		zap.String("version_business", version.gitRefBusiness),
		zap.String("git_sha_business", version.gitShaBusiness),
	)

	return version
}
