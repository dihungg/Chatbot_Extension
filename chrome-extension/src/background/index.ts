import 'webextension-polyfill';
import {
  agentModelStore,
  AgentNameEnum,
  firewallStore,
  generalSettingsStore,
  llmProviderStore,
  analyticsSettingsStore,
  targetProductProfileRepository,
} from '@extension/storage';
import type { TargetProductProfile } from '@extension/shared';
import { t } from '@extension/i18n';
import BrowserContext from './browser/context';
import { Executor } from './agent/executor';
import { createLogger } from './log';
import { ExecutionState } from './agent/event/types';
import { createChatModel } from './agent/helper';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DEFAULT_AGENT_OPTIONS } from './agent/types';
import { SpeechToTextService } from './services/speechToText';
import { injectBuildDomTreeScripts } from './browser/dom/service';
import { analytics } from './services/analytics';
import {
  RequirementInterpreterService,
  type QuestionAnswerMap,
  type RequirementClarificationRequest,
} from './agent/requirement-interpreter';
import {
  applyPendingRequirementSnapshot,
  type PendingRequirement,
  snapshotPendingRequirementSessions,
} from './pendingSessionsUtils';

const logger = createLogger('background');

const requirementInterpreter = new RequirementInterpreterService({
  repository: targetProductProfileRepository,
});

const browserContext = new BrowserContext({});
let currentExecutor: Executor | null = null;
let currentPort: chrome.runtime.Port | null = null;
const SIDE_PANEL_URL = chrome.runtime.getURL('side-panel/index.html');

const pendingRequirementSessions = new Map<string, PendingRequirement>();
// Map trong TypeScript được lưu trong RAM.
const storageWithSession = chrome.storage as typeof chrome.storage & { session?: chrome.storage.StorageArea };
const pendingSessionsStorageArea: chrome.storage.StorageArea = storageWithSession.session ?? chrome.storage.local;
const PENDING_REQUIREMENT_SESSIONS_KEY = 'pendingRequirementSessions';

const persistPendingRequirementSessions = async () => {
  const serialized = snapshotPendingRequirementSessions(pendingRequirementSessions);
  try {
    await new Promise<void>((resolve, reject) => {
      pendingSessionsStorageArea.set({ [PENDING_REQUIREMENT_SESSIONS_KEY]: serialized }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } catch (error) {
    logger.error('Failed to persist pending requirement sessions', error);
  }
};

const restorePendingRequirementSessions = async () => {
  try {
    const stored = await new Promise<unknown>((resolve, reject) => {
      pendingSessionsStorageArea.get(PENDING_REQUIREMENT_SESSIONS_KEY, items => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(items[PENDING_REQUIREMENT_SESSIONS_KEY]);
      });
    });
    applyPendingRequirementSnapshot(pendingRequirementSessions, stored);
    if (pendingRequirementSessions.size > 0) {
      logger.info('Restored pending requirement sessions', { count: pendingRequirementSessions.size });
    }
  } catch (error) {
    logger.error('Failed to restore pending requirement sessions', error);
  }
};

const pendingRequirementSessionsReady = restorePendingRequirementSessions();

// Setup side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => console.error(error));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId && changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    await injectBuildDomTreeScripts(tabId);
  }
});

// Listen for debugger detached event
// if canceled_by_user, remove the tab from the browser context
chrome.debugger.onDetach.addListener(async (source, reason) => {
  console.log('Debugger detached:', source, reason);
  if (reason === 'canceled_by_user') {
    if (source.tabId) {
      currentExecutor?.cancel();
      await browserContext.cleanup();
    }
  }
});

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener(tabId => {
  browserContext.removeAttachedPage(tabId);
});

logger.info('background loaded');

// Initialize analytics
analytics.init().catch(error => {
  logger.error('Failed to initialize analytics:', error);
});

// Listen for analytics settings changes
analyticsSettingsStore.subscribe(() => {
  analytics.updateSettings().catch(error => {
    logger.error('Failed to update analytics settings:', error);
  });
});

// Listen for simple messages (e.g., from options page)
chrome.runtime.onMessage.addListener((message, sender) => {
  logger.info('runtime.onMessage received', { message, sender });
  // Handle other message types if needed in the future
  // Return false if response is not sent asynchronously
  return false;
});

