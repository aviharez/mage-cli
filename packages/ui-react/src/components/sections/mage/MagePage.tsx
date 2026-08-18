import React from 'react';
import { MageVisualSettings } from './MageVisualSettings';
import { AboutSettings } from './AboutSettings';
import { SessionRetentionSettings } from './SessionRetentionSettings';
import { PasskeySettings } from './PasskeySettings';
import { DefaultsSettings } from './DefaultsSettings';
import { GitSettings } from './GitSettings';
import { NotificationSettings } from './NotificationSettings';
import { GitLabSettings } from './GitLabSettings';
import { TunnelSettings } from './TunnelSettings';
import { DesktopNetworkSettings } from './DesktopNetworkSettings';
import { KeyboardShortcutsSettings } from './KeyboardShortcutsSettings';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useDeviceInfo } from '@/lib/device';
import { isDesktopLocalOriginActive, isDesktopShell, isVSCodeRuntime, isWebRuntime } from '@/lib/desktop';
import { subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import type { MageSection } from './types';

const useRuntimeEndpointEpoch = (): number => {
    const [epoch, setEpoch] = React.useState(0);

    React.useEffect(() => {
        return subscribeRuntimeEndpointChanged(() => setEpoch((current) => current + 1));
    }, []);

    return epoch;
};

interface MagePageProps {
    /** Which section to display. If undefined, shows all sections (mobile/legacy behavior) */
    section?: MageSection;
}

export const MagePage: React.FC<MagePageProps> = ({ section }) => {
    const { isMobile } = useDeviceInfo();
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();
    const showAbout = isMobile && isWebRuntime();
    const isVSCode = isVSCodeRuntime();
    void runtimeEndpointEpoch;
    const showDesktopNetworkSettings = isDesktopShell() && isDesktopLocalOriginActive();

    // If no section specified, show all (mobile/legacy behavior)
    if (!section) {
        return (
            <ScrollableOverlay
                outerClassName="h-full"
                className="w-full"
            >
                <div className="mage-page-body mx-auto max-w-3xl space-y-3 p-3 sm:space-y-6 sm:p-6 sm:pt-8">
                    <MageVisualSettings />
                    <div className="border-t border-border/40 pt-6">
                        <DefaultsSettings />
                    </div>
                    {showDesktopNetworkSettings && (
                        <div className="border-t border-border/40 pt-6">
                            <DesktopNetworkSettings />
                        </div>
                    )}
                    <div className="border-t border-border/40 pt-6">
                        <SessionRetentionSettings />
                    </div>
                    <div className="border-t border-border/40 pt-6">
                        <PasskeySettings />
                    </div>
                    {showAbout && (
                        <div className="border-t border-border/40 pt-6">
                            <AboutSettings />
                        </div>
                    )}
                </div>
            </ScrollableOverlay>
        );
    }

    // Show specific section content
    const renderSectionContent = () => {
        switch (section) {
            case 'visual':
                return <VisualSectionContent />;
            case 'chat':
                return <ChatSectionContent />;
            case 'sessions':
                return <SessionsSectionContent />;
            case 'shortcuts':
                return <ShortcutsSectionContent />;
            case 'git':
                return <GitSectionContent />;
            case 'gitlab':
                return <GitLabSectionContent />;
            case 'notifications':
                return <NotificationSectionContent />;
            case 'tunnel':
                return <TunnelSectionContent />;
            default:
                return null;
        }
    };

    return (
        <ScrollableOverlay
            outerClassName="h-full"
            className="w-full"
        >
            <div className="mage-page-body mx-auto max-w-3xl space-y-6 p-3 sm:p-6 sm:pt-8">
                {renderSectionContent()}
            </div>
        </ScrollableOverlay>
    );
};

const ShortcutsSectionContent: React.FC = () => {
    return <KeyboardShortcutsSettings />;
};

// Visual section: Theme Mode, Font Size, Spacing, Input Bar Offset (mobile), Nav Rail
const VisualSectionContent: React.FC = () => {
    const isVSCode = isVSCodeRuntime();
    return <MageVisualSettings visibleSettings={[
        'theme',
        'pwaInstallName',
        'pwaOrientation',
        'mobileKeyboardMode',
        'timeFormat',
        ...(!isVSCode ? ['weekStart' as const] : []),
        'fontSize',
        'terminalFontSize',
        'editorFontSize',
        'fileEditorKeymap',
        'spacing',
        'inputBarOffset',
        'expandedEditorToolbar',
        ...(!isVSCode ? ['terminalQuickKeys' as const] : []),
    ]} />;
};

// Chat section: User message rendering, Diff layout, Mobile status bar, Show reasoning traces, Follow-up behavior, Persist draft
const ChatSectionContent: React.FC = () => {
    return <MageVisualSettings visibleSettings={['sessionGoal', 'sessionAssist', 'chatRenderMode', 'messageTransport', 'activityRenderMode', 'userMessageRendering', 'mermaidRendering', 'reasoning', 'showToolFileIcons', 'showTurnChangedFiles', 'expandedTools', 'collapsibleUserMessages', 'stickyUserHeader', 'wideChatLayout', 'codeBlockLineWrap', 'splitAssistantMessageActions', 'diffLayout', 'dotfiles', 'fileViewerPreview', 'followUpBehavior', 'persistDraft', 'inputSpellcheck']} />;
};

// Sessions section: Default model & agent, Session retention
const SessionsSectionContent: React.FC = () => {
    const isVSCode = isVSCodeRuntime();
    const runtimeEndpointEpoch = useRuntimeEndpointEpoch();
    void runtimeEndpointEpoch;
    const showDesktopNetworkSettings = isDesktopShell() && isDesktopLocalOriginActive();
    return (
        <div className="space-y-6">
            <DefaultsSettings />
            {showDesktopNetworkSettings && (
                <div className="border-t border-border/40 pt-6">
                    <DesktopNetworkSettings />
                </div>
            )}
            <div className="border-t border-border/40 pt-6">
                <SessionRetentionSettings />
            </div>
            <div className="border-t border-border/40 pt-6">
                <PasskeySettings />
            </div>
        </div>
    );
};

// Git section: Commit message model, Worktree settings
const GitSectionContent: React.FC = () => {
    return (
        <div className="space-y-6">
            <GitSettings />
        </div>
    );
};

// GitLab section: Connect account for PR/issue workflows
const GitLabSectionContent: React.FC = () => {
    if (isVSCodeRuntime()) {
        return null;
    }
    return <GitLabSettings />;
};

// Notifications section: Native browser notifications
const NotificationSectionContent: React.FC = () => {
    return <NotificationSettings />;
};

const TunnelSectionContent: React.FC = () => {
    if (isVSCodeRuntime()) {
        return null;
    }
    return <TunnelSettings />;
};
