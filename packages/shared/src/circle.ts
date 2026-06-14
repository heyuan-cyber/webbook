export const CIRCLE_SCHEMA_VERSION = 2;

export type CircleMemberRole = 'owner' | 'member';

export type CircleVisibility = 'private' | 'public';

/** open=无需审核直接加入；approval=需圈主同意 */
export type CircleJoinPolicy = 'open' | 'approval';

export interface CircleMember {
  userId: string;
  email: string;
  role: CircleMemberRole;
  /** 允许编辑圈子协作本（圈主始终可编辑） */
  collabEdit: boolean;
  joinedAt: string;
}

export interface CircleInvite {
  email: string;
  invitedBy: string;
  invitedAt: string;
}

export interface CircleJoinRequest {
  userId: string;
  email: string;
  requestedAt: string;
}

export interface Circle {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  visibility: CircleVisibility;
  joinPolicy: CircleJoinPolicy;
  ownerId: string;
  members: CircleMember[];
  pendingInvites: CircleInvite[];
  pendingJoinRequests: CircleJoinRequest[];
  createdAt: string;
  updatedAt: string;
}

export interface CircleSummary {
  id: string;
  name: string;
  ownerId: string;
  memberCount: number;
  visibility?: CircleVisibility;
  joinPolicy?: CircleJoinPolicy;
  description?: string;
  myRole?: CircleMemberRole;
  myCollabEdit?: boolean;
}

/** 发现页公开圈子卡片 */
export interface DiscoverableCircle {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  joinPolicy: CircleJoinPolicy;
  ownerId: string;
  ownerEmail: string;
  /** 当前用户：圈主 / 已是成员 / 申请中 / 可加入 */
  myStatus: 'owner' | 'member' | 'pending' | 'none';
}

export interface PublicFeedItem {
  ownerId: string;
  ownerEmail: string;
  noteId: string;
  title: string;
  updatedAt?: string;
  summary?: string;
  /** 圈子博客流中区分公开与圈内文 */
  visibility?: 'public' | 'circle';
}

export interface BloggerSummary {
  userId: string;
  email: string;
  postCount: number;
}
