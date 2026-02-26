// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"runtime/debug"
	"sync"
	"time"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/serde"
)

const (
	partitionsAll int32 = -1
)

const (
	// StartOffsetRecent = High water mark - number of results
	StartOffsetRecent int64 = -1
	// StartOffsetOldest = Low water mark / oldest offset
	StartOffsetOldest int64 = -2
	// StartOffsetNewest = High water mark / Live tail
	StartOffsetNewest int64 = -3
	// StartOffsetTimestamp = Start offset is specified as unix timestamp in ms
	StartOffsetTimestamp int64 = -4

	// directionDescending = Newest messages first (high water mark to low water mark)
	directionDescending string = "desc"
	// directionAscending = Oldest messages first (low water mark to high water mark)
	directionAscending string = "asc"
)

// ListMessageRequest carries all filter, sort and cancellation options for fetching messages from Kafka
type ListMessageRequest struct {
	TopicName             string
	PartitionID           int32 // -1 for all partitions
	StartOffset           int64 // -1 for recent (high - n), -2 for oldest offset, -3 for newest offset, -4 for timestamp
	StartTimestamp        int64 // Start offset by unix timestamp in ms
	MessageCount          int   // Maximum number of messages to fetch
	FilterInterpreterCode string
	Troubleshoot          bool
	IncludeRawPayload     bool
	IgnoreMaxSizeLimit    bool
	KeyDeserializer       serde.PayloadEncoding
	ValueDeserializer     serde.PayloadEncoding

	// Pagination fields (used when PageSize > 0)
	PageToken string
	PageSize  int // Number of messages per page. When > 0, enables pagination mode.
}

// ListMessageResponse returns the requested kafka messages along with some metadata about the operation
type ListMessageResponse struct {
	ElapsedMs       float64         `json:"elapsedMs"`
	FetchedMessages int             `json:"fetchedMessages"`
	IsCancelled     bool            `json:"isCancelled"`
	Messages        []*TopicMessage `json:"messages"`
}

//go:generate mockgen -destination=./list_messages_mocks_test.go -package=console github.com/redpanda-data/console/backend/pkg/console IListMessagesProgress

// IListMessagesProgress specifies the methods 'ListMessages' will call on your progress-object.
type IListMessagesProgress interface {
	OnPhase(name string) // todo(?): eventually we might want to convert this into an enum
	OnMessage(message *TopicMessage)
	OnMessageConsumed(size int64)
	OnComplete(elapsedMs int64, isCancelled bool, nextPageToken string)
	OnError(msg string)
}

// TopicMessage represents a single message from a given Kafka topic/partition
type TopicMessage struct {
	PartitionID int32 `json:"partitionID"`
	Offset      int64 `json:"offset"`
	Timestamp   int64 `json:"timestamp"`

	Compression     string `json:"compression"`
	IsTransactional bool   `json:"isTransactional"`

	Headers []MessageHeader      `json:"headers"`
	Key     *serde.RecordPayload `json:"key"`
	Value   *serde.RecordPayload `json:"value"`

	// Below properties are used for the internal communication via Go channels
	IsMessageOk  bool   `json:"-"`
	ErrorMessage string `json:"-"`
	MessageSize  int64  `json:"-"`
}

// MessageHeader represents the deserialized key/value pair of a Kafka key + value. The key and value in Kafka is in fact
// a byte array, but keys are supposed to be strings only. Value however can be encoded in any format.
type MessageHeader serde.RecordHeader

// PartitionConsumeRequest is a partitionID along with it's calculated start and end offset.
type PartitionConsumeRequest struct {
	PartitionID   int32
	IsDrained     bool // True if the partition was not able to return as many messages as desired here
	LowWaterMark  int64
	HighWaterMark int64

	StartOffset     int64
	EndOffset       int64
	MaxMessageCount int64 // If either EndOffset or MaxMessageCount is reached the Consumer will stop.
}

// TopicConsumeRequest defines all request parameters that are sent by the Console frontend,
// for consuming messages from a Kafka topic.
type TopicConsumeRequest struct {
	TopicName             string
	MaxMessageCount       int
	Partitions            map[int32]*PartitionConsumeRequest
	FilterInterpreterCode string
	Troubleshoot          bool
	IncludeRawPayload     bool
	IgnoreMaxSizeLimit    bool
	KeyDeserializer       serde.PayloadEncoding
	ValueDeserializer     serde.PayloadEncoding
	Direction             string // "desc" or "asc" - used for message ordering
}

