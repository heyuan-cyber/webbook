export const CIRCLE_SCHEMA_VERSION = 1;

export type CircleShareStatus = 'none' | 'public_feed';

export type CircleMemberRole = 'owner' | 'member';

export interface CircleMember {
  userId: string;
  email: string;
  role: CircleMemberRole;
  shareStatus: CircleShareStatus;
  joinedAt: string;
}

export interface CircleInvite {
  email: string;
  invitedBy: string;
  invitedAt: string;
}

export interface Circle {
  schemaVersion: number;
  id: string;
  name: string;
  ownerId: string;
  members: CircleMember[];
  pendingInvites: CircleInvite[];
  createdAt: string;
  updatedAt: string;
}

export interface CircleSummary {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  myRole?: CircleMemberRole;
  myShareStatus?: CircleShareStatus;
}

export interface PublicFeedItem {
  ownerId: string;
  ownerEmail: string;
  noteId: string;
  title: string;
  updatedAt?: string;
  summary?: string;
}

export interface BloggerSummary {
  userId: string;
  email: string;
  postCount: number;
}
