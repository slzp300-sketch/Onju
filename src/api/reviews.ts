import { supabase } from '../lib/supabase';
import type { WeeklyReview, GroupWeeklyShare } from '../types';
import { reviewFromRow, shareFromRow } from '../data/mappers';
import type { ReviewStep, ReviewStepResult } from '../lib/reviewSubmission';

export const fetchReviews = async (userId: string, signal?: AbortSignal): Promise<WeeklyReview[]> => {
  let query = supabase
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(reviewFromRow);
};

export const fetchReviewByWeek = async (
  weekNumber: number,
  year: number,
  userId: string,
  signal?: AbortSignal,
): Promise<WeeklyReview | null> => {
  let query = supabase
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('week_number', weekNumber)
    .eq('year', year);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? reviewFromRow(data) : null;
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

/** Keep the raw row as the comparison baseline; never fetch a new baseline on retry. */
export async function readReviewBase(week: number, year: number, owner: string, client = supabase): Promise<Record<string, unknown> | null> {
  const {data,error}=await client.from('weekly_reviews').select('*').eq('user_id',owner).eq('week_number',week).eq('year',year).maybeSingle();
  if(error) throw error;
  return data;
}
export async function sendReviewStep(step: ReviewStep, client = supabase): Promise<ReviewStepResult> {
  const {data,error}=await client.rpc('apply_weekly_review_step',{request_id:step.id,step_kind:step.kind,step_payload:step.payload});
  if(error) throw new Error(error.message);
  return data;
}