// ListMessages processes a list message request as sent from the Frontend. This function is responsible (mostly
// by coordinating/calling other methods) for:
// 1. Fetching the partition IDs from the requested topics by looking up the topic's metadata
// 2. Checking the availability of the requested partitions (does the topic exist, are the partitions online etc)
// 3. Requesting all low and high offsets for each partition
// 4. Constructing a TopicConsumeRequest that is used by the Kafka Service to consume the right Kafka messages
// 5. Start consume request via the Kafka Service
// 6. Send a completion message to the frontend, that will show stats about the completed (or aborted) message search
//
//nolint:cyclop // complex logic with multiple code paths
func (s *Service) ListMessages(ctx context.Context, listReq ListMessageRequest, progress IListMessagesProgress) error {
	cl, adminCl, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return err
	}

	start := time.Now()

	progress.OnPhase("Get Partitions")
	// Create array of partitionIDs which shall be consumed (always do that to ensure the requested topic exists at all)
	metadata, err := adminCl.Metadata(ctx, listReq.TopicName)
	if err != nil {
		return fmt.Errorf("failed to get metadata for topic %s: %w", listReq.TopicName, err)
	}
	topicMetadata, exist := metadata.Topics[listReq.TopicName]
	if !exist {
		return errors.New("metadata response did not contain requested topic")
	}
	if topicMetadata.Err != nil {
		return fmt.Errorf("failed to get metadata for topic %s: %w", listReq.TopicName, topicMetadata.Err)
	}

	partitionByID := make(map[int32]kadm.PartitionDetail)
	onlinePartitionIDs := make([]int32, 0)
	offlinePartitionIDs := make([]int32, 0)
	for _, partition := range topicMetadata.Partitions {
		partitionByID[partition.Partition] = partition

		if partition.Err != nil {
			offlinePartitionIDs = append(offlinePartitionIDs, partition.Partition)
			continue
		}
		onlinePartitionIDs = append(onlinePartitionIDs, partition.Partition)
	}

	var partitionIDs []int32
	if listReq.PartitionID == partitionsAll {
		if len(offlinePartitionIDs) > 0 {
			progress.OnError(
				fmt.Sprintf("%v of the requested partitions are offline. Messages will be listed from the remaining %v partitions",
					len(offlinePartitionIDs), len(onlinePartitionIDs)),
			)
		}
		partitionIDs = onlinePartitionIDs
	} else {
		// Check if requested partitionID exists
		pInfo, exists := partitionByID[listReq.PartitionID]
		if !exists {
			return fmt.Errorf("requested partitionID (%v) does not exist in topic (%v)", listReq.PartitionID, listReq.TopicName)
		}

		// Check if the requested partitionID is available
		if pInfo.Err != nil {
			return fmt.Errorf("requested partitionID (%v) is not available: %w", listReq.PartitionID, pInfo.Err)
		}
		partitionIDs = []int32{listReq.PartitionID}
	}

	progress.OnPhase("Get Watermarks and calculate consuming requests")
	startOffsets, err := adminCl.ListStartOffsets(ctx, listReq.TopicName)
	if err != nil {
		return fmt.Errorf("failed to get start offsets: %w", err)
	}
	if startOffsets.Error() != nil {
		return fmt.Errorf("failed to get start offsets: %w", startOffsets.Error())
	}

	endOffsets, err := adminCl.ListEndOffsets(ctx, listReq.TopicName)
	if err != nil {
		return fmt.Errorf("failed to get end offsets: %w", err)
	}
	if endOffsets.Error() != nil {
		return fmt.Errorf("failed to get end offsets: %w", endOffsets.Error())
	}

	// Get partition consume request by calculating start and end offsets for each partition
	var (
		consumeRequests map[int32]*PartitionConsumeRequest
		nextPageToken   string
		token           *pageToken
	)

	if listReq.PageSize > 0 {
		token, consumeRequests, nextPageToken, err = s.resolvePagedConsumeRequests(ctx, &listReq, partitionIDs, startOffsets, endOffsets)
	} else {
		consumeRequests, err = s.calculateConsumeRequests(ctx, cl, &listReq, partitionIDs, startOffsets, endOffsets)
	}
	if err != nil {
		return fmt.Errorf("failed to calculate consume request: %w", err)
	}

	if len(consumeRequests) == 0 {
		// No partitions/messages to consume, we can quit early.
		progress.OnComplete(time.Since(start).Milliseconds(), false, "")
		return nil
	}
	// Determine direction based on mode
	direction := directionAscending // Legacy mode is ascending
	// Determine the max message count for this request
	// In pagination mode, use PageSize; otherwise use MessageCount (maxResults)
	maxMessageCount := listReq.MessageCount
	if listReq.PageSize > 0 && token != nil {
		// Pagination mode: use direction from token and limit to PageSize
		direction = token.Direction
		maxMessageCount = listReq.PageSize
	}

	topicConsumeRequest := TopicConsumeRequest{
		TopicName:             listReq.TopicName,
		MaxMessageCount:       maxMessageCount,
		Partitions:            consumeRequests,
		FilterInterpreterCode: listReq.FilterInterpreterCode,
		Troubleshoot:          listReq.Troubleshoot,
		IncludeRawPayload:     listReq.IncludeRawPayload,
		IgnoreMaxSizeLimit:    listReq.IgnoreMaxSizeLimit,
		KeyDeserializer:       listReq.KeyDeserializer,
		ValueDeserializer:     listReq.ValueDeserializer,
		Direction:             direction,
	}

	progress.OnPhase("Consuming messages")
	err = s.fetchMessages(ctx, cl, progress, topicConsumeRequest)
	if err != nil {
		progress.OnError(err.Error())
		return nil
	}

	isCancelled := ctx.Err() != nil
	progress.OnComplete(time.Since(start).Milliseconds(), isCancelled, nextPageToken)
	if isCancelled {
		return errors.New("request was cancelled while waiting for messages")
	}

	return nil
}

