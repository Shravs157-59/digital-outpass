-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Faculty can view students in their department" ON public.profiles;

-- Create a security definer function to get user's department
CREATE OR REPLACE FUNCTION public.get_user_department(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- Recreate the policy using the security definer function
CREATE POLICY "Faculty can view students in their department" 
ON public.profiles 
FOR SELECT 
USING (
  department IN (
    SELECT public.get_user_department(auth.uid())
  )
);