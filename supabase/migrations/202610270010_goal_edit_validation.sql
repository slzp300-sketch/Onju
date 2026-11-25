-- Local preparation only. Metadata edits do not change habits, logs, or link history.
-- NOT VALID leaves pre-existing invalid goals available for correction; new writes
-- must use supported calendar dates, ordered bounds, and a known category.
alter table public.monthly_goals add constraint monthly_goals_valid_period
  check (start_date >= date '0001-01-01' and end_date <= date '9999-12-31' and start_date <= end_date) not valid;
alter table public.monthly_goals add constraint monthly_goals_valid_category
  check (category is null or category in ('personal','faith')) not valid;
