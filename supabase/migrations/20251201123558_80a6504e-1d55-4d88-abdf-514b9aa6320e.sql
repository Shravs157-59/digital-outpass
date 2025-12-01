-- Update admin_update_user_role function to include audit logging
CREATE OR REPLACE FUNCTION public.admin_update_user_role(_user_id uuid, _new_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _admin_role app_role;
  _old_role app_role;
BEGIN
  -- Check if the caller is an admin (principal)
  SELECT role INTO _admin_role
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF _admin_role != 'principal' THEN
    -- Log failed attempt
    INSERT INTO public.role_change_audit (user_id, old_role, new_role, changed_by, success)
    VALUES (_user_id, NULL, _new_role, auth.uid(), false);
    
    RAISE EXCEPTION 'Only principals can update user roles';
  END IF;
  
  -- Get the old role before updating
  SELECT role INTO _old_role
  FROM public.profiles
  WHERE id = _user_id;
  
  -- Update the role in profiles table
  UPDATE public.profiles
  SET role = _new_role
  WHERE id = _user_id;
  
  -- Sync with user_roles table
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _new_role);
  
  -- Log successful role change
  INSERT INTO public.role_change_audit (user_id, old_role, new_role, changed_by, success)
  VALUES (_user_id, _old_role, _new_role, auth.uid(), true);
  
EXCEPTION WHEN OTHERS THEN
  -- Log failed attempt with error
  INSERT INTO public.role_change_audit (user_id, old_role, new_role, changed_by, success)
  VALUES (_user_id, _old_role, _new_role, auth.uid(), false);
  
  RAISE;
END;
$function$;