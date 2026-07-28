import type { Session } from '@mybcabisnis/mage-sdk/v2';

export type SessionMetadataRecord = Record<string, unknown>;

type MageMetadata = {
  kind?: 'review';
  originalSessionID?: string;
  reviewSessionID?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const getSessionMetadata = (session: Session | null | undefined): SessionMetadataRecord => {
  const metadata = (session as (Session & { metadata?: unknown }) | null | undefined)?.metadata;
  return isRecord(metadata) ? metadata : {};
};

const getMageMetadata = (metadata: SessionMetadataRecord): MageMetadata => {
  const value = metadata.mage;
  return isRecord(value) ? value as MageMetadata : {};
};

export const getReviewSessionID = (session: Session | null | undefined): string | null => {
  const value = getMageMetadata(getSessionMetadata(session)).reviewSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const getOriginalSessionID = (session: Session | null | undefined): string | null => {
  const value = getMageMetadata(getSessionMetadata(session)).originalSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const isReviewSession = (session: Session | null | undefined): boolean =>
  getMageMetadata(getSessionMetadata(session)).kind === 'review' && Boolean(getOriginalSessionID(session));

export const withReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => {
  const current = getMageMetadata(metadata);
  return {
    ...metadata,
    mage: {
      ...current,
      reviewSessionID,
    },
  };
};

export const withReviewSessionMarker = (
  metadata: SessionMetadataRecord,
  originalSessionID: string,
): SessionMetadataRecord => {
  const current = getMageMetadata(metadata);
  return {
    ...metadata,
    mage: {
      ...current,
      kind: 'review' as const,
      originalSessionID,
    },
  };
};

export const withoutReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => {
  const current = getMageMetadata(metadata);
  if (current.reviewSessionID !== reviewSessionID) return metadata;

  const restMage = { ...current };
  delete restMage.reviewSessionID;
  const next: SessionMetadataRecord = { ...metadata };
  if (Object.keys(restMage).length > 0) {
    next.mage = restMage;
  } else {
    delete next.mage;
  }
  return next;
};
