import { getISOWeek, getYear } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { WeeklyReview, GroupWeeklyShare } from '../types';
import { reviewToRow, reviewFromRow, shareFromRow } from '../data/mappers';
import { newId } from '../utils/id';

export const fetchReviews = async (): Promise<WeeklyReview[]> => {
  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(reviewFromRow);
};

export const fetchReviewByWeek = async (
  weekNumber: number,
  year: number,
): Promise<WeeklyReview | null> => {
  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('week_number', weekNumber)
    .eq('year', year)
    .maybeSingle();
  if (error) throw error;
  return data ? reviewFromRow(data) : null;
};

export const createReview = async (data: Partial<WeeklyReview>): Promise<WeeklyReview> => {
  const review: WeeklyReview = {
    id: newId(),
    userId: '',
    weekNumber: getISOWeek(new Date()),
    year: getYear(new Date()),
    personalRate: 0,
    faithRate: 0,
    goalAchievedCount: 0,
    goalTotalCount: 0,
    mood: null,
    goalRatings: {},
    comment: '',
    intention: '',
    shareToGroups: [],
    routineChanges: [],
    completedAt: null,
    createdAt: new Date().toISOString(),
    ...data,
  };
  // 같은 주에 다시 작성하면 덮어쓴다 (unique user_id+week_number+year)
  const { error } = await supabase
    .from('weekly_reviews')
    .upsert(reviewToRow(review), { onConflict: 'user_id,week_number,year' });
  if (error) throw error;
  return review;
};

export const completeReview = async (
  id: string,
  data: Partial<WeeklyReview>,
): Promise<WeeklyReview> => {
  const { data: existing, error: fetchError } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;
  const merged = { ...reviewFromRow(existing), ...data };
  const { error } = await supabase.from('weekly_reviews').update(reviewToRow(merged)).eq('id', id);
  if (error) throw error;
  return merged;
};

export const fetchWeeklyShares = async (
  groupId: string,
  weekNumber?: number,
): Promise<GroupWeeklyShare[]> => {
  let query = supabase
    .from('group_weekly_shares')
    .select('*, profiles(name)')
    .eq('group_id', groupId)
    .order('shared_at', { ascending: false });
  if (weekNumber !== undefined) query = query.eq('week_number', weekNumber);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(shareFromRow);
};

export const createWeeklyShare = async (
  groupId: string,
  data: Partial<GroupWeeklyShare>,
): Promise<GroupWeeklyShare> => {
  const share = {
    id: newId(),
    group_id: groupId,
    week_number: data.weekNumber ?? getISOWeek(new Date()),
    year: data.year ?? getYear(new Date()),
    personal_rate: data.personalRate ?? 0,
    faith_rate: data.faithRate ?? 0,
    comment: data.comment ?? '',
    intention: data.intention ?? '',
  };
  const { data: inserted, error } = await supabase
    .from('group_weekly_shares')
    .insert(share)
    .select('*, profiles(name)')
    .single();
  if (error) throw error;
  return shareFromRow(inserted);
};
