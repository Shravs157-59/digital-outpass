-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to escalate pending outpass requests based on time
CREATE OR REPLACE FUNCTION escalate_pending_outpasses()
RETURNS void AS $$
BEGIN
  -- Escalation Level 1: After 5 mins, add Coordinator
  UPDATE outpass_requests
  SET visible_to_roles = visible_to_roles || '{coordinator}'
  WHERE
    status = 'pending' AND
    created_at < now() - interval '5 minutes' AND
    NOT (visible_to_roles @> '{coordinator}');

  -- Escalation Level 2: After 10 mins, add HOD
  UPDATE outpass_requests
  SET visible_to_roles = visible_to_roles || '{hod}'
  WHERE
    status = 'pending' AND
    created_at < now() - interval '10 minutes' AND
    NOT (visible_to_roles @> '{hod}');

  -- Final Escalation: After 20 mins, add Principal
  UPDATE outpass_requests
  SET visible_to_roles = visible_to_roles || '{principal}'
  WHERE
    status = 'pending' AND
    created_at < now() - interval '20 minutes' AND
    NOT (visible_to_roles @> '{principal}');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule the escalation function to run every minute
SELECT cron.schedule(
  'escalate-outpasses-every-minute',
  '* * * * *',
  'SELECT escalate_pending_outpasses()'
);