// resolvePagedConsumeRequests resolves the page token and calculates consume requests for pagination mode.
func (s *Service) resolvePagedConsumeRequests(
	ctx context.Context,
	listReq *ListMessageRequest,
	partitionIDs []int32,
	startOffsets, endOffsets kadm.ListedOffsets,
) (*pageToken, map[int32]*PartitionConsumeRequest, string, error) {
	if listReq.FilterInterpreterCode != "" {
		return nil, nil, "", errors.New("cannot use filters with pagination")
	}

	token, err := s.resolvePageToken(listReq, startOffsets, endOffsets)
	if err != nil {
		return nil, nil, "", err
	}

	consumeRequests, nextPageToken, err := s.calculateConsumeRequestsWithPageToken(ctx, token, partitionIDs, startOffsets, endOffsets)
	if err != nil {
		return nil, nil, "", fmt.Errorf("failed to calculate consume request with page token: %w", err)
	}

	return token, consumeRequests, nextPageToken, nil
}

// resolvePageToken decodes an existing page token or creates an initial one.
func (*Service) resolvePageToken(listReq *ListMessageRequest, startOffsets, endOffsets kadm.ListedOffsets) (*pageToken, error) {
	if listReq.PageToken != "" {
		return decodePageToken(listReq.PageToken)
	}

	direction := directionDescending
	if listReq.StartOffset == StartOffsetOldest {
		direction = directionAscending
	}

	return createInitialPageToken(listReq.TopicName, startOffsets, endOffsets, listReq.PageSize, direction)
}

