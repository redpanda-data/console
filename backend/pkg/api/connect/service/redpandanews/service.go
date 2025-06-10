// Package redpandanews implements the RedpandaNewsService interface for retrieving news from Redpanda's RSS feed.
package redpandanews

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"

	consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

const (
	redpandaNewsRSSURL = "https://www.redpanda.com/console-marketing-resources/rss.xml"
)

// Service implements the RedpandaNewsService interface
type Service struct {
	logger *zap.Logger
}

// NewService creates a new RedpandaNewsService
func NewService(logger *zap.Logger) *Service {
	return &Service{
		logger: logger,
	}
}

// RSSFeed represents the structure of the Redpanda news RSS feed XML.
type RSSFeed struct {
	XMLName xml.Name `xml:"rss"`
	Channel struct {
		Title       string `xml:"title"`
		Link        string `xml:"link"`
		Description string `xml:"description"`
		PubDate     string `xml:"pubDate"`
		TTL         int    `xml:"ttl"`
		Generator   string `xml:"generator"`
		Items       []struct {
			Title       string `xml:"title"`
			Link        string `xml:"link"`
			GUID        string `xml:"guid"`
			Description string `xml:"description"`
			PubDate     string `xml:"pubDate"`
		} `xml:"item"`
	} `xml:"channel"`
}

// ListRedpandaNews implements the ListRedpandaNews RPC method
func (s *Service) ListRedpandaNews(
	ctx context.Context,
	_ *connect.Request[consolev1alpha1.ListRedpandaNewsRequest],
) (*connect.Response[consolev1alpha1.ListRedpandaNewsResponse], error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, redpandaNewsRSSURL, http.NoBody)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to create HTTP request: %w", err))
	}

	httpResp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to fetch Redpanda news: %w", err))
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to fetch Redpanda news: unexpected status code %d", httpResp.StatusCode))
	}

	var feed RSSFeed
	if err := xml.NewDecoder(httpResp.Body).Decode(&feed); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to parse Redpanda news feed: %w", err))
	}

	lastUpdated, err := time.Parse(time.RFC1123, feed.Channel.PubDate)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to parse last build date: %w", err))
	}

	newsItems := make([]*consolev1alpha1.RedpandaNewsItem, 0, len(feed.Channel.Items))
	for _, item := range feed.Channel.Items {
		pubDate, err := time.Parse(time.RFC1123, item.PubDate)
		if err != nil {
			s.logger.Warn("failed to parse pubDate", zap.String("pubDate", item.PubDate), zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to parse publication date: %w", err))
		}

		newsItems = append(newsItems, &consolev1alpha1.RedpandaNewsItem{
			Title:       item.Title,
			Link:        item.Link,
			Description: item.Description,
			PubDate:     timestamppb.New(pubDate),
		})
	}

	response := &consolev1alpha1.ListRedpandaNewsResponse{
		Title:       feed.Channel.Title,
		LastUpdated: lastUpdated.Format(time.RFC3339),
		NewsItems:   newsItems,
	}

	return connect.NewResponse(response), nil
}