// Setup connection listener for long-lived connections (e.g., side panel)
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'side-panel-connection') {
    const senderUrl = port.sender?.url;
    const senderId = port.sender?.id;

    logger.info('Incoming side-panel connection', {
      senderId,
      senderUrl,
    });

    // Side panel pages run in the extension process so chrome.runtime doesn't populate sender metadata.
    // Only block the connection if we receive explicit evidence that this isn't our extension/page.
    if ((senderId && senderId !== chrome.runtime.id) || (senderUrl && !senderUrl.startsWith(SIDE_PANEL_URL))) {
      logger.warning('Blocked unauthorized side-panel-connection', senderId, senderUrl);
      port.disconnect();
      return;
    }

    currentPort = port;
    logger.info('Side-panel connection established');

    port.onMessage.addListener(async message => {
      await pendingRequirementSessionsReady;
      logger.debug('Message received from side panel', message);
      try {
        switch (message.type) {
          case 'heartbeat':
            // Acknowledge heartbeat
            logger.debug('Responding to heartbeat');
            port.postMessage({ type: 'heartbeat_ack' });
            break;

          case 'new_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: t('bg_cmd_newTask_noTask') });
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });

            logger.info('new_task', message.tabId, message.task);
            const profileResult = await requirementInterpreter.ensureProfile(message.taskId, message.task);
            if (profileResult.status === 'error') {
              port.postMessage({ type: 'error', error: profileResult.error });
              break;
            }
            if (profileResult.status === 'needs_clarification') {
              pendingRequirementSessions.set(message.taskId, {
                type: 'new_task',
                taskId: message.taskId,
                task: message.task,
                tabId: message.tabId,
              });
              await persistPendingRequirementSessions();
              sendClarification(profileResult.request);
              break;
            }
            await startNewTask(message.taskId, message.task, message.tabId, profileResult.profile);
            break;
          }

          case 'follow_up_task': {
            if (!message.task) return port.postMessage({ type: 'error', error: t('bg_cmd_followUpTask_noTask') });
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });

            logger.info('follow_up_task', message.tabId, message.task);

            // If executor exists, add follow-up task
            if (currentExecutor) {
              currentExecutor.addFollowUpTask(message.task);
              // Re-subscribe to events in case the previous subscription was cleaned up
              subscribeToExecutorEvents(currentExecutor);
              const result = await currentExecutor.execute();
              logger.info('follow_up_task execution result', message.tabId, result);
            } else {
              // executor was cleaned up, can not add follow-up task
              logger.info('follow_up_task: executor was cleaned up, can not add follow-up task');
              return port.postMessage({ type: 'error', error: t('bg_cmd_followUpTask_cleaned') });
            }
            break;
          }

          case 'cancel_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_errors_noRunningTask') });
            await currentExecutor.cancel();
            break;
          }

          case 'resume_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_cmd_resumeTask_noTask') });
            await currentExecutor.resume();
            return port.postMessage({ type: 'success' });
          }

          case 'pause_task': {
            if (!currentExecutor) return port.postMessage({ type: 'error', error: t('bg_errors_noRunningTask') });
            await currentExecutor.pause();
            return port.postMessage({ type: 'success' });
          }

          case 'screenshot': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            const page = await browserContext.switchTab(message.tabId);
            const screenshot = await page.takeScreenshot();
            logger.info('screenshot', message.tabId, screenshot);
            return port.postMessage({ type: 'success', screenshot });
          }

          case 'state': {
            try {
              const browserState = await browserContext.getState(true);
              const elementsText = browserState.elementTree.clickableElementsToString(
                DEFAULT_AGENT_OPTIONS.includeAttributes,
              );

              logger.info('state', browserState);
              logger.info('interactive elements', elementsText);
              return port.postMessage({ type: 'success', msg: t('bg_cmd_state_printed') });
            } catch (error) {
              logger.error('Failed to get state:', error);
              return port.postMessage({ type: 'error', error: t('bg_cmd_state_failed') });
            }
          }

          case 'nohighlight': {
            const page = await browserContext.getCurrentPage();
            await page.removeHighlight();
            return port.postMessage({ type: 'success', msg: t('bg_cmd_nohighlight_ok') });
          }

          case 'speech_to_text': {
            try {
              if (!message.audio) {
                return port.postMessage({
                  type: 'speech_to_text_error',
                  error: t('bg_cmd_stt_noAudioData'),
                });
              }

              logger.info('Processing speech-to-text request...');

              // Get all providers for speech-to-text service
              const providers = await llmProviderStore.getAllProviders();

              // Create speech-to-text service with all providers
              const speechToTextService = await SpeechToTextService.create(providers);

              // Extract base64 audio data (remove data URL prefix if present)
              let base64Audio = message.audio;
              if (base64Audio.startsWith('data:')) {
                base64Audio = base64Audio.split(',')[1];
              }

              // Transcribe audio
              const transcribedText = await speechToTextService.transcribeAudio(base64Audio);

              logger.info('Speech-to-text completed successfully');
              return port.postMessage({
                type: 'speech_to_text_result',
                text: transcribedText,
              });
            } catch (error) {
              logger.error('Speech-to-text failed:', error);
              return port.postMessage({
                type: 'speech_to_text_error',
                error: error instanceof Error ? error.message : t('bg_cmd_stt_failed'),
              });
            }
          }

          case 'requirement_answers': {
            if (!message.sessionId) return port.postMessage({ type: 'error', error: t('bg_errors_noTaskId') });
            if (!message.answers || typeof message.answers !== 'object') {
              return port.postMessage({ type: 'error', error: t('bg_cmd_newTask_noTask') });
            }

            const result = await requirementInterpreter.submitAnswers(
              message.sessionId,
              message.answers as QuestionAnswerMap,
            );

            if (result.status === 'error') {
              port.postMessage({ type: 'error', error: result.error });
              break;
            }

            if (result.status === 'needs_clarification') {
              sendClarification(result.request);
              break;
            }

            const pending = pendingRequirementSessions.get(message.sessionId);
            pendingRequirementSessions.delete(message.sessionId);
            await persistPendingRequirementSessions();

            if (!pending) {
              logger.info('Received requirement answers but no pending session found');
              port.postMessage({ type: 'requirement_session_missing' });
              break;
            }

            if (pending.type === 'new_task') {
              await startNewTask(pending.taskId, pending.task, pending.tabId, result.profile);
            } else {
              await startReplayTask(pending, result.profile);
            }

            break;
          }

          case 'replay': {
            if (!message.tabId) return port.postMessage({ type: 'error', error: t('bg_errors_noTabId') });
            if (!message.taskId) return port.postMessage({ type: 'error', error: t('bg_errors_noTaskId') });
            if (!message.historySessionId)
              return port.postMessage({ type: 'error', error: t('bg_cmd_replay_noHistory') });
            if (!message.task) return port.postMessage({ type: 'error', error: t('bg_cmd_newTask_noTask') });
            logger.info('replay', message.tabId, message.taskId, message.historySessionId);

            try {
              const profileResult = await requirementInterpreter.ensureProfile(message.taskId, message.task);
              if (profileResult.status === 'error') {
                port.postMessage({ type: 'error', error: profileResult.error });
                break;
              }
              if (profileResult.status === 'needs_clarification') {
                pendingRequirementSessions.set(message.taskId, {
                  type: 'replay',
                  taskId: message.taskId,
                  task: message.task,
                  tabId: message.tabId,
                  historySessionId: message.historySessionId,
                });
                await persistPendingRequirementSessions();
                sendClarification(profileResult.request);
                break;
              }
              await startReplayTask(
                {
                  type: 'replay',
                  taskId: message.taskId,
                  task: message.task,
                  tabId: message.tabId,
                  historySessionId: message.historySessionId,
                },
                profileResult.profile,
              );
            } catch (error) {
              logger.error('Replay failed:', error);
              return port.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : t('bg_cmd_replay_failed'),
              });
            }
            break;
          }

          default:
            return port.postMessage({ type: 'error', error: t('errors_cmd_unknown', [message.type]) });
        }
      } catch (error) {
        console.error('Error handling port message:', error);
        port.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : t('errors_unknown'),
        });
      }
    });

    port.onDisconnect.addListener(() => {
      // this event is also triggered when the side panel is closed, so we need to cancel the task
      logger.warning('Side panel disconnected');
      currentPort = null;
      currentExecutor?.cancel();
    });
  }
});