// calculateConsumeRequests is supposed to calculate the start and end offsets for each partition consumer, so that
// we'll end up with ${messageCount} messages in total. To do so we'll take the known low and high watermarks into
// account. Gaps between low and high watermarks (caused by compactions) will be neglected for now.
// This function will return a map of PartitionConsumeRequests, keyed by the respective PartitionID. An error will
// be returned if it fails to request the partition offsets for the given timestamp.
// makes it harder to understand how the consume request is calculated in total though.
//
//nolint:cyclop,gocognit // This is indeed a complex function. Breaking this into multiple smaller functions possibly
func (s *Service) calculateConsumeRequests(
	ctx context.Context,
	cl *kgo.Client,
	listReq *ListMessageRequest,
	partitionIDs []int32,
	startOffsets, endOffsets kadm.ListedOffsets,
) (map[int32]*PartitionConsumeRequest, error) {
	requests := make(map[int32]*PartitionConsumeRequest)

	predictableResults := listReq.StartOffset != StartOffsetNewest && listReq.FilterInterpreterCode == ""

	// Resolve offsets by partitionID if the user sent a timestamp as start offset
	var startOffsetByPartitionID map[int32]int64
	if listReq.StartOffset == StartOffsetTimestamp {
		partitionIDs := make([]int32, 0)
		startOffsets.Each(func(offset kadm.ListedOffset) {
			partitionIDs = append(partitionIDs, offset.Partition)
		})
		offsets, err := s.requestOffsetsByTimestamp(ctx, cl, listReq.TopicName, partitionIDs, listReq.StartTimestamp)
		if err != nil {
			return nil, fmt.Errorf("failed to get start offset by timestamp: %w", err)
		}
		startOffsetByPartitionID = offsets
	}

	// Init result map
	notInitialized := int64(-100)
	for _, partitionID := range partitionIDs {
		startOffset, startExists := startOffsets.Lookup(listReq.TopicName, partitionID)
		endOffset, endExists := endOffsets.Lookup(listReq.TopicName, partitionID)

		// Check if partition offsets are missing from the response (exists=false means the
		// partition is not in the map, possibly due to ACL restrictions on internal topics)
		if !startExists {
			s.logger.WarnContext(ctx,
				"skipping partition: start offset not in response",
				slog.String("topic", listReq.TopicName),
				slog.Int("partition", int(partitionID)),
			)
			continue
		}
		if !endExists {
			s.logger.WarnContext(ctx,
				"skipping partition: end offset not in response",
				slog.String("topic", listReq.TopicName),
				slog.Int("partition", int(partitionID)),
			)
			continue
		}

		// Check for errors on the partition offsets that are in the response
		if startOffset.Err != nil {
			s.logger.WarnContext(ctx,
				"skipping partition: failed to get start offset",
				slog.String("topic", listReq.TopicName),
				slog.Int("partition", int(partitionID)),
				slog.Any("error", startOffset.Err),
			)
			continue
		}
		if endOffset.Err != nil {
			s.logger.WarnContext(ctx,
				"skipping partition: failed to get end offset",
				slog.String("topic", listReq.TopicName),
				slog.Int("partition", int(partitionID)),
				slog.Any("error", endOffset.Err),
			)
			continue
		}

		p := PartitionConsumeRequest{
			PartitionID:   startOffset.Partition,
			IsDrained:     false,
			LowWaterMark:  startOffset.Offset,
			HighWaterMark: endOffset.Offset,
			StartOffset:   notInitialized,

			// End is limited by high watermark or max message count
			// -1 is necessary because mark.High - 1 is the last message which can actually be consumed
			EndOffset:       endOffset.Offset - 1,
			MaxMessageCount: 0,
		}

		switch listReq.StartOffset {
		case StartOffsetRecent:
			p.StartOffset = endOffset.Offset // StartOffset will be recalculated later
		case StartOffsetOldest:
			p.StartOffset = startOffset.Offset
		case StartOffsetNewest:
			// In Live tail mode we consume onwards until max results are reached. Start Offset is always high watermark
			// and end offset is always MaxInt64.
			p.StartOffset = -1
		case StartOffsetTimestamp:
			// Request start offset by timestamp first and then consider it like a normal forward consuming / custom offset
			offset, exists := startOffsetByPartitionID[startOffset.Partition]
			if !exists {
				s.logger.WarnContext(ctx, "resolved start offset (by timestamp) does not exist for this partition",
					slog.String("topic", listReq.TopicName),
					slog.Int("partition_id", int(startOffset.Partition)))
			}
			if offset < 0 {
				// If there's no newer message than the given offset is -1 here, let's replace this with the newest
				// consumable offset which equals to high water mark - 1.
				offset = endOffset.Offset - 1
			}
			p.StartOffset = offset
		default:
			// Either custom offset or resolved offset by timestamp is given
			p.StartOffset = max(listReq.StartOffset,
				// TODO: Add some note that custom offset was lower than low watermark
				startOffset.Offset)
		}

		// Special handling for live tail and requests with enabled filter code as we don't know how many results on each
		// partition we'll get (which is required for the "roundrobin" approach).
		if !predictableResults {
			// We don't care about balanced results across partitions
			p.MaxMessageCount = int64(listReq.MessageCount)
			if listReq.StartOffset == StartOffsetNewest {
				p.EndOffset = math.MaxInt64
			}
			if listReq.StartOffset == StartOffsetRecent {
				p.StartOffset = max(p.HighWaterMark-1-int64(listReq.MessageCount), 0)
			}
		}

		requests[startOffset.Partition] = &p
	}

	// Validate that at least one partition was successfully processed
	if len(requests) == 0 {
		return nil, fmt.Errorf("no partitions available for consumption: all partitions failed offset retrieval. Check topic availability and permissions for %q", listReq.TopicName)
	}

	if !predictableResults {
		// Predictable results are required for the balancing method we usually try to apply. If that's not possible
		// we can quit early as there won't be any balancing across partitions enforced.
		return requests, nil
	}

	// We strive to return an equal number of messages across all requested partitions.
	// Round robin through partitions until either listReq.MaxMessageCount is reached or all partitions are drained
	remainingMessages := listReq.MessageCount
	yieldingPartitions := len(requests)

	for remainingMessages > 0 {
		// Check if there is at least one partition which can still return more messages
		if yieldingPartitions == 0 {
			break
		}

		for _, req := range requests {
			// If partition is already drained we must ignore it
			if req.IsDrained || remainingMessages == 0 {
				continue
			}

			if listReq.StartOffset == StartOffsetRecent {
				isDrained := req.StartOffset == req.LowWaterMark
				if isDrained {
					req.IsDrained = true
					yieldingPartitions--
					continue
				}

				// Consume "backwards" by lowering the start offset
				req.StartOffset--
			} else {
				// We add +1 because the start offset itself is a consumable message
				maxDelta := req.EndOffset - req.StartOffset + 1
				isDrained := maxDelta == req.MaxMessageCount
				if isDrained {
					req.IsDrained = true
					yieldingPartitions--
					continue
				}

				// We don't need to increase an endOffset here, because we'll increase the max message count.
				// The partition consumer will then consume forward until it has either reached the high watermark
				// or the desired number of max message count. However we still need to iterate through these partitions
				// in order to check if other partitions may assist in fulfilling the requested message count.
			}

			req.MaxMessageCount++
			remainingMessages--
		}
	}

	// Finally clean up results and remove those partition requests which had been initialized but are not needed
	filteredRequests := make(map[int32]*PartitionConsumeRequest)
	for pID, req := range requests {
		if req.MaxMessageCount == 0 {
			continue
		}

		filteredRequests[pID] = req
	}

	return filteredRequests, nil
}

type partitionState struct {
	cursor                partitionCursor
	updatedLowWaterMark   int64
	updatedHighWaterMark  int64
	nextOffsetForNextPage int64
	messagesAvailable     int64
	isDrained             bool
}

