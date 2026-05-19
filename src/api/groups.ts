import api from './index';
import type { SmallGroup, MemberGroupProgress } from '../types';

interface GroupsResponse {
  groups: SmallGroup[];
  total: number;
  hasNextPage: boolean;
  nextPage: number | null;
}

export const fetchGroups = (params: { status?: string; page?: number; limit?: number }) =>
  api.get<GroupsResponse>('/groups', { params }).then(r => r.data);

export const fetchGroupById = (id: string) =>
  api.get<{ group: SmallGroup }>(`/groups/${id}`).then(r => r.data.group);

export const createGroup = (data: Partial<SmallGroup>) =>
  api.post<SmallGroup>('/groups', data).then(r => r.data);

export const joinGroup = (id: string) =>
  api.post(`/groups/${id}/join`).then(r => r.data);

export const fetchGroupMembers = (id: string) =>
  api.get<{ members: MemberGroupProgress[] }>(`/groups/${id}/members`).then(r => r.data.members);