function sendClarification(request: RequirementClarificationRequest) {
  if (!currentPort) return;
  logger.info('Sending clarification request to side panel', {
    sessionId: request.sessionId,
    questionCount: request.questions.length,
  });
  currentPort.postMessage({
    type: 'requirement_clarification',
    payload: request,
  });
}

async function startNewTask(taskId: string, task: string, tabId: number, profile: TargetProductProfile) {
  logger.info('startNewTask invoked', { taskId, tabId, hasProfile: Boolean(profile) });
  currentExecutor = await setupExecutor(taskId, task, browserContext, profile);
  subscribeToExecutorEvents(currentExecutor);
  const result = await currentExecutor.execute();
  logger.info('new_task execution result', tabId, result);
}

async function startReplayTask(
  context: Extract<PendingRequirement, { type: 'replay' }>,
  profile: TargetProductProfile,
) {
  logger.info('startReplayTask invoked', {
    taskId: context.taskId,
    historySessionId: context.historySessionId,
    tabId: context.tabId,
  });
  await browserContext.switchTab(context.tabId);
  currentExecutor = await setupExecutor(context.taskId, context.task, browserContext, profile);
  subscribeToExecutorEvents(currentExecutor);
  const replayResult = await currentExecutor.replayHistory(context.historySessionId);
  logger.debug('replay execution result', context.tabId, replayResult);
}

