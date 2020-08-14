package schema

import (
	"fmt"
	"github.com/linkedin/goavro/v2"
	"golang.org/x/sync/singleflight"
)

// Service for fetching schemas from a schema registry. It has to provide an interface for other packages which is safe
// for concurrent access and also takes care of caching schemas.
type Service struct {
	cfg          Config
	requestGroup singleflight.Group

	registryClient *Client

	// Schema Cache by schema id
	cacheByID map[uint32]*goavro.Codec
}

// NewService to access schema registry. Returns an error if connection can't be established.
func NewSevice(cfg Config) *Service {
	return &Service{
		cfg:            cfg,
		requestGroup:   singleflight.Group{},
		registryClient: newClient(cfg),
		cacheByID:      make(map[uint32]*goavro.Codec),
	}
}

// CheckConnectivity to schema registry. Returns no error if connectivity is fine.
func (s *Service) CheckConnectivity() error {
	return s.registryClient.CheckConnectivity()
}

func (s *Service) GetAvroSchemaByID(schemaID uint32) (*goavro.Codec, error) {
	// Singleflight makes sure to not run the function body if there are concurrent requests. We use this to avoid
	// duplicate requests against the schema registry
	key := fmt.Sprintf("get-avro-schema-%d", schemaID)
	v, err, _ := s.requestGroup.Do(key, func() (interface{}, error) {
		if codec, exists := s.cacheByID[schemaID]; exists {
			return codec, nil
		}

		schemaRes, err := s.registryClient.GetSchemaByID(schemaID)
		if err != nil {
			// If schema registry returns an error we want to retry it next time, so let's forget the key
			s.requestGroup.Forget(key)
			return nil, fmt.Errorf("failed to get schema from registry: %w", err)
		}

		codec, err := goavro.NewCodec(schemaRes.Schema)
		if err != nil {
			// If codec compilation returns an error we want to retry it next time (maybe the schema has changed or response
			// was corrupted), so let's forget the key
			s.requestGroup.Forget(key)
			return nil, fmt.Errorf("failed to create codec from schema string: %w", err)
		}

		s.cacheByID[schemaID] = codec

		return codec, nil
	})
	if err != nil {
		return nil, err
	}

	codec := v.(*goavro.Codec)

	return codec, nil
}
