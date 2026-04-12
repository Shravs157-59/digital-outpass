import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  uuid: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: securityRole, error: roleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'security')
      .maybeSingle();

    if (roleError || !securityRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Validation failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { uuid } = parsed.data;

    const { data: request, error: requestError } = await supabase
      .from('outpass_requests')
      .select(`
        id,
        purpose,
        from_date,
        to_date,
        status,
        qr_code,
        student:profiles!outpass_requests_student_id_fkey (
          full_name,
          reg_no,
          year,
          department
        )
      `)
      .or(`id.eq.${uuid},qr_code.eq.${uuid}`)
      .limit(1)
      .maybeSingle();

    if (requestError || !request) {
      return new Response(JSON.stringify({
        valid: false,
        error: 'Invalid UUID - Outpass not found in system',
        details: 'The scanned UUID does not match any outpass request. Verify the UUID and try again.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (request.status !== 'approved') {
      return new Response(JSON.stringify({
        valid: false,
        status: request.status,
        error: `Outpass Status: ${request.status.toUpperCase()} - Cannot grant entry`,
        details: 'This outpass exists, but it is not approved yet for security verification.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const canonicalUuid = request.qr_code || request.id;
    if (uuid !== request.id && uuid !== canonicalUuid) {
      return new Response(JSON.stringify({
        valid: false,
        error: 'Outpass verification failed - UUID mismatch',
        details: 'The provided UUID does not match the approved outpass record.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: exitLog } = await supabase
      .from('security_logs')
      .select('verified_at')
      .eq('request_id', request.id)
      .eq('action', 'exit')
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let alreadyUsed = false;
    let usageType: 'entry' | 'exit' = 'exit';

    if (exitLog?.verified_at) {
      const { data: entryLog } = await supabase
        .from('security_logs')
        .select('id')
        .eq('request_id', request.id)
        .eq('action', 'entry')
        .gt('verified_at', exitLog.verified_at)
        .maybeSingle();

      if (!entryLog) {
        alreadyUsed = true;
        usageType = 'entry';
      }
    }

    return new Response(JSON.stringify({
      valid: true,
      outpassId: request.id,
      studentName: request.student?.full_name,
      regNo: request.student?.reg_no,
      year: request.student?.year,
      department: request.student?.department,
      validFrom: request.from_date,
      validTo: request.to_date,
      reason: request.purpose,
      status: request.status,
      alreadyUsed,
      usageType,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Verification failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});