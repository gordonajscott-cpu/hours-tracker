-- Add category column to profiles for work/student/personal classification.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'work';
