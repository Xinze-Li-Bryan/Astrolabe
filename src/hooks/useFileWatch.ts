/**
 * useFileWatch Hook
 *
 * Monitor project file changes via WebSocket
 * - .ilean file changes: trigger onRefresh (reload project)
 * - meta.json changes: trigger onMetaRefresh (refresh meta data only)
 */

import { useEffect, useRef, useState } from "react";

const WS_BASE = "ws://127.0.0.1:8765";
const RECONNECT_DELAY = 3000; // Reconnect after 3 seconds
const MAX_RECONNECT_ATTEMPTS = 5; // Maximum reconnect attempts

export type WatchStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseFileWatchOptions {
  onRefresh?: () => void;
  onMetaRefresh?: () => void;
}

interface UseFileWatchResult {
  status: WatchStatus;
  lastChangedFiles: string[];
}

export function useFileWatch(
  projectPath: string | null,
  options: UseFileWatchOptions | (() => void) // Support legacy single callback or new object
): UseFileWatchResult {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  const [status, setStatus] = useState<WatchStatus>("disconnected");
  const [lastChangedFiles, setLastChangedFiles] = useState<string[]>([]);

  // Legacy API compatibility: if options is a function, convert to object
  const normalizedOptions = typeof options === "function" ? { onRefresh: options } : options;

  // Save latest callbacks
  const onRefreshRef = useRef(normalizedOptions.onRefresh);
  const onMetaRefreshRef = useRef(normalizedOptions.onMetaRefresh);
  onRefreshRef.current = normalizedOptions.onRefresh;
  onMetaRefreshRef.current = normalizedOptions.onMetaRefresh;

  // Connect WebSocket
  useEffect(() => {
    if (!projectPath) {
      setStatus("disconnected");
      return;
    }

    // Prevent duplicate connections
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const connect = () => {
      // Prevent concurrent connections
      if (isConnectingRef.current) return;
      isConnectingRef.current = true;

      // Clean up old connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      setStatus("connecting");

      const encodedPath = encodeURIComponent(projectPath);
      const wsUrl = `${WS_BASE}/ws/watch?path=${encodedPath}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[FileWatch] Connected");
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0; // Reset reconnect counter
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "connected") {
            setStatus("connected");
            console.log("[FileWatch] Watching:", data.path);
          } else if (data.type === "refresh") {
            // .ilean file changes
            console.log("[FileWatch] Files changed (ilean):", data.files);
            setLastChangedFiles(data.files);
            onRefreshRef.current?.();
          } else if (data.type === "meta_refresh") {
            // meta.json changes
            console.log("[FileWatch] Meta changed:", data.files);
            setLastChangedFiles(data.files);
            onMetaRefreshRef.current?.();
          } else if (data.type === "error") {
            console.error("[FileWatch] Server error:", data.message);
            setStatus("error");
          }
        } catch (e) {
          console.error("[FileWatch] Parse error:", e);
        }
      };

      ws.onclose = () => {
        console.log("[FileWatch] Disconnected");
        setStatus("disconnected");
        isConnectingRef.current = false;
        wsRef.current = null;

        // Auto-reconnect (with backoff strategy)
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAY * Math.pow(1.5, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          console.log(`[FileWatch] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          console.warn("[FileWatch] Max reconnect attempts reached");
          setStatus("error");
        }
      };

      ws.onerror = (error) => {
        console.error("[FileWatch] Error:", error);
        setStatus("error");
        isConnectingRef.current = false;
      };

      wsRef.current = ws;
    };

    connect();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      isConnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
    };
  }, [projectPath]); // Only depends on projectPath

  return { status, lastChangedFiles };
}
