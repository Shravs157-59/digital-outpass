-- Fix signup failure: cast role to enum and ensure triggers exist
-- 1) Update handle_new_user() to cast role to app_role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')::public.app_role
  )
  ON CONFLICT (id) DO NOTHING;

  -- Ensure user_roles has the same role for policy checks
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')::public.app_role
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2) Create the trigger to run after new auth.users rows are inserted
DO $$
BEGIN
  -- Drop if exists to avoid duplicates
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
  ) THEN
    DROP TRIGGER on_auth_user_created ON auth.users;
  END IF;

  CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
END $$;

-- 3) Ensure profiles changes sync to user_roles for consistency
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'sync_user_role_trigger'
      AND n.nspname = 'public'
  ) THEN
    DROP TRIGGER sync_user_role_trigger ON public.profiles;
  END IF;

  CREATE TRIGGER sync_user_role_trigger
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_role();
END $$;