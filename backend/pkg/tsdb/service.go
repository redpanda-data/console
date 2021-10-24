package tsdb

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"github.com/cloudhut/kowl/backend/pkg/owl"
	"github.com/nakabonne/tstorage"
	"go.uber.org/zap"
	"net/http"
	"strconv"
	"time"
)

type Service struct {
	Cfg    Config
	Logger *zap.Logger

	Storage tstorage.Storage
	// TODO: Check if we actually need the OwlSvc or whether we can rely on the KafkaSvc
	OwlSvc   *owl.Service
	KafkaSvc *kafka.Service
}

func NewService(cfg Config, logger *zap.Logger, owlSvc *owl.Service, kafkaSvc *kafka.Service) (*Service, error) {
	// Return dummy struct if not enabled
	if !cfg.Enabled {
		return &Service{
			Cfg:    cfg,
			Logger: logger,
		}, nil
	}

	tsdbOpts := []tstorage.Option{
		tstorage.WithTimestampPrecision(tstorage.Seconds),
		tstorage.WithPartitionDuration(cfg.CacheRetention / 2),
	}
	if cfg.Persistence.Disk.Enabled {
		tsdbOpts = append(tsdbOpts, []tstorage.Option{
			tstorage.WithDataPath(cfg.Persistence.Disk.DataPath),
			tstorage.WithRetention(cfg.Persistence.Disk.Retention),
		}...)
	}
	storage, err := tstorage.NewStorage(tsdbOpts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create tsdb storage: %w", err)
	}

	return &Service{
		Cfg:      cfg,
		Logger:   logger,
		Storage:  storage,
		OwlSvc:   owlSvc,
		KafkaSvc: kafkaSvc,
	}, nil
}

func (s *Service) Start(ctx context.Context) error {
	if !s.Cfg.Enabled {
		return nil
	}

	go s.startScraping(ctx)

	return nil
}

func (s *Service) IsEnabled() bool {
	return s.Cfg.Enabled
}

func (s *Service) insertTopicSize(topicName string, size float64) {
	s.Storage.InsertRows([]tstorage.Row{
		{
			Metric: MetricNameKafkaTopicSize,
			Labels: []tstorage.Label{{Name: "topic_name", Value: topicName}},
			DataPoint: tstorage.DataPoint{
				Value:     size,
				Timestamp: time.Now().Unix(),
			},
		},
	})
}

func (s *Service) GetTopicSizeTimeseries(topicName string, dur time.Duration) ([]*tstorage.DataPoint, *rest.Error) {
	labels := []tstorage.Label{{Name: "topic_name", Value: topicName}}
	start := time.Now().Add(-dur).Unix()
	end := time.Now().Unix()

	return s.getDatapoints(MetricNameKafkaTopicSize, labels, start, end)
}

func (s *Service) insertTopicPartitionLeaderSize(topicName string, partitionID int32, size float64) {
	s.Storage.InsertRows([]tstorage.Row{
		{
			Metric: MetricNameKafkaTopicPartitionLeaderSize,
			Labels: []tstorage.Label{
				{Name: "topic_name", Value: topicName},
				{Name: "partition_id", Value: strconv.Itoa(int(partitionID))},
			},
			DataPoint: tstorage.DataPoint{
				Value:     size,
				Timestamp: time.Now().Unix(),
			},
		},
	})
}

func (s *Service) insertTopicPartitionTotalSize(topicName string, partitionID int32, size float64) {
	s.Storage.InsertRows([]tstorage.Row{
		{
			Metric: MetricNameKafkaTopicPartitionTotalSize,
			Labels: []tstorage.Label{
				{Name: "topic_name", Value: topicName},
				{Name: "partition_id", Value: strconv.Itoa(int(partitionID))},
			},
			DataPoint: tstorage.DataPoint{
				Value:     size,
				Timestamp: time.Now().Unix(),
			},
		},
	})
}

func (s *Service) startScraping(ctx context.Context) {
	s.Logger.Info("started time series database scraper")
	t := time.NewTicker(15 * time.Second)
	for {
		select {
		case <-t.C:
			go s.scrapeTopicDatapoints(ctx)
		case <-ctx.Done():
			s.Logger.Info("shutting down time series database scraper due to a cancelled context")
			s.Storage.Close()
			return
		}
	}
}

func (s *Service) getDatapoints(metricName string, labels []tstorage.Label, start, end int64) ([]*tstorage.DataPoint, *rest.Error) {
	datapoints, err := s.Storage.Select(metricName, labels, start, end)
	if err != nil {
		if err == tstorage.ErrNoDataPoints {
			return nil, &rest.Error{
				Err:      fmt.Errorf("no dataoints found for the given query"),
				Status:   http.StatusNotFound,
				Message:  "Could not find any datapoints for the given query",
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
	scaledDatapoints := scaleDown(datapoints, 100)

	return scaledDatapoints, nil
}
