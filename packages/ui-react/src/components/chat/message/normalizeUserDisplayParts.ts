import type { Part } from '@mybcabisnis/mage-sdk/v2';

const GITHUB_ISSUE_CONTEXT_PREFIX = 'GitLab issue context (JSON)';
const GITLAB_MR_CONTEXT_PREFIX = 'GitLab merge request context (JSON)';

type GitLabIssueContextPayload = {
    issue?: {
        number?: unknown;
        title?: unknown;
        url?: unknown;
    };
};

type GitLabMrContextPayload = {
    pr?: {
        number?: unknown;
        title?: unknown;
        url?: unknown;
    };
};

const isPositiveNumber = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

const parseSyntheticJsonPayload = <T>(text: string, prefix: string): T | null => {
    const normalizedText = text.trimStart();
    if (!normalizedText.startsWith(prefix)) {
        return null;
    }

    const jsonStart = normalizedText.indexOf('{');
    if (jsonStart < 0) {
        return null;
    }

    try {
        return JSON.parse(normalizedText.slice(jsonStart)) as T;
    } catch {
        return null;
    }
};

const buildGitLabAttachmentPart = (text: string): Part | null => {
    const issuePayload = parseSyntheticJsonPayload<GitLabIssueContextPayload>(text, GITHUB_ISSUE_CONTEXT_PREFIX);
    if (issuePayload) {
        const issue = issuePayload.issue;
        const number = issue?.number;
        const title = issue?.title;
        const url = issue?.url;
        if (!isPositiveNumber(number) || typeof title !== 'string' || typeof url !== 'string') {
            return null;
        }

        return {
            type: 'file',
            mime: 'application/vnd.gitlab.issue-link',
            filename: `Issue #${number}: ${title}`,
            url,
        } as Part;
    }

    const mrPayload = parseSyntheticJsonPayload<GitLabMrContextPayload>(text, GITLAB_MR_CONTEXT_PREFIX);
    if (mrPayload) {
        const pr = mrPayload.pr;
        const number = pr?.number;
        const title = pr?.title;
        const url = pr?.url;
        if (!isPositiveNumber(number) || typeof title !== 'string' || typeof url !== 'string') {
            return null;
        }

        return {
            type: 'file',
            mime: 'application/vnd.gitlab.pull-request-link',
            filename: `MR #${number}: ${title}`,
            url,
        } as Part;
    }

    return null;
};

const shouldKeepSyntheticUserText = (text: string, planModeEnabled: boolean): boolean => {
    const trimmed = text.trim();
    if (planModeEnabled && trimmed.startsWith('User has requested to enter plan mode')) return true;
    if (planModeEnabled && trimmed.startsWith('The plan at ')) return true;
    if (trimmed.startsWith('The following tool was executed by the user')) return true;
    return false;
};

export const normalizeUserDisplayParts = (parts: Part[], options?: { planModeEnabled?: boolean }): Part[] => {
    const planModeEnabled = options?.planModeEnabled === true;
    return parts
        .filter((part) => {
            const synthetic = (part as { synthetic?: boolean }).synthetic === true;
            if (!synthetic) return true;
            if (part.type !== 'text') return false;
            const text = (part as { text?: unknown }).text;
            if (typeof text !== 'string') {
                return false;
            }

            const normalizedText = text.trimStart();
            return shouldKeepSyntheticUserText(text, planModeEnabled)
                || normalizedText.startsWith(GITHUB_ISSUE_CONTEXT_PREFIX)
                || normalizedText.startsWith(GITLAB_MR_CONTEXT_PREFIX);
        })
        .map((part) => {
            const rawPart = part as Record<string, unknown>;
            if (rawPart.type === 'compaction') {
                return { type: 'text', text: '/compact' } as Part;
            }
            if (rawPart.type === 'text') {
                const text = typeof rawPart.text === 'string' ? rawPart.text.trim() : '';
                const synthetic = rawPart.synthetic === true;

                if (synthetic) {
                    const attachmentPart = buildGitLabAttachmentPart(text);
                    if (attachmentPart) {
                        return attachmentPart;
                    }
                }

                if (text.startsWith('The following tool was executed by the user')) {
                    return { type: 'text', text: '/shell' } as Part;
                }
            }
            return part;
        });
};