// collectPartitionStates iterates the token's partition cursors, checks water marks,
// handles compaction adjustment and exhaustion, and returns active partition states.
func (s *Service) collectPartitionStates(
	ctx context.Context,
	token *pageToken,
	startOffsets, endOffsets kadm.ListedOffsets,
) []*partitionState {
	states := make([]*partitionState, 0, len(token.Partitions))

	for _, cursor := range token.Partitions {
		// Get current water marks
		startOffset, exists := startOffsets.Lookup(token.TopicName, cursor.ID)
		if !exists {
			s.logger.WarnContext(ctx, "partition from token not found in startOffsets, skipping",
				slog.String("topic", token.TopicName),
				slog.Int("partition", int(cursor.ID)))
			continue
		}

		endOffset, exists := endOffsets.Lookup(token.TopicName, cursor.ID)
		if !exists {
			s.logger.WarnContext(ctx, "partition from token not found in endOffsets, skipping",
				slog.String("topic", token.TopicName),
				slog.Int("partition", int(cursor.ID)))
			continue
		}

		// Update water marks in case they've changed
		updatedLowWaterMark := startOffset.Offset
		updatedHighWaterMark := endOffset.Offset

		// Adjust for compaction: if the low watermark moved past our
		// next offset, skip ahead to avoid reading deleted/compacted offsets.
		if cursor.NextOffset < updatedLowWaterMark {
			s.logger.DebugContext(ctx, "adjusting nextOffset due to compaction",
				slog.String("topic", token.TopicName),
				slog.Int("partition", int(cursor.ID)),
				slog.Int64("old_next_offset", cursor.NextOffset),
				slog.Int64("new_low_watermark", updatedLowWaterMark))
			cursor.NextOffset = updatedLowWaterMark
		}

		// Check if partition is exhausted based on direction
		var isExhausted bool
		if token.Direction == directionDescending {
			// Descending: exhausted when nextOffset < lowWaterMark
			isExhausted = cursor.NextOffset < updatedLowWaterMark
		} else {
			// Ascending: exhausted when nextOffset >= highWaterMark
			isExhausted = cursor.NextOffset >= updatedHighWaterMark
		}

		if isExhausted {
			// Partition exhausted, don't include in next token
			s.logger.DebugContext(ctx, "partition exhausted",
				slog.String("topic", token.TopicName),
				slog.Int("partition", int(cursor.ID)),
				slog.Int64("next_offset", cursor.NextOffset),
				slog.String("direction", token.Direction))
			continue
		}

		// Calculate available messages for this partition
		var messagesAvailable int64
		if token.Direction == directionDescending {
			// Available from nextOffset down to lowWaterMark (inclusive)
			messagesAvailable = cursor.NextOffset - updatedLowWaterMark + 1
		} else {
			// Available from nextOffset up to highWaterMark (exclusive)
			messagesAvailable = updatedHighWaterMark - cursor.NextOffset
		}

		if messagesAvailable <= 0 {
			continue
		}

		states = append(states, &partitionState{
			cursor:               cursor,
			updatedLowWaterMark:  updatedLowWaterMark,
			updatedHighWaterMark: updatedHighWaterMark,
			messagesAvailable:    messagesAvailable,
			isDrained:            false,
		})
	}

	return states
}

// calculateConsumeRequestsWithPageToken calculates consume requests for pagination mode (descending order).
// It returns the consume requests map, the next page token, and whether more pages are available.
func (s *Service) calculateConsumeRequestsWithPageToken(
	ctx context.Context,
	token *pageToken,
	requestedPartitionIDs []int32,
	startOffsets, endOffsets kadm.ListedOffsets,
) (map[int32]*PartitionConsumeRequest, string, error) {
	requests := make(map[int32]*PartitionConsumeRequest)

	// Validate partition count hasn't changed
	if int32(len(requestedPartitionIDs)) != int32(len(token.Partitions)) {
		return nil, "", fmt.Errorf("partition count changed: expected %d, got %d", len(token.Partitions), len(requestedPartitionIDs))
	}

	// Collect partition states and check exhaustion
	partitionStates := s.collectPartitionStates(ctx, token, startOffsets, endOffsets)

	// If no partitions available, return empty
	if len(partitionStates) == 0 {
		return requests, "", nil
	}

	// Distribute pageSize across partitions using bulk allocation
	requests = distributePageSize(int64(token.PageSize), partitionStates)

	// Calculate actual read ranges and build next page token
	nextToken, anyPartitionHasMore := s.calculateReadRanges(token, partitionStates, requests)

	// Log detailed partition information for debugging
	totalAssigned := int64(0)
	for partID, req := range requests {
		totalAssigned += req.MaxMessageCount
		s.logger.DebugContext(ctx, "partition consume request",
			slog.Int("partition_id", int(partID)),
			slog.Int64("start_offset", req.StartOffset),
			slog.Int64("end_offset", req.EndOffset),
			slog.Int64("max_message_count", req.MaxMessageCount))
	}

	s.logger.DebugContext(ctx, "pagination distribution complete",
		slog.Int("page_size", token.PageSize),
		slog.Int64("total_assigned", totalAssigned),
		slog.Int("num_partitions", len(requests)))

	// If no partitions have more data, return empty token
	if !anyPartitionHasMore {
		return requests, "", nil
	}

	// Encode next token
	encodedNextToken, err := nextToken.Encode()
	if err != nil {
		return nil, "", fmt.Errorf("failed to encode next page token: %w", err)
	}

	return requests, encodedNextToken, nil
}

