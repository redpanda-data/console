package kafka

import (
	"time"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// Service acts as interface to interact with the Kafka Cluster
type Service struct {
	Client sarama.Client
	Logger *zap.Logger
}

// Start initializes the Kafka Service and takes care of stuff like KeepAlive
func (s *Service) Start() {
	// Custom keep alive for Kafka, because: https://github.com/Shopify/sarama/issues/1487
	// The KeepAlive property in sarama doesn't work either, because of golang's buggy net module: https://github.com/golang/go/issues/31490
	go s.keepAlive()
}

func (s *Service) keepAlive() {
	log := s.Logger
	wasHealthy := false
	warningLimit := rate.NewLimiter(rate.Every(30*time.Second), 1)
	for {
		// Normal keepalive interval is 3 seconds
		time.Sleep(3 * time.Second)

		brokers := s.Client.Brokers()
		//log.Info("Kafka Keepalive", zap.Int("brokers", len(brokers)))
		connectedCount := 0

		for _, b := range brokers {

			connected, _ := b.Connected()
			if !connected {
				err := b.Open(s.Client.Config())
				if err != nil {
					log.Warn("could not open connection to broker", zap.String("broker", b.Addr()), zap.Error(err))
				} else {
					log.Info("connecting to broker", zap.String("broker", b.Addr()))
				}
				continue
			}
			connectedCount++

			_, err := b.GetMetadata(&sarama.MetadataRequest{})

			if err != nil {
				log.Warn("heartbeat to broker has errored", zap.Error(err), zap.String("broker", b.Addr()), zap.Int32("id", b.ID()))

				b.Close()
				b.Open(s.Client.Config())
			}
		}

		if connectedCount == len(brokers) {
			if !wasHealthy {
				log.Info("connection to all brokers healthy", zap.Int("brokers", connectedCount))
			}
			wasHealthy = true
		} else {
			if warningLimit.Allow() {
				log.Info("not connected to all brokers", zap.Int("connected", connectedCount), zap.Int("brokers", len(brokers)))
			}
			wasHealthy = false
		}
	}
}
