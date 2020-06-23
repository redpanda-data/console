package api

import (
	"context"
	"fmt"
	"github.com/cloudhut/common/rest"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	"net/http"
	"sync"
	"time"
)

type WebsocketClient struct {
	Ctx        context.Context
	Cancel     context.CancelFunc
	Logger     *zap.Logger
	Connection *websocket.Conn
	Mutex      *sync.RWMutex
}

func (wc *WebsocketClient) Upgrade(w http.ResponseWriter, r *http.Request) *rest.Error {
	upgrader := websocket.Upgrader{
		EnableCompression: true,
		// TODO(security): Implement origin check once something can be modified or deleted via websockets, not necessary for fetching messages only
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	wc.Logger.Debug("starting websocket connection upgrade")
	wsConnection, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		restErr := &rest.Error{
			Err:      fmt.Errorf("failed to upgrade websocket in messages endpoint %w", err),
			Status:   http.StatusBadRequest,
			Message:  "Failed upgrade websocket",
			IsSilent: false,
		}
		return restErr
	}
	wc.Logger.Debug("websocket upgrade complete")

	wsConnection.SetCloseHandler(wc.OnClose)
	wc.Logger.Debug("websocket connection upgrade complete")

	maxMessageSize := int64(16 * 1024) // 16kb
	wsConnection.SetReadLimit(maxMessageSize)
	wc.Connection = wsConnection

	return nil
}

func (wc *WebsocketClient) ReadJSON(v interface{}) error {
	wc.Mutex.RLock()
	defer wc.Mutex.RUnlock()

	return wc.Connection.ReadJSON(v)
}

func (wc *WebsocketClient) WriteJSON(v interface{}) error {
	wc.Mutex.Lock()
	defer wc.Mutex.Unlock()

	return wc.Connection.WriteJSON(v)
}

func (wc *WebsocketClient) SendClose() {
	// Close connection gracefully!
	err := wc.Connection.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	if err != nil && err != websocket.ErrCloseSent {
		wc.Logger.Debug("failed to send 'CloseNormalClosure' to ws connection", zap.Error(err))
	} else {
		// the example in github.com/gorilla/websocket also does this
		time.Sleep(2 * time.Second)
	}
}

func (wc *WebsocketClient) OnClose(code int, text string) error {
	wc.Logger.Debug("connection has been closed by client", zap.Int("code", code), zap.String("text", text))
	wc.Cancel()
	return nil
}