async function setupExecutor(
  taskId: string,
  task: string,
  browserContext: BrowserContext,
  profile?: TargetProductProfile,
) {
  const providers = await llmProviderStore.getAllProviders();
  // if no providers, need to display the options page
  if (Object.keys(providers).length === 0) {
    throw new Error(t('bg_setup_noApiKeys'));
  }

  // Clean up any legacy validator settings for backward compatibility
  await agentModelStore.cleanupLegacyValidatorSettings();

  const agentModels = await agentModelStore.getAllAgentModels();
  // verify if every provider used in the agent models exists in the providers
  for (const agentModel of Object.values(agentModels)) {
    if (!providers[agentModel.provider]) {
      throw new Error(t('bg_setup_noProvider', [agentModel.provider]));
    }
  }

  const navigatorModel = agentModels[AgentNameEnum.Navigator];
  if (!navigatorModel) {
    throw new Error(t('bg_setup_noNavigatorModel'));
  }
  // Log the provider config being used for the navigator
  const navigatorProviderConfig = providers[navigatorModel.provider];
  const navigatorLLM = createChatModel(navigatorProviderConfig, navigatorModel);

  let plannerLLM: BaseChatModel | null = null;
  const plannerModel = agentModels[AgentNameEnum.Planner];
  if (plannerModel) {
    // Log the provider config being used for the planner
    const plannerProviderConfig = providers[plannerModel.provider];
    plannerLLM = createChatModel(plannerProviderConfig, plannerModel);
  }

  // Apply firewall settings to browser context
  const firewall = await firewallStore.getFirewall();
  if (firewall.enabled) {
    browserContext.updateConfig({
      allowedUrls: firewall.allowList,
      deniedUrls: firewall.denyList,
    });
  } else {
    browserContext.updateConfig({
      allowedUrls: [],
      deniedUrls: [],
    });
  }

  const generalSettings = await generalSettingsStore.getSettings();
  browserContext.updateConfig({
    minimumWaitPageLoadTime: generalSettings.minWaitPageLoad / 1000.0,
    displayHighlights: generalSettings.displayHighlights,
  });

  const executor = new Executor(task, taskId, browserContext, navigatorLLM, {
    plannerLLM: plannerLLM ?? navigatorLLM,
    agentOptions: {
      maxSteps: generalSettings.maxSteps,
      maxFailures: generalSettings.maxFailures,
      maxActionsPerStep: generalSettings.maxActionsPerStep,
      useVision: generalSettings.useVision,
      useVisionForPlanner: true,
      planningInterval: generalSettings.planningInterval,
    },
    generalSettings: generalSettings,
    targetProductProfile: profile,
  });

  return executor;
}

// Update subscribeToExecutorEvents to use port
async function subscribeToExecutorEvents(executor: Executor) {
  // Clear previous event listeners to prevent multiple subscriptions
  executor.clearExecutionEvents();

  // Subscribe to new events
  executor.subscribeExecutionEvents(async event => {
    logger.debug('Executor event emitted', event);
    try {
      if (currentPort) {
        currentPort.postMessage(event);
      }
    } catch (error) {
      logger.error('Failed to send message to side panel:', error);
    }

    if (
      event.state === ExecutionState.TASK_OK ||
      event.state === ExecutionState.TASK_FAIL ||
      event.state === ExecutionState.TASK_CANCEL
    ) {
      await currentExecutor?.cleanup();
    }
  });
}
