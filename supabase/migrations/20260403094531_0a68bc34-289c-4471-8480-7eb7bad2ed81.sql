
-- Allow faculty to view profiles of students who have outpass requests visible to their role
CREATE POLICY "Faculty can view students with visible outpass requests"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT DISTINCT student_id 
    FROM public.outpass_requests 
    WHERE get_user_role(auth.uid()) = ANY(visible_to_roles)
  )
);
