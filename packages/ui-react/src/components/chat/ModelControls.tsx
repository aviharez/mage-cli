import React from 'react';
import type { EditPermissionMode } from '@/stores/types/sessionTypes';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from "@/components/icon/Icon";
import { useIsVSCodeRuntime } from '@/hooks/useRuntimeAPIs';
import { isDesktopShell } from '@/lib/desktop';
import { getAgentColor } from '@/lib/agentColors';
import { useDeviceInfo } from '@/lib/device';
import { getEditModeColors } from '@/lib/permissions/editModeColors';
import { cn, fuzzyMatch } from '@/lib/utils';
import { useContextStore } from '@/stores/contextStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useDirectorySync, useSessionMessages } from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { getSessionMaterializationStatus } from '@/sync/materialization';
import { useUIStore } from '@/stores/useUIStore';
import { isPrimaryMode, type MobileControlsPanel } from './mobileControlsUtils';
import { useI18n } from '@/lib/i18n';
import { useMageReadiness } from '@/hooks/useMageReadiness';
import { eventMatchesShortcut, getEffectiveShortcutCombo, normalizeCombo } from '@/lib/shortcuts';
import { markStartupTrace } from '@/lib/startupTrace';

type PermissionAction = 'allow' | 'ask' | 'deny';
type PermissionRule = { permission: string; pattern: string; action: PermissionAction };

const asPermissionRuleset = (value: unknown): PermissionRule[] | null => {
    if (!Array.isArray(value)) {
        return null;
    }
    const rules: PermissionRule[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const candidate = entry as Partial<PermissionRule>;
        if (typeof candidate.permission !== 'string' || typeof candidate.pattern !== 'string' || typeof candidate.action !== 'string') {
            continue;
        }
        if (candidate.action !== 'allow' && candidate.action !== 'ask' && candidate.action !== 'deny') {
            continue;
        }
        rules.push({ permission: candidate.permission, pattern: candidate.pattern, action: candidate.action });
    }
    return rules;
};

const resolveWildcardPermissionAction = (ruleset: unknown, permission: string): PermissionAction | undefined => {
    const rules = asPermissionRuleset(ruleset);
    if (!rules || rules.length === 0) {
        return undefined;
    }

    for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule.permission === permission && rule.pattern === '*') {
            return rule.action;
        }
    }

    for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        if (rule.permission === '*' && rule.pattern === '*') {
            return rule.action;
        }
    }

    return undefined;
};

const EditModeIcon: React.FC<{ mode: EditPermissionMode; className?: string }> = ({ mode, className }) => {
    const combinedClassName = cn(className, 'flex-shrink-0');
    const modeColors = getEditModeColors(mode);
    const iconColor = modeColors ? modeColors.text : 'var(--foreground)';
    const iconStyle = { color: iconColor };

    if (mode === 'full') {
        return <Icon name="pencil-ai" className={combinedClassName} style={iconStyle} />;
    }
    if (mode === 'allow') {
        return <Icon name="checkbox-circle" className={combinedClassName} style={iconStyle} />;
    }
    if (mode === 'deny') {
        return <Icon name="close-circle" className={combinedClassName} style={iconStyle} />;
    }
    return <Icon name="question" className={combinedClassName} style={iconStyle} />;
};

interface ModelControlsProps {
    className?: string;
    mobilePanel?: MobileControlsPanel;
    onMobilePanelChange?: (panel: MobileControlsPanel) => void;
}