// distributePageSize distributes pageSize messages across partitions
func distributePageSize(pageSize int64, partitionStates []*partitionState) map[int32]*PartitionConsumeRequest {
	requests := make(map[int32]*PartitionConsumeRequest, len(partitionStates))

	for _, state := range partitionStates {
		requests[state.cursor.ID] = &PartitionConsumeRequest{
			PartitionID:     state.cursor.ID,
			IsDrained:       false,
			LowWaterMark:    state.updatedLowWaterMark,
			HighWaterMark:   state.updatedHighWaterMark,
			StartOffset:     state.cursor.NextOffset,
			EndOffset:       state.cursor.NextOffset,
			MaxMessageCount: 0,
		}
	}

	activeCount := int64(len(partitionStates))
	baseAllocation := pageSize / activeCount

	excess := int64(0)
	for _, state := range partitionStates {
		req := requests[state.cursor.ID]
		req.MaxMessageCount = min(baseAllocation, state.messagesAvailable)
		if req.MaxMessageCount >= state.messagesAvailable {
			state.isDrained = true
			excess += baseAllocation - req.MaxMessageCount
		}
	}

	toDistribute := pageSize%activeCount + excess

	for toDistribute > 0 {
		progressMade := false
		for _, state := range partitionStates {
			if toDistribute == 0 {
				break
			}
			if state.isDrained {
				continue
			}
			req := requests[state.cursor.ID]
			if req.MaxMessageCount >= state.messagesAvailable {
				state.isDrained = true
				continue
			}
			req.MaxMessageCount++
			toDistribute--
			progressMade = true
		}
		if !progressMade {
			break
		}
	}

	return requests
}

// calculateReadRanges calculates actual read ranges for each partition and builds the next page token.
// It modifies requests in place, removing partitions with no assigned messages and updating
// offsets. It returns the next page token and whether any partition has more data.
func (*Service) calculateReadRanges(
	token *pageToken,
	partitionStates []*partitionState,
	requests map[int32]*PartitionConsumeRequest,
) (*pageToken, bool) {
	nextToken := &pageToken{
		TopicName:  token.TopicName,
		Partitions: make([]partitionCursor, 0, len(token.Partitions)),
		Direction:  token.Direction,
		PageSize:   token.PageSize,
	}

	anyPartitionHasMore := false

	for _, state := range partitionStates {
		req := requests[state.cursor.ID]

		if req.MaxMessageCount == 0 {
			// No messages assigned to this partition, remove it
			delete(requests, state.cursor.ID)
			continue
		}

		// Calculate the actual read range based on direction
		var readStart, readEnd int64
		var nextOffsetForNextPage int64

		if token.Direction == directionDescending {
			// Descending: read from (nextOffset - count + 1) to nextOffset
			readStart = max(state.cursor.NextOffset-req.MaxMessageCount+1, state.updatedLowWaterMark)
			readEnd = state.cursor.NextOffset
			nextOffsetForNextPage = readStart - 1
		} else {
			// Ascending: read from nextOffset to (nextOffset + count - 1)
			readStart = state.cursor.NextOffset
			readEnd = state.cursor.NextOffset + req.MaxMessageCount - 1
			if readEnd >= state.updatedHighWaterMark {
				readEnd = state.updatedHighWaterMark - 1
			}
			nextOffsetForNextPage = readEnd + 1
		}

		// Update request with calculated ranges
		req.StartOffset = readStart
		req.EndOffset = readEnd
		// If the actual range is smaller (near water marks), adjust MaxMessageCount
		actualAvailable := readEnd - readStart + 1
		if actualAvailable < req.MaxMessageCount {
			req.MaxMessageCount = actualAvailable
		}

		// Determine if this partition has more messages for next page
		var hasMore bool
		if token.Direction == directionDescending {
			hasMore = nextOffsetForNextPage >= state.updatedLowWaterMark
		} else {
			hasMore = nextOffsetForNextPage < state.updatedHighWaterMark
		}

		if hasMore {
			anyPartitionHasMore = true
		}

		// Store next offset for this partition
		state.nextOffsetForNextPage = nextOffsetForNextPage

		// Add to next token
		nextToken.Partitions = append(nextToken.Partitions, partitionCursor{
			ID:            state.cursor.ID,
			NextOffset:    nextOffsetForNextPage,
			LowWaterMark:  state.updatedLowWaterMark,
			HighWaterMark: state.updatedHighWaterMark,
		})
	}

	return nextToken, anyPartitionHasMore
}

