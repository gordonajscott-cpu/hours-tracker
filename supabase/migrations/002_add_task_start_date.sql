-- Add start_date column to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date DATE;
