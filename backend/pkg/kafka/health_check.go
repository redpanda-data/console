package kafka

// IsHealthy checks whether it can communicate with the Kafka cluster or not
func (s *Service) IsHealthy() error {
	_, err := s.Client.Controller()
	if err != nil {
		return err
	}

	return nil
}