// FetchMessages is in charge of fulfilling the topic consume request. This is tricky
// in many cases, often due to the fact that we can't consume backwards, but we offer
// users to consume the most recent messages.
func (s *Service) fetchMessages(ctx context.Context, cl *kgo.Client, progress IListMessagesProgress, consumeReq TopicConsumeRequest) error {
	// 1. Assign partitions with right start offsets and create client
	partitionOffsets := make(map[string]map[int32]kgo.Offset)
	partitionOffsets[consumeReq.TopicName] = make(map[int32]kgo.Offset)
	for _, req := range consumeReq.Partitions {
		offset := kgo.NewOffset().At(req.StartOffset)
		partitionOffsets[consumeReq.TopicName][req.PartitionID] = offset
	}

	opts := append(cl.Opts(), kgo.ConsumePartitions(partitionOffsets))
	client, err := kgo.NewClient(opts...)
	if err != nil {
		return fmt.Errorf("failed to create new kafka client: %w", err)
	}
	defer client.Close()

	// 2. Create consumer workers
	// Reduced from 100 to 20 to limit memory usage in serverless environments
	// With large records (up to 1MB), 100 records = 1GB+ after deserialization
	jobs := make(chan *kgo.Record, 20)
	resultsCh := make(chan *TopicMessage, 20)
	workerCtx, cancel := context.WithCancelCause(ctx)
	defer cancel(errors.New("worker cancel"))

	wg := sync.WaitGroup{}

	// If we use more than one worker the order of messages in each partition gets lost. Hence we only use it where
	// multiple workers are actually beneficial - for potentially high throughput stream requests.
	workerCount := 1
	if consumeReq.FilterInterpreterCode != "" {
		workerCount = 6
	}
	for i := 0; i < workerCount; i++ {
		// Setup JavaScript interpreter
		isMessageOK, err := s.setupInterpreter(consumeReq.FilterInterpreterCode)
		if err != nil {
			s.logger.ErrorContext(ctx, "failed to setup interpreter", slog.Any("error", err))
			progress.OnError(fmt.Sprintf("failed to setup interpreter: %v", err.Error()))
			return err
		}

		wg.Add(1)
		go s.startMessageWorker(workerCtx, &wg, isMessageOK, jobs, resultsCh,
			consumeReq)
	}
	// Close the results channel once all workers have finished processing jobs and therefore no senders are left anymore
	go func() {
		wg.Wait()
		close(resultsCh)
	}()

	// 3. Start go routine that consumes messages from Kafka and produces these records on the jobs channel so that these
	// can be decoded by our workers.
	go s.consumeKafkaMessages(workerCtx, client, consumeReq, jobs)

	// 4. Receive decoded messages until our request is satisfied. Once that's the case we will cancel the context
	// that propagate to all the launched go routines.
	messageCount := 0
	messageCountByPartition := make(map[int32]int64)

	// For descending order, we need to collect messages per partition and reverse them
	messagesPerPartition := make(map[int32][]*TopicMessage)

	for msg := range resultsCh {
		// Since a 'kafka message' is likely transmitted in compressed batches this size is not really accurate
		progress.OnMessageConsumed(msg.MessageSize)
		partitionReq := consumeReq.Partitions[msg.PartitionID]

		if msg.IsMessageOk && messageCountByPartition[msg.PartitionID] < partitionReq.MaxMessageCount {
			messageCount++
			messageCountByPartition[msg.PartitionID]++

			if consumeReq.Direction == directionDescending {
				// Collect messages for reversal
				messagesPerPartition[msg.PartitionID] = append(messagesPerPartition[msg.PartitionID], msg)
			} else {
				// Stream messages immediately in ascending order
				progress.OnMessage(msg)
			}
		}

		// Do we need more messages to satisfy the user request? Return if request is satisfied
		isRequestSatisfied := messageCount == consumeReq.MaxMessageCount
		if isRequestSatisfied {
			break
		}
	}

	// If descending order, reverse and send messages
	if consumeReq.Direction == directionDescending {
		// Reverse messages in each partition
		for _, messages := range messagesPerPartition {
			for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
				messages[i], messages[j] = messages[j], messages[i]
			}

			// Send reversed messages
			for _, msg := range messages {
				progress.OnMessage(msg)
			}
		}
	}

	return nil
}

// requestOffsetsByTimestamp returns the offset that has been resolved for the given timestamp in a map which is indexed
// by partitionID.
func (*Service) requestOffsetsByTimestamp(ctx context.Context, cl *kgo.Client, topicName string, partitionIDs []int32, timestamp int64) (map[int32]int64, error) {
	req := kmsg.NewListOffsetsRequest()
	topicReq := kmsg.NewListOffsetsRequestTopic()
	topicReq.Topic = topicName

	partitionReqs := make([]kmsg.ListOffsetsRequestTopicPartition, len(partitionIDs))
	for i, partitionID := range partitionIDs {
		partitionReq := kmsg.NewListOffsetsRequestTopicPartition()
		partitionReq.Partition = partitionID
		partitionReq.Timestamp = timestamp
		partitionReqs[i] = partitionReq
	}

	topicReq.Partitions = partitionReqs
	req.Topics = []kmsg.ListOffsetsRequestTopic{topicReq}

	kres, err := req.RequestWith(ctx, cl)
	if err != nil {
		return nil, err
	}

	offsetByPartition := make(map[int32]int64)
	for _, topic := range kres.Topics {
		for _, partition := range topic.Partitions {
			typedErr := kerr.TypedErrorForCode(partition.ErrorCode)
			if typedErr != nil {
				return nil, fmt.Errorf("failed to get timestamp for at least one partition. Inner Kafka error: %w", typedErr)
			}
			offsetByPartition[partition.Partition] = partition.Offset
		}
	}

	return offsetByPartition, nil
}