export const ModelControls: React.FC<ModelControlsProps> = ({
    className,
    mobilePanel,
    onMobilePanelChange,
}) => {
    const { t } = useI18n();
    const { isReady, isUnavailable } = useMageReadiness();
    const readinessLabel = isUnavailable ? t('common.unavailable') : t('common.loading');
    const currentAgentName = useConfigStore((state) => state.currentAgentName);
    const settingsDefaultAgent = useConfigStore((state) => state.settingsDefaultAgent);
    const setAgent = useConfigStore((state) => state.setAgent);
    const getCurrentAgent = useConfigStore((state) => state.getCurrentAgent);
    const getVisibleAgents = useConfigStore((state) => state.getVisibleAgents);

    // Use visible agents (excludes hidden internal agents)
    const agents = getVisibleAgents();
    const primaryAgents = React.useMemo(() => agents.filter((agent) => agent.mode === 'primary'), [agents]);
    const tracedReadyRef = React.useRef(false);

    React.useEffect(() => {
        if (tracedReadyRef.current || !isReady) return;
        tracedReadyRef.current = true;
        markStartupTrace('ModelControls:ready', {
            agents: agents.length,
            currentAgentName,
        });
    }, [agents.length, currentAgentName, isReady]);

    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const getDirectoryForSession = useSessionUIStore((s) => s.getDirectoryForSession);
    const sync = useSync();

    const saveSessionAgentSelection = useSelectionStore((state) => state.saveSessionAgentSelection);

    const contextHydrated = useContextStore((state) => state.hasHydrated);

    const sessionSavedAgentName = useSelectionStore((state) =>
        currentSessionId ? state.sessionAgentSelections.get(currentSessionId) ?? null : null
    );

    const stickySessionAgentRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!currentSessionId) {
            stickySessionAgentRef.current = null;
            return;
        }
        if (sessionSavedAgentName) {
            stickySessionAgentRef.current = sessionSavedAgentName;
        }
    }, [currentSessionId, sessionSavedAgentName]);

    const stickySessionAgentName = currentSessionId ? stickySessionAgentRef.current : null;

    // Prefer per-session selection over global config to avoid flicker during server-driven mode switches.
    const uiAgentName = currentSessionId
        ? (sessionSavedAgentName || stickySessionAgentName || currentAgentName)
        : currentAgentName;

    const addRecentAgent = useUIStore((state) => state.addRecentAgent);
    const cycleAgentShortcutOverride = useUIStore((state) => state.shortcutOverrides.cycle_agent);
    const cycleAgentShortcut = React.useMemo(() => (
        getEffectiveShortcutCombo('cycle_agent', cycleAgentShortcutOverride ? { cycle_agent: cycleAgentShortcutOverride } : undefined)
    ), [cycleAgentShortcutOverride]);

    // Separate state for agent selector to avoid conflict with model selector
    const [isAgentSelectorOpen, setIsAgentSelectorOpen] = React.useState(false);

    const { isMobile: deviceIsMobile } = useDeviceInfo();
    // The composer decides whether it renders the mobile layout from the UI
    // store (the Capacitor shell forces it true even on tablets/iPad, where
    // useDeviceInfo classifies the wide screen as non-mobile). The bottom-sheet
    // panels must follow the SAME source: with the device flag alone, tapping
    // the model/agent chip on an iPad set the panel state while the sheet
    // itself rendered null.
    const uiIsMobile = useUIStore((state) => state.isMobile);
    const isMobile = deviceIsMobile || uiIsMobile;
    const isDesktop = React.useMemo(() => isDesktopShell(), []);
    const isVSCodeRuntime = useIsVSCodeRuntime();
    // Only use mobile panels on actual mobile devices, VSCode uses desktop dropdowns
    const isCompact = isMobile;
    const [localMobilePanel, setLocalMobilePanel] = React.useState<MobileControlsPanel>(null);
    const usingExternalMobilePanel = mobilePanel !== undefined && typeof onMobilePanelChange === 'function';
    const activeMobilePanel = usingExternalMobilePanel ? mobilePanel : localMobilePanel;
    const setActiveMobilePanel = usingExternalMobilePanel ? onMobilePanelChange : setLocalMobilePanel;
    const [mobileTooltipOpen, setMobileTooltipOpen] = React.useState<'model' | 'agent' | null>(null);
    const closeMobilePanel = React.useCallback(() => setActiveMobilePanel(null), [setActiveMobilePanel]);
    const closeMobileTooltip = React.useCallback(() => setMobileTooltipOpen(null), []);
    const longPressTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

    // Handle agent selector close behavior
    const [agentSearchQuery, setAgentSearchQuery] = React.useState('');
    React.useEffect(() => {
        if (!isAgentSelectorOpen) {
            setAgentSearchQuery('');
            if (!isCompact) {
                requestAnimationFrame(() => {
                    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
                    textarea?.focus();
                });
            }
        }
    }, [isAgentSelectorOpen, isCompact]);

    const selectableDesktopAgents = React.useMemo(() => {
        return agents.filter((agent) => isPrimaryMode(agent.mode));
    }, [agents]);

    const sortedAndFilteredAgents = React.useMemo(() => {
        const sorted = [...selectableDesktopAgents].sort((a, b) => a.name.localeCompare(b.name));
        if (!agentSearchQuery.trim()) {
            return sorted;
        }
        return sorted.filter((agent) =>
            fuzzyMatch(agent.name, agentSearchQuery) ||
            (agent.description && fuzzyMatch(agent.description, agentSearchQuery))
        );
    }, [selectableDesktopAgents, agentSearchQuery]);

    const defaultAgentName = React.useMemo(() => {
        if (settingsDefaultAgent) {
            const found = selectableDesktopAgents.find(a => a.name === settingsDefaultAgent);
            if (found) return found.name;
        }
        const buildAgent = selectableDesktopAgents.find(a => a.name === 'build');
        if (buildAgent) return buildAgent.name;
        return selectableDesktopAgents[0]?.name;
    }, [settingsDefaultAgent, selectableDesktopAgents]);

    const currentAgent = React.useMemo(() => {
        if (uiAgentName) {
            return agents.find((agent) => agent.name === uiAgentName);
        }
        return getCurrentAgent?.();
    }, [agents, getCurrentAgent, uiAgentName]);

    const sizeVariant: 'mobile' | 'vscode' | 'default' = isMobile ? 'mobile' : isVSCodeRuntime ? 'vscode' : 'default';
    const buttonHeight = sizeVariant === 'mobile' ? 'h-9' : sizeVariant === 'vscode' ? 'h-6' : 'h-8';
    const controlIconSize = sizeVariant === 'mobile' ? 'size-5' : sizeVariant === 'vscode' ? 'size-4' : 'size-4';
    const controlTextSize = isCompact ? 'typography-micro' : 'typography-meta';
    const inlineGapClass = sizeVariant === 'mobile' ? 'gap-x-1' : sizeVariant === 'vscode' ? 'gap-x-2' : 'gap-x-3';

    const prevAgentNameRef = React.useRef<string | undefined>(undefined);
    const explicitAgentSwitchRef = React.useRef<string | null>(null);
    const latestLoadedUserChoiceRestoreRef = React.useRef<string | null>(null);


    const currentSessionDirectory = currentSessionId ? getDirectoryForSession(currentSessionId) : undefined;
    const hasRenderableCurrentSessionSnapshot = useDirectorySync(
        React.useCallback(
            (state) => (currentSessionId ? getSessionMaterializationStatus(state, currentSessionId).renderable : false),
            [currentSessionId],
        ),
        currentSessionDirectory ?? undefined,
    );
    const currentSessionMessagesFromSync = useSessionMessages(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const latestLoadedUserChoice = React.useMemo(() => {
        for (let i = currentSessionMessagesFromSync.length - 1; i >= 0; i -= 1) {
            const message = currentSessionMessagesFromSync[i] as typeof currentSessionMessagesFromSync[number] & {
                model?: { providerID?: string; modelID?: string; variant?: string };
                variant?: string;
                mode?: string;
            };
            if (message.role !== 'user') {
                continue;
            }

            const providerID = typeof message.model?.providerID === 'string' && message.model.providerID.trim().length > 0
                ? message.model.providerID
                : undefined;
            const modelID = typeof message.model?.modelID === 'string' && message.model.modelID.trim().length > 0
                ? message.model.modelID
                : undefined;
            const agent = typeof message.agent === 'string' && message.agent.trim().length > 0
                ? message.agent
                : (typeof message.mode === 'string' && message.mode.trim().length > 0 ? message.mode : undefined);
            // Mage 1.4.0 moved variant from top-level to model.variant.
            // Prefer the new location, fall back to the legacy one for older servers.
            const variantCandidate = message.model?.variant ?? message.variant;
            const variant = typeof variantCandidate === 'string' && variantCandidate.trim().length > 0
                ? variantCandidate
                : undefined;

            return { id: message.id, agent, providerID, modelID, variant };
        }
        return null;
    }, [currentSessionMessagesFromSync]);

    React.useEffect(() => {
        if (!currentSessionId) {
            latestLoadedUserChoiceRestoreRef.current = null;
            return;
        }

        if (!contextHydrated || !hasRenderableCurrentSessionSnapshot || !latestLoadedUserChoice?.agent) {
            return;
        }

        const restoreKey = [
            currentSessionId,
            latestLoadedUserChoice.id,
            latestLoadedUserChoice.agent,
        ].join('|');

        if (latestLoadedUserChoiceRestoreRef.current === restoreKey) {
            return;
        }

        if (currentAgentName !== latestLoadedUserChoice.agent) {
            setAgent(latestLoadedUserChoice.agent);
        }

        saveSessionAgentSelection(currentSessionId, latestLoadedUserChoice.agent);
        latestLoadedUserChoiceRestoreRef.current = restoreKey;

    }, [
        currentSessionId,
        currentAgentName,
        contextHydrated,
        hasRenderableCurrentSessionSnapshot,
        latestLoadedUserChoice,
        setAgent,
        saveSessionAgentSelection,
    ]);

    React.useEffect(() => {
        if (!currentSessionId) {
            latestLoadedUserChoiceRestoreRef.current = null;
            return;
        }

        if (!contextHydrated || agents.length === 0) {
            return;
        }

        const savedAgentName = useSelectionStore.getState().getSessionAgentSelection(currentSessionId);
        if (savedAgentName) {
            if (currentAgentName !== savedAgentName) {
                setAgent(savedAgentName);
            }
            return;
        }

        if (!hasRenderableCurrentSessionSnapshot) {
            if (!sync.isLoading(currentSessionId)) {
                void sync.ensureSessionRenderable(currentSessionId);
            }
            return;
        }

        if (latestLoadedUserChoice) {
            return;
        }

        // Fallback: no saved/loaded agent selection yet for this session — pick a sensible default.
        const existingSelection = useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current;

        // If we already have a valid agent selected (often from server-injected mode switch),
        // don't override it with a fallback.
        const preferred = existingSelection || currentAgentName;
        if (preferred && agents.some((agent) => agent.name === preferred)) {
            if (currentAgentName !== preferred) {
                setAgent(preferred);
            }
            return;
        }

        const fallbackAgent = agents.find(agent => agent.name === 'build') || primaryAgents[0] || agents[0];
        if (!fallbackAgent) {
            return;
        }

        if (!existingSelection) {
            saveSessionAgentSelection(currentSessionId, fallbackAgent.name);
        }

        if (currentAgentName !== fallbackAgent.name) {
            setAgent(fallbackAgent.name);
        }
    }, [
        currentSessionId,
        hasRenderableCurrentSessionSnapshot,
        latestLoadedUserChoice,
        agents,
        primaryAgents,
        currentAgentName,
        setAgent,
        saveSessionAgentSelection,
        contextHydrated,
        sync,
    ]);

    React.useEffect(() => {
        if (!contextHydrated) {
            return;
        }

        if (currentAgentName !== prevAgentNameRef.current) {
            prevAgentNameRef.current = currentAgentName;
            explicitAgentSwitchRef.current = null;
        }
    }, [currentAgentName, contextHydrated]);

    const handleAgentChange = React.useCallback((agentName: string) => {
        try {
            explicitAgentSwitchRef.current = agentName;
            setAgent(agentName);
            addRecentAgent(agentName);

            if (currentSessionId) {
                saveSessionAgentSelection(currentSessionId, agentName);
            }
            if (isCompact) {
                closeMobilePanel();
            }
        } catch (error) {
            console.error('[ModelControls] Handle agent change error:', error);
        }
    }, [
        addRecentAgent,
        closeMobilePanel,
        currentSessionId,
        isCompact,
        saveSessionAgentSelection,
        setAgent,
    ]);

    const getAgentDisplayName = () => {
        if (!uiAgentName) {
            const buildAgent = primaryAgents.find(agent => agent.name === 'build');
            const defaultAgent = buildAgent || primaryAgents[0];
            return defaultAgent ? capitalizeAgentName(defaultAgent.name) : 'Select Agent';
        }
        const agent = agents.find(a => a.name === uiAgentName);
        return agent ? capitalizeAgentName(agent.name) : capitalizeAgentName(uiAgentName);
    };

    const capitalizeAgentName = (name: string) => {
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const handleLongPressStart = React.useCallback((type: 'model' | 'agent') => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = setTimeout(() => {
            setMobileTooltipOpen(type);
        }, 500);
    }, []);

    const handleLongPressEnd = React.useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
    }, []);

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);


    const renderMobileAgentTooltip = () => {
        if (!isCompact || mobileTooltipOpen !== 'agent' || !currentAgent) return null;

        const hasCustomPrompt = Boolean(currentAgent.prompt && currentAgent.prompt.trim().length > 0);
        const hasModelConfig = currentAgent.model?.providerID && currentAgent.model?.modelID;
        const hasTemperatureOrTopP = currentAgent.temperature !== undefined || currentAgent.topP !== undefined;

        const summarizePermission = (permissionName: string): { mode: EditPermissionMode; label: string } => {
            const rules = asPermissionRuleset(currentAgent.permission) ?? [];
            const hasCustom = rules.some((rule) => rule.permission === permissionName && rule.pattern !== '*');
            const action = resolveWildcardPermissionAction(rules, permissionName) ?? 'ask';

            if (hasCustom) {
                return { mode: 'ask', label: t('chat.modelControls.permissionLabel.custom') };
            }

            if (action === 'allow') return { mode: 'allow', label: t('chat.modelControls.permissionLabel.allow') };
            if (action === 'deny') return { mode: 'deny', label: t('chat.modelControls.permissionLabel.deny') };
            return { mode: 'ask', label: t('chat.modelControls.permissionLabel.ask') };
        };

        const editPermissionSummary = summarizePermission('edit');
        const bashPermissionSummary = summarizePermission('bash');
        const webfetchPermissionSummary = summarizePermission('webfetch');

        return (
            <MobileOverlayPanel
                open={true}
                onClose={closeMobileTooltip}
                title={capitalizeAgentName(currentAgent.name)}
            >
                <div className="flex flex-col gap-1.5">
                    {}
                    {currentAgent.description && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-meta text-foreground">{currentAgent.description}</div>
                        </div>
                    )}

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-0.5">{t('chat.modelControls.mode')}</div>
                        <div className="typography-meta text-foreground font-medium">
                            {currentAgent.mode === 'primary'
                                ? t('chat.modelControls.modeValue.primary')
                                : currentAgent.mode === 'subagent'
                                    ? t('chat.modelControls.modeValue.subagent')
                                    : currentAgent.mode === 'all'
                                        ? t('chat.modelControls.modeValue.all')
                                        : t('chat.modelControls.modeValue.none')}
                        </div>
                    </div>

                    {}
                    {(hasModelConfig || hasTemperatureOrTopP) && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.model')}</div>
                            {hasModelConfig && (
                                <div className="typography-meta text-foreground font-medium mb-1">
                                    {currentAgent.model!.providerID} / {currentAgent.model!.modelID}
                                </div>
                            )}
                            {hasTemperatureOrTopP && (
                                <div className="flex flex-col gap-0.5">
                                    {currentAgent.temperature !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.temperature')}</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.temperature}</span>
                                        </div>
                                    )}
                                    {currentAgent.topP !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.topP')}</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.topP}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {}
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">{t('chat.modelControls.permissions')}</div>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.edit')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={editPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {editPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.bash')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={bashPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {bashPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.webFetch')}</span>
                                <div className="flex items-center gap-1.5">
                                    <EditModeIcon mode={webfetchPermissionSummary.mode} className="size-3.5" />
                                    <span className="typography-meta font-medium text-foreground">
                                        {webfetchPermissionSummary.label}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {}
                    {hasCustomPrompt && (
                        <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                            <div className="flex items-center justify-between">
                                <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.customPrompt')}</span>
                                <Icon name="checkbox-circle" className="size-4 text-foreground" />
                            </div>
                        </div>
                    )}
                </div>
            </MobileOverlayPanel>
        );
    };



    const renderMobileAgentPanel = () => {
        if (!isCompact) return null;
 
        return (
            <MobileOverlayPanel
                open={activeMobilePanel === 'agent'}
                onClose={closeMobilePanel}
                title={t('chat.modelControls.selectAgent')}
                contentMaxHeightClassName="max-h-[min(52dvh,360px)]"
            >
                <div className="flex flex-col gap-2">
                    {selectableDesktopAgents.map((agent) => {
                        const isSelected = agent.name === uiAgentName;
                        const agentColor = getAgentColor(agent.name);
                        return (
                            <button
                                key={agent.name}
                                type="button"
                                className={cn(
                                    'flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    'touch-manipulation cursor-pointer transition-colors',
                                    'active:bg-interactive-hover',
                                    isSelected 
                                        ? 'border-primary/50 bg-interactive-selection/20' 
                                        : 'border-border/40 hover:bg-interactive-hover/50'
                                )}
                                onClick={() => handleAgentChange(agent.name)}
                            >
                                <div className="flex items-center gap-2">
                                    <div className={cn('size-2.5 rounded-full flex-shrink-0', agentColor.class)} />
                                    <span
                                        className="typography-ui-label font-semibold"
                                        style={isSelected ? { color: `var(${agentColor.var})` } : undefined}
                                    >
                                        {capitalizeAgentName(agent.name)}
                                    </span>
                                    {isSelected && (
                                        <Icon name="check" className="size-4 text-primary ml-auto flex-shrink-0" />
                                    )}
                                </div>
                                {agent.description && (
                                    <span className="typography-meta text-muted-foreground pl-4.5">
                                        {agent.description}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </MobileOverlayPanel>
        );
    };

    const renderAgentTooltipContent = () => {
        if (!currentAgent) {
            return (
                <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
                    <div className="min-w-[200px] typography-meta text-muted-foreground">{t('chat.modelControls.noAgentSelected')}</div>
                </TooltipContent>
            );
        }

        const hasCustomPrompt = Boolean(currentAgent.prompt && currentAgent.prompt.trim().length > 0);
        const hasModelConfig = currentAgent.model?.providerID && currentAgent.model?.modelID;
        const hasTemperatureOrTopP = currentAgent.temperature !== undefined || currentAgent.topP !== undefined;

        const summarizePermission = (permissionName: string): { mode: EditPermissionMode; label: string } => {
            const rules = asPermissionRuleset(currentAgent.permission) ?? [];
            const hasCustom = rules.some((rule) => rule.permission === permissionName && rule.pattern !== '*');
            const action = resolveWildcardPermissionAction(rules, permissionName) ?? 'ask';

            if (hasCustom) {
                                return { mode: 'ask', label: t('chat.modelControls.permissionLabel.custom') };
                            }

            if (action === 'allow') return { mode: 'allow', label: t('chat.modelControls.permissionLabel.allow') };
            if (action === 'deny') return { mode: 'deny', label: t('chat.modelControls.permissionLabel.deny') };
            return { mode: 'ask', label: t('chat.modelControls.permissionLabel.ask') };
        };

        const editPermissionSummary = summarizePermission('edit');
        const bashPermissionSummary = summarizePermission('bash');
        const webfetchPermissionSummary = summarizePermission('webfetch');

        return (
            <TooltipContent align="start" sideOffset={8} className="max-w-[280px]">
                <div className="flex min-w-[200px] flex-col gap-2.5">
                    <div className="flex flex-col gap-0.5">
                        <span className="typography-micro font-semibold text-foreground">
                            {capitalizeAgentName(currentAgent.name)}
                        </span>
                        {currentAgent.description && (
                            <span className="typography-meta text-muted-foreground">{currentAgent.description}</span>
                        )}
                    </div>

                    <div className="flex flex-col gap-1">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.mode')}</span>
                        <span className="typography-meta text-foreground">
                            {currentAgent.mode === 'primary'
                                ? t('chat.modelControls.modeValue.primary')
                                : currentAgent.mode === 'subagent'
                                    ? t('chat.modelControls.modeValue.subagent')
                                    : currentAgent.mode === 'all'
                                        ? t('chat.modelControls.modeValue.all')
                                        : t('chat.modelControls.modeValue.none')}
                        </span>
                    </div>

                    {(hasModelConfig || hasTemperatureOrTopP) && (
                        <div className="flex flex-col gap-1">
                            <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.model')}</span>
                            {hasModelConfig ? (
                                <span className="typography-meta text-foreground">
                                    {currentAgent.model!.providerID} / {currentAgent.model!.modelID}
                                </span>
                            ) : (
                                <span className="typography-meta text-muted-foreground">{t('chat.modelControls.modeValue.none')}</span>
                            )}
                            {hasTemperatureOrTopP && (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                    {currentAgent.temperature !== undefined && (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.temperature')}</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.temperature}</span>
                                        </div>
                                    )}
                                    {currentAgent.topP !== undefined && (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.topP')}</span>
                                            <span className="typography-meta font-medium text-foreground">{currentAgent.topP}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">{t('chat.modelControls.permissions')}</span>
                        <div className="flex items-center gap-3">
                            <span className="typography-meta text-muted-foreground/80 w-16">{t('chat.modelControls.edit')}</span>
                            <div className="flex items-center gap-1.5">
                                <EditModeIcon mode={editPermissionSummary.mode} className="size-3.5" />
                                <span className="typography-meta font-medium text-foreground w-12">
                                    {editPermissionSummary.label}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="typography-meta text-muted-foreground/80 w-16">{t('chat.modelControls.bash')}</span>
                            <div className="flex items-center gap-1.5">
                                <EditModeIcon mode={bashPermissionSummary.mode} className="size-3.5" />
                                <span className="typography-meta font-medium text-foreground w-12">
                                    {bashPermissionSummary.label}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="typography-meta text-muted-foreground/80 w-16">{t('chat.modelControls.webFetch')}</span>
                            <div className="flex items-center gap-1.5">
                                <EditModeIcon mode={webfetchPermissionSummary.mode} className="size-3.5" />
                                <span className="typography-meta font-medium text-foreground w-12">
                                    {webfetchPermissionSummary.label}
                                </span>
                            </div>
                        </div>
                    </div>

                    {hasCustomPrompt && (
                        <div className="flex items-center justify-between gap-3">
                            <span className="typography-meta text-muted-foreground/80">{t('chat.modelControls.customPrompt')}</span>
                            <Icon name="checkbox-circle" className="size-4 text-foreground" />
                        </div>
                    )}
                </div>
            </TooltipContent>
        );
    };

    const renderAgentSelector = () => {
        if (!isCompact) {
            return (
                <div className="flex items-center gap-2 min-w-0">
                    <Tooltip delayDuration={600}>
                        <DropdownMenu open={isReady && isAgentSelectorOpen} onOpenChange={isReady ? setIsAgentSelectorOpen : undefined}>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <div className={cn(
                                        'flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-transparent hover:opacity-70 min-w-0',
                                        buttonHeight
                                    )}>
                                        {!isReady ? (
                                            <>
                                                <Icon name="loader-4"
                                                    className={cn(
                                                        controlIconSize,
                                                        'flex-shrink-0 animate-spin text-muted-foreground'
                                                    )}
                                                />
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate text-muted-foreground'
                                                    )}
                                                >
                                                    {readinessLabel}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <Icon name="ai-agent"
                                                    className={cn(
                                                        controlIconSize,
                                                        'flex-shrink-0',
                                                        uiAgentName ? '' : 'text-muted-foreground'
                                                    )}
                                                    style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                                                />
                                                <span
                                                    className={cn(
                                                        'model-controls__agent-label',
                                                        controlTextSize,
                                                        'font-medium min-w-0 truncate',
                                                        isDesktop ? 'max-w-[220px]' : undefined
                                                    )}
                                                    style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                                                >
                                                    {getAgentDisplayName()}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <DropdownMenuContent align="end" alignOffset={-40} className="w-[min(280px,calc(100vw-2rem))] p-0 flex flex-col">
                                <div className="p-2 border-b border-border/40">
                                    <div className="relative">
                                        <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            placeholder={t('chat.modelControls.searchAgents')}
                                            value={agentSearchQuery}
                                            onChange={(e) => setAgentSearchQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                e.stopPropagation();
                                            }}
                                            className="pl-8 h-8 typography-meta"
                                        />
                                    </div>
                                </div>
                                <ScrollableOverlay outerClassName="max-h-[min(400px,calc(100dvh-12rem))] flex-1">
                                    <div className="p-1">
                                        {!agentSearchQuery.trim() && defaultAgentName && (
                                            <>
                                                <DropdownMenuItem
                                                    className="typography-meta"
                                                    onSelect={() => handleAgentChange(defaultAgentName)}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <Icon name="arrow-go-back" className="size-3.5 text-muted-foreground" />
                                                        <span className="font-medium">{t('chat.modelControls.resetToDefault')}</span>
                                                    </div>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                            </>
                                        )}
                                        {sortedAndFilteredAgents.length === 0 ? (
                                            <div className="px-2 py-4 text-center typography-meta text-muted-foreground">
                                                No agents found
                                            </div>
                                        ) : (
                                            sortedAndFilteredAgents.map((agent) => (
                                                <DropdownMenuItem
                                                    key={agent.name}
                                                    className="typography-meta"
                                                    onSelect={() => handleAgentChange(agent.name)}
                                                >
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={cn(
                                                                'h-1 w-1 rounded-full agent-dot',
                                                                getAgentColor(agent.name).class
                                                            )} />
                                                            <span className="font-medium">{capitalizeAgentName(agent.name)}</span>
                                                        </div>
                                                        {agent.description && (
                                                            <span className="typography-meta text-muted-foreground max-w-[200px] ml-2.5 break-words">
                                                                {agent.description}
                                                            </span>
                                                        )}
                                                    </div>
                                                </DropdownMenuItem>
                                            ))
                                        )}
                                    </div>
                                </ScrollableOverlay>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {renderAgentTooltipContent()}
                    </Tooltip>
                </div>
            );
        }

        return (
            <button
                type="button"
                onClick={isReady ? () => setActiveMobilePanel('agent') : undefined}
                onTouchStart={isReady ? () => handleLongPressStart('agent') : undefined}
                onTouchEnd={isReady ? handleLongPressEnd : undefined}
                onTouchCancel={isReady ? handleLongPressEnd : undefined}
                disabled={!isReady}
                className={cn(
                    'model-controls__agent-trigger flex items-center gap-1.5 transition-colors min-w-0 focus:outline-none',
                    buttonHeight,
                    isReady ? 'cursor-pointer hover:bg-transparent hover:opacity-70' : 'opacity-60 cursor-not-allowed',
                )}
            >
                {!isReady ? (
                    <>
                        <Icon name="loader-4"
                            className={cn(
                                controlIconSize,
                                'flex-shrink-0 animate-spin text-muted-foreground'
                            )}
                        />
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0 text-muted-foreground'
                            )}
                        >
                            {readinessLabel}
                        </span>
                    </>
                ) : (
                    <>
                        <Icon name="ai-agent"
                            className={cn(
                                controlIconSize,
                                'flex-shrink-0',
                                uiAgentName ? '' : 'text-muted-foreground'
                            )}
                            style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                        />
                        <span
                            className={cn(
                                'model-controls__agent-label',
                                controlTextSize,
                                'font-medium truncate min-w-0',
                                isMobile && 'max-w-[60px]'
                            )}
                            style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                        >
                            {getAgentDisplayName()}
                        </span>
                    </>
                )}
            </button>
        );
    };

    const inlineClassName = cn(
        '@container/model-controls flex items-center min-w-0',
        // Only force full-width + truncation behaviors on true mobile layouts.
        // VS Code also uses "compact" mode, but should keep its right-aligned inline sizing.
        isMobile && 'w-full',
        className,
    );

    return (
        <>
            <div className={inlineClassName}>
                <div
                    className={cn(
                        'flex items-center min-w-0 flex-1 justify-end',
                        inlineGapClass,
                        isMobile && 'overflow-hidden'
                    )}
                >
                    {renderAgentSelector()}
                </div>
            </div>

            {renderMobileAgentPanel()}
            {renderMobileAgentTooltip()}
        </>
    );

};
