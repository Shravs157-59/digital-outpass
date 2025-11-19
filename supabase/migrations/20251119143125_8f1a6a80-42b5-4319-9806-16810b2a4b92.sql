-- Add approval tracking columns to outpass_requests
ALTER TABLE public.outpass_requests 
ADD COLUMN IF NOT EXISTS current_approval_level text DEFAULT 'class_incharge',
ADD COLUMN IF NOT EXISTS class_incharge_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS class_incharge_approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS hod_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS hod_approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS principal_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS principal_approved_at timestamp with time zone;

-- Create table to track monthly approval counts
CREATE TABLE IF NOT EXISTS public.faculty_monthly_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_year text NOT NULL, -- Format: 'YYYY-MM'
  approval_count integer NOT NULL DEFAULT 0,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(faculty_id, month_year, role)
);

-- Enable RLS on faculty_monthly_approvals
ALTER TABLE public.faculty_monthly_approvals ENABLE ROW LEVEL SECURITY;

-- Faculty can view their own approval counts
CREATE POLICY "Faculty can view their own approval counts"
ON public.faculty_monthly_approvals
FOR SELECT
USING (auth.uid() = faculty_id);

-- System can insert/update approval counts (via edge functions with service role)
-- No direct insert/update policies needed as edge functions will handle this

-- Create function to check if faculty has reached monthly limit
CREATE OR REPLACE FUNCTION public.get_monthly_approval_count(
  _faculty_id uuid,
  _role app_role
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT approval_count 
     FROM public.faculty_monthly_approvals 
     WHERE faculty_id = _faculty_id 
       AND role = _role 
       AND month_year = TO_CHAR(NOW(), 'YYYY-MM')
    ),
    0
  );
$$;

-- Update trigger for faculty_monthly_approvals
CREATE TRIGGER update_faculty_monthly_approvals_updated_at
BEFORE UPDATE ON public.faculty_monthly_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment to explain the workflow
COMMENT ON COLUMN public.outpass_requests.current_approval_level IS 
'Tracks current approval stage: class_incharge -> hod -> principal. Changes to "approved" when final approval is given.';