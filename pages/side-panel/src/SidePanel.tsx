/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// import { RxDiscordLogo } from 'react-icons/rx';
import { FiSettings } from 'react-icons/fi';
import { PiPlusBold } from 'react-icons/pi';
import { GrHistory } from 'react-icons/gr';
import type { ClarificationAnswerValue } from '@extension/shared';
import { type Message, Actors, chatHistoryStore, agentModelStore, generalSettingsStore } from '@extension/storage';
import favoritesStorage, { type FavoritePrompt } from '@extension/storage/lib/prompt/favorites';
import { t } from '@extension/i18n';
import {
  LEGACY_SESSION_CACHE_KEY,
  clearClarificationCacheFromStorage,
  loadClarificationCache,
  mergeClarificationAnswers,
  persistClarificationCacheToStorage,
  type ClarificationCache,
} from '@extension/shared/lib/utils/clarification-cache';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ChatHistoryList from './components/ChatHistoryList';
import BookmarkList from './components/BookmarkList';
import ClarificationForm from './components/ClarificationForm';
import { EventType, type AgentEvent, ExecutionState } from './types/event';
import type { ClarificationQuestion, RequirementClarificationPayload } from './types/requirement';
import './SidePanel.css';

const quickPrompts = [
  {
    id: 1,
    title: 'Tìm sản phẩm trên Shopee',
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Shopee.vn với tiêu chí: [NHẬP YÊU CẦU].',
  },
  {
    id: 2,
    title: 'Tìm sản phẩm trên Lazada',
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Lazada.vn với tiêu chí: [NHẬP YÊU CẦU].',
  },
  {
    id: 3,
    title: 'Tìm sản phẩm trên Tiki',
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Tiki.vn với tiêu chí: [NHẬP YÊU CẦU].',
  },
];

const platformPrompts = [
  {
    id: 1,
    title: 'Tìm sản phẩm trên Shopee',
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Shopee.vn với tiêu chí: [NHẬP YÊU CẦU].',
  },
  {
    id: 2,
    title: 'Tìm sản phẩm trên Lazada',
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Lazada.vn với tiêu chí: [NHẬP YÊU CẦU].',
  },
  {
    id: 3,
    title: 'Tìm sản phẩm trên Tiki',
    content: 'Hãy tìm kiếm sản phẩm [NHẬP SẢN PHẨM] trên trang Tiki.vn với tiêu chí: [NHẬP YÊU CẦU].',
  },
];

// Declare chrome API types
declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

const resolveClarificationCacheKey = (sessionId?: string | null) => sessionId ?? LEGACY_SESSION_CACHE_KEY;

const isBrandSplitQuestion = (question: ClarificationQuestion) => question.uiVariant?.type === 'brand_split';

const ensureBrandAnswerValue = (value?: ClarificationAnswerValue) => {
  if (!value) {
    return { pref: '', avoid: '' };
  }
  if (typeof value === 'string') {
    return { pref: value, avoid: '' };
  }
  return {
    pref: value.pref ?? '',
    avoid: value.avoid ?? '',
  };
};

const normalizeAnswerForQuestion = (
  question: ClarificationQuestion,
  value?: ClarificationAnswerValue,
): ClarificationAnswerValue => {
  if (isBrandSplitQuestion(question)) {
    return ensureBrandAnswerValue(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

const hasQuestionAnswer = (question: ClarificationQuestion, value?: ClarificationAnswerValue): boolean => {
  if (!value) {
    return false;
  }
  if (isBrandSplitQuestion(question)) {
    const brand = ensureBrandAnswerValue(value);
    return Boolean(brand.pref.trim() || brand.avoid.trim());
  }
  return typeof value === 'string' ? Boolean(value.trim()) : false;
};

const serializeAnswerValue = (value: ClarificationAnswerValue): string => {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify({ pref: value.pref, avoid: value.avoid });
};

const serializeAnswerMap = (answers: Record<string, ClarificationAnswerValue>): Record<string, string> =>
  Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, serializeAnswerValue(value)]));

const buildClarificationSignature = (
  payload: RequirementClarificationPayload,
  answers: Record<string, ClarificationAnswerValue>,
) => {
  const fragments = payload.questions.map(question => {
    const value = answers[question.id];
    if (!value) {
      return `${question.id}:`;
    }
    if (isBrandSplitQuestion(question)) {
      const brand = ensureBrandAnswerValue(value);
      return `${question.id}:${brand.pref.trim()}|${brand.avoid.trim()}`;
    }
    return `${question.id}:${typeof value === 'string' ? value.trim() : ''}`;
  });
  return `${payload.sessionId}:${fragments.join('|')}`;
};

