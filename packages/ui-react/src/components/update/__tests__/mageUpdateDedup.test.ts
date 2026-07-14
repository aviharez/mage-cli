import { describe, test, expect } from 'bun:test';

import {
    resolveMageUpdateVersion,
    resolveMageUpgradeStatusVersion,
    shouldShowMageUpdateToast,
    shouldShowPwaInstallToast,
} from '../mageUpdateDedup';

describe('shouldShowPwaInstallToast', () => {
    test('returns true when nothing blocks the toast', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: null,
                sessionShown: null,
                hasActiveToast: false,
            }),
        ).toBe(true);
    });

    test('returns false when persistent dismissal is set', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: 'true',
                sessionShown: null,
                hasActiveToast: false,
            }),
        ).toBe(false);
    });

    test('returns false when the toast was already shown in this session', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: null,
                sessionShown: 'true',
                hasActiveToast: false,
            }),
        ).toBe(false);
    });

    test('returns false when the effect already owns an active toast', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: null,
                sessionShown: null,
                hasActiveToast: true,
            }),
        ).toBe(false);
    });

    test('treats non-"true" storage values as unset', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: 'false',
                sessionShown: '0',
                hasActiveToast: false,
            }),
        ).toBe(true);
    });

    test('persistent dismissal wins even when session marker is also set', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: 'true',
                sessionShown: 'true',
                hasActiveToast: false,
            }),
        ).toBe(false);
    });
});

describe('shouldShowMageUpdateToast', () => {
    test('returns true for a fresh version with no dismissal and an empty seen set', () => {
        expect(
            shouldShowMageUpdateToast({
                version: '1.16.0',
                dismissedVersion: null,
                seenVersions: new Set(),
            }),
        ).toBe(true);
    });

    test('returns false for an empty version string', () => {
        expect(
            shouldShowMageUpdateToast({
                version: '',
                dismissedVersion: null,
                seenVersions: new Set(),
            }),
        ).toBe(false);
    });

    test('returns false when the version was already surfaced in this session', () => {
        expect(
            shouldShowMageUpdateToast({
                version: '1.16.0',
                dismissedVersion: null,
                seenVersions: new Set(['1.16.0']),
            }),
        ).toBe(false);
    });

    test('returns false when the dismissed version matches the incoming version', () => {
        expect(
            shouldShowMageUpdateToast({
                version: '1.16.0',
                dismissedVersion: '1.16.0',
                seenVersions: new Set(),
            }),
        ).toBe(false);
    });

    test('returns true when a different version was previously dismissed', () => {
        expect(
            shouldShowMageUpdateToast({
                version: '1.17.0',
                dismissedVersion: '1.16.0',
                seenVersions: new Set(),
            }),
        ).toBe(true);
    });

    test('treats null dismissedVersion as no prior dismissal', () => {
        expect(
            shouldShowMageUpdateToast({
                version: '1.16.0',
                dismissedVersion: null,
                seenVersions: new Set(['1.15.0']),
            }),
        ).toBe(true);
    });

    test('seen set blocks even when dismissed version differs', () => {
        expect(
            shouldShowMageUpdateToast({
                version: '1.16.0',
                dismissedVersion: '1.15.0',
                seenVersions: new Set(['1.16.0']),
            }),
        ).toBe(false);
    });
});

describe('resolveMageUpdateVersion', () => {
    test('returns the trimmed version when detail.version is a string', () => {
        expect(resolveMageUpdateVersion({ version: '1.16.0' })).toBe('1.16.0');
    });

    test('trims surrounding whitespace from a string version', () => {
        expect(resolveMageUpdateVersion({ version: '  1.16.0  ' })).toBe('1.16.0');
    });

    test('returns empty string when detail is null', () => {
        expect(resolveMageUpdateVersion(null)).toBe('');
    });

    test('returns empty string when detail is undefined', () => {
        expect(resolveMageUpdateVersion(undefined)).toBe('');
    });

    test('returns empty string when detail is not an object', () => {
        expect(resolveMageUpdateVersion('1.16.0')).toBe('');
        expect(resolveMageUpdateVersion(42)).toBe('');
        expect(resolveMageUpdateVersion(true)).toBe('');
    });

    test('returns empty string when the version field is missing', () => {
        expect(resolveMageUpdateVersion({})).toBe('');
    });

    test('returns empty string when the version field is non-string', () => {
        expect(resolveMageUpdateVersion({ version: 116 })).toBe('');
        expect(resolveMageUpdateVersion({ version: null })).toBe('');
        expect(resolveMageUpdateVersion({ version: { major: 1 } })).toBe('');
    });
});

describe('resolveMageUpgradeStatusVersion', () => {
    test('returns the trimmed latestVersion when available is true', () => {
        expect(
            resolveMageUpgradeStatusVersion({
                available: true,
                latestVersion: '1.16.0',
            }),
        ).toBe('1.16.0');
    });

    test('trims surrounding whitespace from latestVersion', () => {
        expect(
            resolveMageUpgradeStatusVersion({
                available: true,
                latestVersion: '  1.16.0  ',
            }),
        ).toBe('1.16.0');
    });

    test('returns empty string when status is null', () => {
        expect(resolveMageUpgradeStatusVersion(null)).toBe('');
    });

    test('returns empty string when status is undefined', () => {
        expect(resolveMageUpgradeStatusVersion(undefined)).toBe('');
    });

    test('returns empty string when available is false', () => {
        expect(
            resolveMageUpgradeStatusVersion({
                available: false,
                latestVersion: '1.16.0',
            }),
        ).toBe('');
    });

    test('returns empty string when available is missing or null', () => {
        expect(
            resolveMageUpgradeStatusVersion({
                latestVersion: '1.16.0',
            }),
        ).toBe('');
        expect(
            resolveMageUpgradeStatusVersion({
                available: null,
                latestVersion: '1.16.0',
            }),
        ).toBe('');
    });

    test('returns empty string when latestVersion is missing', () => {
        expect(resolveMageUpgradeStatusVersion({ available: true })).toBe('');
    });

    test('returns empty string when latestVersion is non-string', () => {
        expect(
            resolveMageUpgradeStatusVersion({
                available: true,
                latestVersion: null,
            }),
        ).toBe('');
    });
});