func (s *Service) startMessageWorker(ctx context.Context, wg *sync.WaitGroup,
	isMessageOK isMessageOkFunc, jobs <-chan *kgo.Record, resultsCh chan<- *TopicMessage,
	consumeReq TopicConsumeRequest,
) {
	defer wg.Done()
	defer func() {
		if r := recover(); r != nil {
			s.logger.ErrorContext(ctx, "recovered from panic in message worker",
				slog.Any("error", r),
				slog.String("stack_trace", string(debug.Stack())),
				slog.String("topic", consumeReq.TopicName))
		}
	}()

	for record := range jobs {
		// We consume control records because the last message in a partition we expect might be a control record.
		// We need to acknowledge that we received the message but it is ineligible to be sent to the frontend.
		// Quit early if it is a control record!
		isControlRecord := record.Attrs.IsControl()
		if isControlRecord {
			topicMessage := &TopicMessage{
				PartitionID: record.Partition,
				Offset:      record.Offset,
				Timestamp:   record.Timestamp.UnixNano() / int64(time.Millisecond),
				IsMessageOk: false,
				MessageSize: int64(len(record.Key) + len(record.Value)),
			}

			select {
			case <-ctx.Done():
				return
			case resultsCh <- topicMessage:
				continue
			}
		}

		// Run Interpreter filter and check if message passes the filter
		deserializedRec := s.serdeSvc.DeserializeRecord(
			ctx,
			record,
			serde.DeserializationOptions{
				MaxPayloadSize:     s.cfg.Serde.MaxDeserializationPayloadSize,
				Troubleshoot:       consumeReq.Troubleshoot,
				IncludeRawData:     consumeReq.IncludeRawPayload,
				IgnoreMaxSizeLimit: consumeReq.IgnoreMaxSizeLimit,
				KeyEncoding:        consumeReq.KeyDeserializer,
				ValueEncoding:      consumeReq.ValueDeserializer,
			})

		headersByKey := make(map[string][]byte, len(deserializedRec.Headers))
		headers := make([]MessageHeader, 0)
		for _, header := range deserializedRec.Headers {
			headersByKey[header.Key] = header.Value
			headers = append(headers, MessageHeader(header))
		}

		// Check if message passes filter code
		args := interpreterArguments{
			PartitionID:   record.Partition,
			Offset:        record.Offset,
			Timestamp:     record.Timestamp,
			Key:           deserializedRec.Key.DeserializedPayload,
			Value:         deserializedRec.Value.DeserializedPayload,
			HeadersByKey:  headersByKey,
			KeySchemaID:   deserializedRec.Key.SchemaID,
			ValueSchemaID: deserializedRec.Value.SchemaID,
		}

		isOK, err := isMessageOK(args)
		var errMessage string
		if err != nil {
			s.logger.DebugContext(ctx, "failed to check if message is ok", slog.Any("error", err))
			errMessage = fmt.Sprintf("Failed to check if message is ok (partition: '%v', offset: '%v'). Err: %v", record.Partition, record.Offset, err)
		}

		topicMessage := &TopicMessage{
			PartitionID:     record.Partition,
			Offset:          record.Offset,
			Timestamp:       record.Timestamp.UnixNano() / int64(time.Millisecond),
			Headers:         headers,
			Compression:     compressionTypeDisplayname(record.Attrs.CompressionType()),
			IsTransactional: record.Attrs.IsTransactional(),
			Key:             deserializedRec.Key,
			Value:           deserializedRec.Value,
			IsMessageOk:     isOK,
			ErrorMessage:    errMessage,
			MessageSize:     int64(len(record.Key) + len(record.Value)),
		}

		select {
		case <-ctx.Done():
			return
		case resultsCh <- topicMessage:
		}
	}
}

// consumeKafkaMessages consumes messages for the consume request and sends responses to the jobs channel.
// This function will close the channel.
// The caller is responsible for closing the client if desired.
func (s *Service) consumeKafkaMessages(ctx context.Context, client *kgo.Client, consumeReq TopicConsumeRequest, jobs chan<- *kgo.Record) {
	defer close(jobs)

	// Track which partitions have finished reading
	finishedPartitions := make(map[int32]bool)
	remainingPartitionRequests := len(consumeReq.Partitions)

	for {
		select {
		case <-ctx.Done():
			return
		default:
			fetches := client.PollFetches(ctx)
			fetchErrors := fetches.Errors()
			for _, err := range fetchErrors {
				// We cancel the context when we know the search is complete, hence this is expected and
				// should not be logged as error in this case.
				if !errors.Is(err.Err, context.Canceled) {
					s.logger.ErrorContext(ctx, "errors while fetching records",
						slog.String("topic_name", err.Topic),
						slog.Int("partition", int(err.Partition)),
						slog.Any("error", err.Err))
				}
			}
			iter := fetches.RecordIter()

			// Iterate on all messages from this poll
			for !iter.Done() {
				record := iter.Next()

				// Skip messages from partitions that are already finished
				if finishedPartitions[record.Partition] {
					continue
				}

				// Avoid a deadlock in case the jobs channel is full
				select {
				case <-ctx.Done():
					return
				case jobs <- record:
				}

				partitionReq := consumeReq.Partitions[record.Partition]

				// Stop reading from this partition when we've reached the EndOffset.
				// The record was already sent to the jobs channel above, so >= is correct here.
				if record.Offset >= partitionReq.EndOffset {
					finishedPartitions[record.Partition] = true
					remainingPartitionRequests--

					if remainingPartitionRequests == 0 {
						return
					}
				}
			}
		}
	}
}

func compressionTypeDisplayname(compressionType uint8) string {
	switch compressionType {
	case 0:
		return "uncompressed"
	case 1:
		return "gzip"
	case 2:
		return "snappy"
	case 3:
		return "lz4"
	case 4:
		return "zstd"
	default:
		return "unknown"
	}
}
