-- Create app_role enum for role-based access control
CREATE TYPE public.app_role AS ENUM (
  'student',
  'class_incharge',
  'coordinator',
  'hod',
  'principal',
  'security'
);

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role app_role NOT NULL,
  department TEXT,
  branch TEXT,
  year TEXT,
  section TEXT,
  reg_no TEXT,
  employee_id TEXT,
  security_id TEXT,
  photo_url TEXT,
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_roles table for RBAC
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create outpass_requests table
CREATE TABLE public.outpass_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  purpose TEXT NOT NULL,
  from_date TIMESTAMP WITH TIME ZONE NOT NULL,
  to_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  visible_to_roles app_role[] DEFAULT ARRAY['class_incharge']::app_role[],
  qr_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES profiles(id),
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT
);

-- Create approvals history table
CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES outpass_requests(id) ON DELETE CASCADE NOT NULL,
  approver_id UUID REFERENCES profiles(id) NOT NULL,
  action TEXT NOT NULL, -- approved, rejected
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  request_id UUID REFERENCES outpass_requests(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- request_approved, request_rejected, new_request, request_forwarded
  message TEXT NOT NULL,
  payload JSONB,
  seen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create security_logs table for exit/entry tracking
CREATE TABLE public.security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES outpass_requests(id) ON DELETE CASCADE NOT NULL,
  security_id UUID REFERENCES profiles(id) NOT NULL,
  action TEXT NOT NULL, -- exit, entry
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outpass_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user role from profiles
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Faculty can view students in their department"
  ON public.profiles FOR SELECT
  USING (
    department IN (
      SELECT department FROM public.profiles WHERE id = auth.uid()
    )
  );

-- User roles RLS policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Outpass requests RLS policies
CREATE POLICY "Students can view their own requests"
  ON public.outpass_requests FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can create requests"
  ON public.outpass_requests FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Faculty can view requests visible to their role"
  ON public.outpass_requests FOR SELECT
  USING (
    public.get_user_role(auth.uid()) = ANY(visible_to_roles)
  );

CREATE POLICY "Faculty can update requests visible to their role"
  ON public.outpass_requests FOR UPDATE
  USING (
    public.get_user_role(auth.uid()) = ANY(visible_to_roles)
  );

CREATE POLICY "Security can view approved requests"
  ON public.outpass_requests FOR SELECT
  USING (
    public.has_role(auth.uid(), 'security') AND status = 'approved'
  );

-- Notifications RLS policies
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Approvals RLS policies
CREATE POLICY "Users can view approvals for their requests"
  ON public.approvals FOR SELECT
  USING (
    auth.uid() IN (
      SELECT student_id FROM public.outpass_requests WHERE id = request_id
    )
  );

CREATE POLICY "Approvers can view their own approvals"
  ON public.approvals FOR SELECT
  USING (auth.uid() = approver_id);

-- Security logs RLS policies
CREATE POLICY "Security can view all logs"
  ON public.security_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'security'));

CREATE POLICY "Security can insert logs"
  ON public.security_logs FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'security'));

-- Create trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_requests_updated_at
  BEFORE UPDATE ON public.outpass_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to sync user role to user_roles table when profile is created
CREATE OR REPLACE FUNCTION public.sync_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, NEW.role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_profile_role
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_role();

-- Create indexes for better performance
CREATE INDEX idx_outpass_requests_student ON public.outpass_requests(student_id);
CREATE INDEX idx_outpass_requests_status ON public.outpass_requests(status);
CREATE INDEX idx_outpass_requests_created ON public.outpass_requests(created_at);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, seen);
CREATE INDEX idx_approvals_request ON public.approvals(request_id);