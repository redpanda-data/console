package tsdb

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/nakabonne/tstorage"
	"go.uber.org/zap"
	"net/http"
	"time"
)

type Service struct {
	Cfg    Config
	Logger *zap.Logger

	Storage tstorage.Storage
	OwlSvc  *owl.Service
}

func NewService(cfg Config, logger *zap.Logger, owlSvc *owl.Service) (*Service, error) {
	tsdbOpts := []tstorage.Option{
		tstorage.WithTimestampPrecision(tstorage.Seconds),
		tstorage.WithRetention(cfg.Retention),
	}
	storage, err := tstorage.NewStorage(tsdbOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create tsdb storage: %w", err)
	}
	defer storage.Close()

	return &Service{
		Cfg:     cfg,
		Logger:  logger,
		Storage: storage,
		OwlSvc:  owlSvc,
	}, nil
}

func (s *Service) Start(ctx context.Context) error {
	if !s.Cfg.Enabled {
		return nil
	}

	err := s.startBackfillFromKafkaTopic(ctx)
	if err != nil {
		s.Logger.Error("failed to backfill time series data", zap.Error(err))
	}

	err = s.startScraping(ctx)
	if err != nil {
		s.Logger.Error("failed to start scraping service for time series database", zap.Error(err))
	}

	return nil
}

func (s *Service) GetTopicSizeTimeseries(topicName string) ([]*tstorage.DataPoint, *rest.Error) {
	start := time.Now().Add(-6 * time.Hour).Unix()
	end := time.Now().Unix()
	labels := []tstorage.Label{{Name: "topic_name", Value: topicName}}

	datapoints, err := s.Storage.Select(MetricNameKafkaTopicSize, labels, start, end)
	if err != nil {
		if err == tstorage.ErrNoDataPoints {
			return nil, &rest.Error{
				Err:      fmt.Errorf("no dataoints found for the given topic"),
				Status:   http.StatusNotFound,
				Message:  "Could not find any datapoints for the given topic name",
				IsSilent: true,
			}
		}

		return nil, &rest.Error{
			Err:      err,
			Status:   http.StatusInternalServerError,
			Message:  fmt.Sprintf("Failed to get datapoints from TSDB: %v", err.Error()),
			IsSilent: false,
		}
	}

	return datapoints, nil
}

func (s *Service) startBackfillFromKafkaTopic(ctx context.Context) error {
	s.Logger.Info("backfilling time series data from Kafka")

	// Generate dummy data
	// TODO: Actually consume that from Kafka
	subtractDur := 6 * time.Hour
	startTimestamp := time.Now().Add(-subtractDur).Unix()

	// Insert a timestamp every 30 seconds until 'now'
	for ts := startTimestamp; ts < time.Now().Unix(); ts += 30 {
		err := s.Storage.InsertRows([]tstorage.Row{
			{
				Metric:    MetricNameKafkaTopicSize,
				Labels:    []tstorage.Label{{Name: "topic_name", Value: "test"}},
				DataPoint: tstorage.DataPoint{Timestamp: ts, Value: 10000},
			},
		})
		if err != nil {
			s.Logger.Error("failed to add data point", zap.Error(err))
		}
	}

	s.Logger.Info("successfully backfilled time series data from Kafka")
	return nil
}

func (s *Service) startScraping(ctx context.Context) error {
	return nil
}
