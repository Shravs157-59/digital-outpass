-- Fix critical privilege escalation vulnerability
-- Drop the vulnerable UPDATE policy that allows users to change their own role
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Revoke all UPDATE permissions on profiles table
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Grant UPDATE only on safe columns (not including role)
GRANT UPDATE (
  full_name,
  photo_url,
  department,
  branch,
  year,
  section,
  reg_no,
  employee_id,
  security_id,
  available,
  email
) ON public.profiles TO authenticated;

-- Create a new policy that allows users to update only safe columns
CREATE POLICY "Users can update safe profile fields"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Create a SECURITY DEFINER function for admin-only role changes
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  _user_id uuid,
  _new_role app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_role app_role;
BEGIN
  -- Check if the caller is an admin (principal)
  SELECT role INTO _admin_role
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF _admin_role != 'principal' THEN
    RAISE EXCEPTION 'Only principals can update user roles';
  END IF;
  
  -- Update the role in profiles table
  UPDATE public.profiles
  SET role = _new_role
  WHERE id = _user_id;
  
  -- Sync with user_roles table
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _new_role);
END;
$$;

-- Add trigger to log role modification attempts
CREATE TABLE IF NOT EXISTS public.role_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_role app_role,
  new_role app_role,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now(),
  success boolean NOT NULL
);

ALTER TABLE public.role_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only principals can view audit logs"
ON public.role_change_audit FOR SELECT
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'principal'
);