const SidePanel = () => {
  const progressMessage = 'Showing progress...';
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [showStopButton, setShowStopButton] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<Array<{ id: string; title: string; createdAt: number }>>([]);
  const [isFollowUpMode, setIsFollowUpMode] = useState(false);
  const [isHistoricalSession, setIsHistoricalSession] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  const [hasConfiguredModels, setHasConfiguredModels] = useState<boolean | null>(null); // null = loading, false = no models, true = has models
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [pendingClarification, setPendingClarification] = useState<RequirementClarificationPayload | null>(null);
  const [clarificationSubmitting, setClarificationSubmitting] = useState(false);
  const [clarificationCacheVersion, setClarificationCacheVersion] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isReplayingRef = useRef<boolean>(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const reconnectPromiseRef = useRef<Promise<chrome.runtime.Port | null> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setInputTextRef = useRef<((text: string) => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const clarificationCacheRef = useRef<ClarificationCache>(loadClarificationCache());
  const autoSubmitClarificationAnswersRef = useRef<
    | ((request: RequirementClarificationPayload, answers: Record<string, ClarificationAnswerValue>) => Promise<void>)
    | null
  >(null);
  const lastClarificationSignatureRef = useRef<string | null>(null);
  // Keep cache helpers scoped to the component so they honor the Side Panel state model (see architecture doc).
  const persistClarificationCache = useCallback(() => {
    persistClarificationCacheToStorage(clarificationCacheRef.current);
  }, []);

  const updateClarificationCache = useCallback(
    (sessionId: string, answers: Record<string, ClarificationAnswerValue>) => {
      if (!sessionId) {
        return;
      }
      const { cache, changed } = mergeClarificationAnswers(
        clarificationCacheRef.current,
        resolveClarificationCacheKey(sessionId),
        answers,
      );
      if (changed) {
        clarificationCacheRef.current = cache;
        persistClarificationCache();
        setClarificationCacheVersion(v => v + 1);
        lastClarificationSignatureRef.current = null;
      }
    },
    [persistClarificationCache],
  );

  const clearClarificationCache = useCallback(
    (sessionId?: string | null) => {
      if (sessionId) {
        const key = resolveClarificationCacheKey(sessionId);
        if (clarificationCacheRef.current[key]) {
          const next = { ...clarificationCacheRef.current };
          delete next[key];
          clarificationCacheRef.current = next;
          persistClarificationCache();
          setClarificationCacheVersion(v => v + 1);
          lastClarificationSignatureRef.current = null;
        }
        return;
      }
      clarificationCacheRef.current = {};
      clearClarificationCacheFromStorage();
      setClarificationCacheVersion(v => v + 1);
      lastClarificationSignatureRef.current = null;
    },
    [persistClarificationCache],
  );

  // Check for dark mode preference
  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeMediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    darkModeMediaQuery.addEventListener('change', handleChange);
    return () => darkModeMediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Check if models are configured
  const checkModelConfiguration = useCallback(async () => {
    try {
      const configuredAgents = await agentModelStore.getConfiguredAgents();

      // Check if at least one agent (preferably Navigator) is configured
      const hasAtLeastOneModel = configuredAgents.length > 0;
      setHasConfiguredModels(hasAtLeastOneModel);
    } catch (error) {
      console.error('Error checking model configuration:', error);
      setHasConfiguredModels(false);
    }
  }, []);

  // Load general settings to check if replay is enabled
  const loadGeneralSettings = useCallback(async () => {
    try {
      const settings = await generalSettingsStore.getSettings();
      setReplayEnabled(settings.replayHistoricalTasks);
    } catch (error) {
      console.error('Error loading general settings:', error);
      setReplayEnabled(false);
    }
  }, []);

  // Check model configuration on mount
  useEffect(() => {
    checkModelConfiguration();
    loadGeneralSettings();
  }, [checkModelConfiguration, loadGeneralSettings]);

  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    isReplayingRef.current = isReplaying;
  }, [isReplaying]);

  const appendMessage = useCallback((newMessage: Message, sessionId?: string | null) => {
    // Don't save progress messages
    const isProgressMessage = newMessage.content === progressMessage;

    setMessages(prev => {
      const filteredMessages = prev.filter((msg, idx) => !(msg.content === progressMessage && idx === prev.length - 1));
      return [...filteredMessages, newMessage];
    });

    // Use provided sessionId if available, otherwise fall back to sessionIdRef.current
    const effectiveSessionId = sessionId !== undefined ? sessionId : sessionIdRef.current;

    console.log('sessionId', effectiveSessionId);

    // Save message to storage if we have a session and it's not a progress message
    if (effectiveSessionId && !isProgressMessage) {
      chatHistoryStore
        .addMessage(effectiveSessionId, newMessage)
        .catch(err => console.error('Failed to save message to history:', err));
    }
  }, []);

  const handleTaskState = useCallback(
    (event: AgentEvent) => {
      const { actor, state, timestamp, data } = event;
      const content = data?.details;
      let skip = true;
      let displayProgress = false;

      switch (actor) {
        case Actors.SYSTEM:
          switch (state) {
            case ExecutionState.TASK_START:
              // Reset historical session flag when a new task starts
              setIsHistoricalSession(false);
              break;
            case ExecutionState.TASK_OK:
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              break;
            case ExecutionState.TASK_FAIL:
              setIsFollowUpMode(true);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              skip = false;
              break;
            case ExecutionState.TASK_CANCEL:
              setIsFollowUpMode(false);
              setInputEnabled(true);
              setShowStopButton(false);
              setIsReplaying(false);
              skip = false;
              break;
            case ExecutionState.TASK_PAUSE:
              break;
            case ExecutionState.TASK_RESUME:
              break;
            default:
              console.error('Invalid task state', state);
              return;
          }
          break;
        case Actors.USER:
          break;
        case Actors.PLANNER:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              skip = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            case ExecutionState.STEP_CANCEL:
              break;
            default:
              console.error('Invalid step state', state);
              return;
          }
          break;
        case Actors.NAVIGATOR:
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              displayProgress = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              displayProgress = false;
              break;
            case ExecutionState.STEP_CANCEL:
              displayProgress = false;
              break;
            case ExecutionState.ACT_START:
              if (content !== 'cache_content') {
                // skip to display caching content
                skip = false;
              }
              break;
            case ExecutionState.ACT_OK:
              skip = !isReplayingRef.current;
              break;
            case ExecutionState.ACT_FAIL:
              skip = false;
              break;
            default:
              console.error('Invalid action', state);
              return;
          }
          break;
        case Actors.VALIDATOR:
          // Handle legacy validator events from historical messages
          switch (state) {
            case ExecutionState.STEP_START:
              displayProgress = true;
              break;
            case ExecutionState.STEP_OK:
              skip = false;
              break;
            case ExecutionState.STEP_FAIL:
              skip = false;
              break;
            default:
              console.error('Invalid validation', state);
              return;
          }
          break;
        default:
          console.error('Unknown actor', actor);
          return;
      }

      if (!skip) {
        appendMessage({
          actor,
          content: content || '',
          timestamp: timestamp,
        });
      }

      if (displayProgress) {
        appendMessage({
          actor,
          content: progressMessage,
          timestamp: timestamp,
        });
      }
    },
    [appendMessage],
  );

  const reportConnectionIssue = useCallback((reason?: string | null) => {
    setConnectionLost(true);
    setConnectionIssue(reason ?? null);
  }, []);

  const clearConnectionIssue = useCallback(() => {
    setConnectionLost(false);
    setConnectionIssue(null);
  }, []);

  const handlePortDisconnected = useCallback(
    (reason?: string, silent?: boolean) => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      portRef.current = null;
      reconnectPromiseRef.current = null;
      setInputEnabled(true);
      setShowStopButton(false);
      if (silent) {
        clearConnectionIssue();
      } else {
        reportConnectionIssue(reason);
      }
    },
    [clearConnectionIssue, reportConnectionIssue],
  );

  // Stop heartbeat and close connection
  const stopConnection = useCallback(
    (options?: { silent?: boolean; reason?: string }) => {
      if (portRef.current) {
        portRef.current.disconnect();
      }
      handlePortDisconnected(options?.reason, options?.silent);
    },
    [handlePortDisconnected],
  );

  // Setup connection management
  const setupConnection = useCallback(async () => {
    if (portRef.current?.name === 'side-panel-connection') {
      clearConnectionIssue();
      return portRef.current;
    }

    if (reconnectPromiseRef.current) {
      return reconnectPromiseRef.current;
    }

    const establish = (async () => {
      try {
        portRef.current = chrome.runtime.connect({ name: 'side-panel-connection' });
        clearConnectionIssue();

        // biome-ignore lint/suspicious/noExplicitAny: background messages are typed dynamically
        portRef.current.onMessage.addListener((message: any) => {
          if (message && message.type === EventType.EXECUTION) {
            handleTaskState(message);
          } else if (message && message.type === 'error') {
            appendMessage({
              actor: Actors.SYSTEM,
              content: message.error || t('errors_unknown'),
              timestamp: Date.now(),
            });
            setInputEnabled(true);
            setShowStopButton(false);
          } else if (message && message.type === 'speech_to_text_result') {
            if (message.text && setInputTextRef.current) {
              setInputTextRef.current(message.text);
            }
            setIsProcessingSpeech(false);
          } else if (message && message.type === 'speech_to_text_error') {
            appendMessage({
              actor: Actors.SYSTEM,
              content: message.error || t('chat_stt_recognitionFailed'),
              timestamp: Date.now(),
            });
            setIsProcessingSpeech(false);
          } else if (message && message.type === 'requirement_clarification' && message.payload) {
            const payload = message.payload as RequirementClarificationPayload;
            const sessionCacheKey = resolveClarificationCacheKey(payload.sessionId);
            const sessionCache = clarificationCacheRef.current[sessionCacheKey] ?? {};
            const cachedAnswers: Record<string, ClarificationAnswerValue> = {};
            let hasMissing = false;
            payload.questions.forEach(question => {
              const normalized = normalizeAnswerForQuestion(question, sessionCache[question.id]);
              if (hasQuestionAnswer(question, normalized)) {
                cachedAnswers[question.id] = normalized;
              } else {
                hasMissing = true;
              }
            });

            if (!hasMissing) {
              const signature = buildClarificationSignature(payload, cachedAnswers);
              if (lastClarificationSignatureRef.current === signature) {
                setPendingClarification(payload);
                setClarificationSubmitting(false);
                setInputEnabled(false);
                setShowStopButton(false);
                return;
              }
              lastClarificationSignatureRef.current = signature;
              const autoSubmitHandler = autoSubmitClarificationAnswersRef.current;
              if (autoSubmitHandler) {
                void autoSubmitHandler(payload, cachedAnswers);
              } else {
                console.warn('Auto-submit handler unavailable; skipping cached clarification submission.');
              }
              return;
            }

            lastClarificationSignatureRef.current = null;
            setPendingClarification(payload);
            setClarificationSubmitting(false);
            setInputEnabled(false);
            setShowStopButton(false);
          } else if (message && message.type === 'heartbeat_ack') {
            console.log('Heartbeat acknowledged');
          } else if (message && message.type === 'requirement_session_missing') {
            appendMessage({
              actor: Actors.SYSTEM,
              content: message.message ?? t('chat_clarification_sessionMissing'),
              timestamp: Date.now(),
            });
            setPendingClarification(null);
            setInputEnabled(true);
            setShowStopButton(false);
          }
        });

        portRef.current.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError;
          console.log('Connection disconnected', error ? `Error: ${error.message}` : '');
          handlePortDisconnected(error?.message, false);
        });

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }

        heartbeatIntervalRef.current = window.setInterval(() => {
          if (portRef.current?.name === 'side-panel-connection') {
            try {
              portRef.current.postMessage({ type: 'heartbeat' });
            } catch (error) {
              console.error('Heartbeat failed:', error);
              handlePortDisconnected(error instanceof Error ? error.message : 'heartbeat_failed', false);
            }
          } else {
            handlePortDisconnected('heartbeat_invalid_port', false);
          }
        }, 25000);

        return portRef.current;
      } catch (error) {
        console.error('Failed to establish connection:', error);
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('errors_conn_serviceWorker'),
          timestamp: Date.now(),
        });
        portRef.current = null;
        reportConnectionIssue(error instanceof Error ? error.message : null);
        throw error;
      } finally {
        reconnectPromiseRef.current = null;
      }
    })();

    reconnectPromiseRef.current = establish;
    return establish;
  }, [appendMessage, clearConnectionIssue, handlePortDisconnected, handleTaskState, reportConnectionIssue]);

  // Re-check model configuration when the side panel becomes visible again and ensure background connection
  useEffect(() => {
    void setupConnection();

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Panel became visible, re-check configuration and settings
        checkModelConfiguration();
        loadGeneralSettings();
        void setupConnection();
      }
    };

    const handleFocus = () => {
      // Panel gained focus, re-check configuration and settings
      checkModelConfiguration();
      loadGeneralSettings();
      void setupConnection();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkModelConfiguration, loadGeneralSettings, setupConnection]);

  const ensureConnection = useCallback(async () => {
    const port = await setupConnection();
    if (port?.name === 'side-panel-connection') {
      return port;
    }
    const error = new Error('No valid connection available');
    reportConnectionIssue(error.message);
    throw error;
  }, [reportConnectionIssue, setupConnection]);

  // Add safety check for message sending
  const sendMessage = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    async (message: any) => {
      const port = await ensureConnection();
      try {
        port.postMessage(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        handlePortDisconnected(error instanceof Error ? error.message : 'send_failed', false);
        throw error;
      }
    },
    [ensureConnection, handlePortDisconnected],
  );

  // Handle replay command
  const handleReplay = async (historySessionId: string): Promise<void> => {
    try {
      // Check if replay is enabled in settings
      if (!replayEnabled) {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_replay_disabled'),
          timestamp: Date.now(),
        });
        return;
      }

      // Check if history exists using loadAgentStepHistory
      const historyData = await chatHistoryStore.loadAgentStepHistory(historySessionId);
      if (!historyData) {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_replay_noHistory', historySessionId.substring(0, 20)),
          timestamp: Date.now(),
        });
        return;
      }

      // Get current tab ID
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        throw new Error('No active tab found');
      }

      // Clear messages if we're in a historical session
      if (isHistoricalSession) {
        setMessages([]);
      }

      // Create a new chat session for this replay task
      const newSession = await chatHistoryStore.createSession(`Replay of ${historySessionId.substring(0, 20)}...`);
      console.log('newSession for replay', newSession);

      // Store the new session ID in both state and ref
      const newTaskId = newSession.id;
      setCurrentSessionId(newTaskId);
      sessionIdRef.current = newTaskId;

      // Send replay command to background
      setInputEnabled(false);
      setShowStopButton(true);

      // Reset follow-up mode and historical session flags
      setIsFollowUpMode(false);
      setIsHistoricalSession(false);

      const userMessage = {
        actor: Actors.USER,
        content: `/replay ${historySessionId}`,
        timestamp: Date.now(),
      };

      // Add the user message to the new session
      appendMessage(userMessage, sessionIdRef.current);

      const port = await ensureConnection();

      // Send replay command to background with the task from history
      port.postMessage({
        type: 'replay',
        taskId: newTaskId,
        tabId: tabId,
        historySessionId: historySessionId,
        task: historyData.task, // Add the task from history
      });

      appendMessage({
        actor: Actors.SYSTEM,
        content: t('chat_replay_starting', historyData.task),
        timestamp: Date.now(),
      });
      setIsReplaying(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('chat_replay_failed', errorMessage),
        timestamp: Date.now(),
      });
    }
  };

  // Handle chat commands that start with /
  const handleCommand = async (command: string): Promise<boolean> => {
    try {
      if (command.startsWith('/replay ')) {
        const parts = command.split(' ').filter(part => part.trim() !== '');
        if (parts.length !== 2) {
          appendMessage({
            actor: Actors.SYSTEM,
            content: t('chat_replay_invalidArgs'),
            timestamp: Date.now(),
          });
          return true;
        }

        const historySessionId = parts[1];
        await handleReplay(historySessionId);
        return true;
      }

      const port = await ensureConnection();

      // Handle different commands
      if (command === '/state') {
        port.postMessage({
          type: 'state',
        });
        return true;
      }

      if (command === '/nohighlight') {
        port.postMessage({
          type: 'nohighlight',
        });
        return true;
      }

      // Unsupported command
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('errors_cmd_unknown', command),
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Command error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      return true;
    }
  };

  const handleSendMessage = async (text: string, displayText?: string) => {
    console.log('handleSendMessage', text);

    // Trim the input text first
    const trimmedText = text.trim();

    if (!trimmedText) return;

    // Check if the input is a command (starts with /)
    if (trimmedText.startsWith('/')) {
      // Process command and return if it was handled
      const wasHandled = await handleCommand(trimmedText);
      if (wasHandled) return;
    }

    // Block sending messages in historical sessions
    if (isHistoricalSession) {
      console.log('Cannot send messages in historical sessions');
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) {
        throw new Error('No active tab found');
      }

      setInputEnabled(false);
      setShowStopButton(true);

      // Create a new chat session for this task if not in follow-up mode
      if (!isFollowUpMode) {
        // Use display text for session title if available, otherwise use full text
        const titleText = displayText || text;
        const newSession = await chatHistoryStore.createSession(
          titleText.substring(0, 50) + (titleText.length > 50 ? '...' : ''),
        );
        console.log('newSession', newSession);

        // Store the session ID in both state and ref
        const sessionId = newSession.id;
        setCurrentSessionId(sessionId);
        sessionIdRef.current = sessionId;
      }

      const userMessage = {
        actor: Actors.USER,
        content: displayText || text, // Use display text for chat UI, full text for background service
        timestamp: Date.now(),
      };

      // Pass the sessionId directly to appendMessage
      appendMessage(userMessage, sessionIdRef.current);

      // Send message using the utility function
      if (isFollowUpMode) {
        // Send as follow-up task
        await sendMessage({
          type: 'follow_up_task',
          task: text,
          taskId: sessionIdRef.current,
          tabId,
        });
        console.log('follow_up_task sent', text, tabId, sessionIdRef.current);
      } else {
        // Send as new task
        await sendMessage({
          type: 'new_task',
          task: text,
          taskId: sessionIdRef.current,
          tabId,
        });
        console.log('new_task sent', text, tabId, sessionIdRef.current);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Task error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setInputEnabled(true);
      setShowStopButton(false);
      stopConnection({ reason: errorMessage });
    }
  };

  const handleStopTask = async () => {
    try {
      const port = await ensureConnection();
      port.postMessage({
        type: 'cancel_task',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('cancel_task error', errorMessage);
      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
    }
    setInputEnabled(true);
    setShowStopButton(false);
  };

  const handleNewChat = () => {
    // Clear messages and start a new chat
    if (sessionIdRef.current) {
      clearClarificationCache(sessionIdRef.current);
    }
    lastClarificationSignatureRef.current = null;
    setMessages([]);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
    setInputEnabled(true);
    setShowStopButton(false);
    setIsFollowUpMode(false);
    setIsHistoricalSession(false);
    setPendingClarification(null);
    setClarificationSubmitting(false);

    // Disconnect any existing connection
    stopConnection({ silent: true });
  };

  const loadChatSessions = useCallback(async () => {
    try {
      const sessions = await chatHistoryStore.getSessionsMetadata();
      setChatSessions(sessions.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    }
  }, []);

  const handleLoadHistory = async () => {
    await loadChatSessions();
    setShowHistory(true);
  };

  const handleBackToChat = (reset = false) => {
    setShowHistory(false);
    if (reset) {
      setCurrentSessionId(null);
      setMessages([]);
      setIsFollowUpMode(false);
      setIsHistoricalSession(false);
    }
  };

  const handleSessionSelect = async (sessionId: string) => {
    try {
      const fullSession = await chatHistoryStore.getSession(sessionId);
      if (fullSession && fullSession.messages.length > 0) {
        setCurrentSessionId(fullSession.id);
        setMessages(fullSession.messages);
        setIsFollowUpMode(false);
        setIsHistoricalSession(true); // Mark this as a historical session
        console.log('history session selected', sessionId);
      }
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const handleSessionDelete = async (sessionId: string) => {
    try {
      await chatHistoryStore.deleteSession(sessionId);
      await loadChatSessions();
      if (sessionId === currentSessionId) {
        setMessages([]);
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleSessionBookmark = async (sessionId: string) => {
    try {
      const fullSession = await chatHistoryStore.getSession(sessionId);

      if (fullSession && fullSession.messages.length > 0) {
        // Get the session title
        const sessionTitle = fullSession.title;
        // Get the first 8 words of the title
        const title = sessionTitle.split(' ').slice(0, 8).join(' ');

        // Get the first message content (the task)
        const taskContent = fullSession.messages[0]?.content || '';

        // Add to favorites storage
        await favoritesStorage.addPrompt(title, taskContent);

        // Update favorites in the UI
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);

        // Return to chat view after pinning
        handleBackToChat(true);
      }
    } catch (error) {
      console.error('Failed to pin session to favorites:', error);
    }
  };

  const handleBookmarkSelect = (content: string) => {
    if (setInputTextRef.current) {
      setInputTextRef.current(content);
    }
  };

  const handleBookmarkUpdateTitle = async (id: number, title: string) => {
    try {
      await favoritesStorage.updatePromptTitle(id, title);

      // Update favorites in the UI
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to update favorite prompt title:', error);
    }
  };

  const handleBookmarkDelete = async (id: number) => {
    try {
      await favoritesStorage.removePrompt(id);

      // Update favorites in the UI
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to delete favorite prompt:', error);
    }
  };

  const handleBookmarkReorder = async (draggedId: number, targetId: number) => {
    try {
      // Directly pass IDs to storage function - it now handles the reordering logic
      await favoritesStorage.reorderPrompts(draggedId, targetId);

      // Fetch the updated list from storage to get the new IDs and reflect the authoritative order
      const updatedPromptsFromStorage = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(updatedPromptsFromStorage);
    } catch (error) {
      console.error('Failed to reorder favorite prompts:', error);
    }
  };

  const handleClarificationSubmit = useCallback(
    async (answers: Record<string, ClarificationAnswerValue>) => {
      if (!pendingClarification) {
        return;
      }
      try {
        setClarificationSubmitting(true);
        await sendMessage({
          type: 'requirement_answers',
          sessionId: pendingClarification.sessionId,
          answers: serializeAnswerMap(answers),
        });
        setPendingClarification(null);
        setShowStopButton(true);
        updateClarificationCache(pendingClarification.sessionId, answers);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        appendMessage({
          actor: Actors.SYSTEM,
          content: errorMessage,
          timestamp: Date.now(),
        });
      } finally {
        setClarificationSubmitting(false);
      }
    },
    [pendingClarification, sendMessage, appendMessage, updateClarificationCache],
  );

  const autoSubmitClarificationAnswers = useCallback(
    async (request: RequirementClarificationPayload, answers: Record<string, ClarificationAnswerValue>) => {
      try {
        setInputEnabled(false);
        setShowStopButton(false);
        setClarificationSubmitting(true);
        await sendMessage({
          type: 'requirement_answers',
          sessionId: request.sessionId,
          answers: serializeAnswerMap(answers),
        });
        setPendingClarification(null);
        setShowStopButton(true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        appendMessage({
          actor: Actors.SYSTEM,
          content: errorMessage,
          timestamp: Date.now(),
        });
        setPendingClarification(request);
        setInputEnabled(true);
      } finally {
        setClarificationSubmitting(false);
      }
    },
    [appendMessage, sendMessage],
  );

  useEffect(() => {
    autoSubmitClarificationAnswersRef.current = autoSubmitClarificationAnswers;
  }, [autoSubmitClarificationAnswers]);

  // Load favorite prompts from storage
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);
      } catch (error) {
        console.error('Failed to load favorite prompts:', error);
      }
    };

    loadFavorites();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop recording if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Clear recording timer
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      stopConnection({ silent: true });
    };
  }, [stopConnection]);

  // Scroll to bottom when new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleMicClick = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Clear the timer
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      return;
    }

    try {
      // First check if permission is already granted
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });

      if (permissionStatus.state === 'denied') {
        appendMessage({
          actor: Actors.SYSTEM,
          content: t('chat_stt_microphone_permissionDenied'),
          timestamp: Date.now(),
        });
        return;
      }

      // If permission is not granted, open permission page
      if (permissionStatus.state !== 'granted') {
        const permissionUrl = chrome.runtime.getURL('permission/index.html');

        // Open permission page in a new window
        chrome.windows.create(
          {
            url: permissionUrl,
            type: 'popup',
            width: 500,
            height: 600,
          },
          createdWindow => {
            if (createdWindow?.id) {
              // Listen for window close to check permission status
              chrome.windows.onRemoved.addListener(function onWindowClose(windowId) {
                if (windowId === createdWindow.id) {
                  chrome.windows.onRemoved.removeListener(onWindowClose);
                  // Check permission status after window closes
                  setTimeout(async () => {
                    try {
                      const newPermissionStatus = await navigator.permissions.query({
                        name: 'microphone' as PermissionName,
                      });
                      // Only retry if permission was granted
                      if (newPermissionStatus.state === 'granted') {
                        handleMicClick();
                      }
                      // If denied or prompt, do nothing - let user manually try again
                    } catch (error) {
                      console.error('Failed to check permission status:', error);
                    }
                  }, 500);
                }
              });
            }
          },
        );
        return;
      }

      // Permission granted - proceed with recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Clear previous audio chunks
      audioChunksRef.current = [];

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available event
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle stop event
      mediaRecorder.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length > 0) {
          // Create audio blob
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          // Convert blob to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;

            const sendAudio = async () => {
              try {
                const port = await ensureConnection();
                setIsProcessingSpeech(true);
                port.postMessage({
                  type: 'speech_to_text',
                  audio: base64Audio,
                });
              } catch (error) {
                console.error('Failed to send audio for speech-to-text:', error);
                appendMessage({
                  actor: Actors.SYSTEM,
                  content: t('chat_stt_processingFailed'),
                  timestamp: Date.now(),
                });
                setIsRecording(false);
                setIsProcessingSpeech(false);
              }
            };
            void sendAudio();
          };
          reader.readAsDataURL(audioBlob);
        }
      };

      // Set up 2-minute duration limit
      const maxDuration = 2 * 60 * 1000;
      recordingTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setIsProcessingSpeech(true);
        recordingTimerRef.current = null;
      }, maxDuration);

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);

      let errorMessage = t('chat_stt_microphone_accessFailed');
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += t('chat_stt_microphone_grantPermission');
        } else if (error.name === 'NotFoundError') {
          errorMessage += t('chat_stt_microphone_notFound');
        } else {
          errorMessage += error.message;
        }
      }

      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setIsRecording(false);
    }
  };

  const hasCustomFavoritePrompts = favoritePrompts.length > 0;
  const quickPromptList = hasCustomFavoritePrompts ? favoritePrompts : quickPrompts;
  const hasSavedClarificationAnswers = useMemo(() => {
    if (!pendingClarification) {
      return false;
    }
    const key = resolveClarificationCacheKey(pendingClarification.sessionId);
    const bucket = clarificationCacheRef.current[key];
    return bucket ? Object.keys(bucket).length > 0 : false;
  }, [pendingClarification, clarificationCacheVersion]);

  const savedAnswersForPendingClarification = useMemo(() => {
    if (!pendingClarification) return {};
    const key = resolveClarificationCacheKey(pendingClarification.sessionId);
    const bucket = clarificationCacheRef.current[key] ?? {};
    const prefill: Record<string, ClarificationAnswerValue> = {};
    pendingClarification.questions.forEach(question => {
      prefill[question.id] = normalizeAnswerForQuestion(question, bucket[question.id]);
    });
    return prefill;
  }, [pendingClarification, clarificationCacheVersion]);

  return (
    <div>
      <div
        className={`flex h-screen flex-col ${isDarkMode ? 'bg-slate-900' : "bg-[url('/bg.jpg')] bg-cover bg-no-repeat"} overflow-hidden border ${isDarkMode ? 'border-sky-800' : 'border-[rgb(186,230,253)]'} rounded-2xl`}>
        <header className="header relative">
          <div className="header-logo">
            {showHistory ? (
              <button
                type="button"
                onClick={() => handleBackToChat(false)}
                className={`${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
                aria-label={t('nav_back_a11y')}>
                {t('nav_back')}
              </button>
            ) : (
              <img src="/icon-128.png" alt="Extension Logo" className="size-6" />
            )}
          </div>
          <div className="header-icons">
            {!showHistory && (
              <>
                <button
                  type="button"
                  onClick={handleNewChat}
                  onKeyDown={e => e.key === 'Enter' && handleNewChat()}
                  className={`header-icon ${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
                  aria-label={t('nav_newChat_a11y')}
                  tabIndex={0}>
                  <PiPlusBold size={20} />
                </button>
                <button
                  type="button"
                  onClick={handleLoadHistory}
                  onKeyDown={e => e.key === 'Enter' && handleLoadHistory()}
                  className={`header-icon ${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
                  aria-label={t('nav_loadHistory_a11y')}
                  tabIndex={0}>
                  <GrHistory size={20} />
                </button>
              </>
            )}
            {/* <a
              href="https://discord.gg/NN3ABHggMK"
              target="_blank"
              rel="noopener noreferrer"
              className={`header-icon ${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'}`}>
              <RxDiscordLogo size={20} />
            </a> */}
            <button
              type="button"
              onClick={() => chrome.runtime.openOptionsPage()}
              onKeyDown={e => e.key === 'Enter' && chrome.runtime.openOptionsPage()}
              className={`header-icon ${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-400 hover:text-sky-500'} cursor-pointer`}
              aria-label={t('nav_settings_a11y')}
              tabIndex={0}>
              <FiSettings size={20} />
            </button>
          </div>
        </header>
        {connectionLost && (
          <div
            className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-sm ${
              isDarkMode
                ? 'border-amber-900 bg-amber-900/40 text-amber-100'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}>
            <span>{connectionIssue ?? t('chat_connection_lost')}</span>
            <button
              type="button"
              onClick={() => {
                void setupConnection();
              }}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                isDarkMode ? 'bg-amber-700 text-white hover:bg-amber-600' : 'bg-amber-600 text-white hover:bg-amber-500'
              }`}>
              {t('chat_connection_retry')}
            </button>
          </div>
        )}
        {showHistory ? (
          <div className="flex-1 overflow-hidden">
            <ChatHistoryList
              sessions={chatSessions}
              onSessionSelect={handleSessionSelect}
              onSessionDelete={handleSessionDelete}
              onSessionBookmark={handleSessionBookmark}
              visible={true}
              isDarkMode={isDarkMode}
            />
          </div>
        ) : (
          <>
            {/* Show loading state while checking model configuration */}
            {hasConfiguredModels === null && (
              <div
                className={`flex flex-1 items-center justify-center p-8 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>
                <div className="text-center">
                  <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent"></div>
                  <p>{t('status_checkingConfig')}</p>
                </div>
              </div>
            )}

            {/* Show setup message when no models are configured */}
            {hasConfiguredModels === false && (
              <div
                className={`flex flex-1 items-center justify-center p-8 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>
                <div className="max-w-md text-center">
                  <img src="/icon-128.png" alt="Nanobrowser Logo" className="mx-auto mb-4 size-12" />
                  <h3 className={`mb-2 text-lg font-semibold ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}>
                    {t('welcome_title')}
                  </h3>
                  <p className="mb-4">{t('welcome_instruction')}</p>
                  <button
                    onClick={() => chrome.runtime.openOptionsPage()}
                    className={`my-4 rounded-lg px-4 py-2 font-medium transition-colors ${
                      isDarkMode ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-sky-500 text-white hover:bg-sky-600'
                    }`}>
                    {t('welcome_openSettings')}
                  </button>
                  <div className="mt-4 text-sm opacity-75">
                    <a
                      href="https://github.com/nanobrowser/nanobrowser?tab=readme-ov-file#-quick-start"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-700 hover:text-sky-600'}`}>
                      {t('welcome_quickStart')}
                    </a>
                    <span className="mx-2">•</span>
                    <a
                      href="https://discord.gg/NN3ABHggMK"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${isDarkMode ? 'text-sky-400 hover:text-sky-300' : 'text-sky-700 hover:text-sky-600'}`}>
                      {t('welcome_joinCommunity')}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Show normal chat interface when models are configured */}
            {hasConfiguredModels === true && (
              <>
                {pendingClarification && (
                  <div className="max-h-[70vh] overflow-y-auto px-2 pb-3">
                    <ClarificationForm
                      request={pendingClarification}
                      onSubmit={handleClarificationSubmit}
                      isSubmitting={clarificationSubmitting}
                      isDarkMode={isDarkMode}
                      initialAnswers={savedAnswersForPendingClarification}
                      onClearSavedAnswers={
                        hasSavedClarificationAnswers
                          ? () => clearClarificationCache(pendingClarification.sessionId)
                          : undefined
                      }
                      hasSavedAnswers={hasSavedClarificationAnswers}
                    />
                  </div>
                )}
                {messages.length === 0 && (
                  <>
                    <div
                      className={`border-t ${isDarkMode ? 'border-sky-900' : 'border-sky-100'} mb-2 p-2 shadow-sm backdrop-blur-sm`}>
                      <ChatInput
                        onSendMessage={handleSendMessage}
                        onStopTask={handleStopTask}
                        onMicClick={handleMicClick}
                        isRecording={isRecording}
                        isProcessingSpeech={isProcessingSpeech}
                        disabled={!inputEnabled || isHistoricalSession}
                        showStopButton={showStopButton}
                        setContent={setter => {
                          setInputTextRef.current = setter;
                        }}
                        isDarkMode={isDarkMode}
                        historicalSessionId={isHistoricalSession && replayEnabled ? currentSessionId : null}
                        onReplay={handleReplay}
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <BookmarkList
                        title="Gợi ý nhanh"
                        bookmarks={quickPromptList}
                        onBookmarkSelect={handleBookmarkSelect}
                        onBookmarkUpdateTitle={hasCustomFavoritePrompts ? handleBookmarkUpdateTitle : undefined}
                        onBookmarkDelete={hasCustomFavoritePrompts ? handleBookmarkDelete : undefined}
                        onBookmarkReorder={hasCustomFavoritePrompts ? handleBookmarkReorder : undefined}
                        isDarkMode={isDarkMode}
                      />

                      <BookmarkList
                        title="Tìm theo trang web"
                        bookmarks={platformPrompts}
                        onBookmarkSelect={handleBookmarkSelect}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                  </>
                )}
                {messages.length > 0 && (
                  <div
                    className={`scrollbar-gutter-stable flex-1 overflow-x-hidden overflow-y-scroll scroll-smooth p-2 ${isDarkMode ? 'bg-slate-900/80' : ''}`}>
                    <MessageList messages={messages} isDarkMode={isDarkMode} />
                    <div ref={messagesEndRef} />
                  </div>
                )}
                {messages.length > 0 && (
                  <div
                    className={`border-t ${isDarkMode ? 'border-sky-900' : 'border-sky-100'} p-2 shadow-sm backdrop-blur-sm`}>
                    <ChatInput
                      onSendMessage={handleSendMessage}
                      onStopTask={handleStopTask}
                      onMicClick={handleMicClick}
                      isRecording={isRecording}
                      isProcessingSpeech={isProcessingSpeech}
                      disabled={!inputEnabled || isHistoricalSession}
                      showStopButton={showStopButton}
                      setContent={setter => {
                        setInputTextRef.current = setter;
                      }}
                      isDarkMode={isDarkMode}
                      historicalSessionId={isHistoricalSession && replayEnabled ? currentSessionId : null}
                      onReplay={handleReplay}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SidePanel;
