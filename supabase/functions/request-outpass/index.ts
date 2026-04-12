import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const BodySchema = z.object({
      purpose: z.string().trim().min(10).max(200),
      from_date: z.string().datetime(),
      to_date: z.string().datetime(),
    }).refine((d) => new Date(d.to_date) > new Date(d.from_date), { message: 'to_date must be after from_date' });

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: parsed.error.issues.map(i => ({ path: i.path, message: i.message })) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { purpose, from_date, to_date } = parsed.data;

    console.log('Creating outpass request for user:', user.id);

    // Check monthly limit (4 requests per student per month)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthStart = new Date(currentYear, currentMonth, 1).toISOString();
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

    const { count, error: countError } = await supabase
      .from('outpass_requests')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd);

    if (countError) {
      console.error('Error checking monthly limit:', countError);
      return new Response(JSON.stringify({ error: 'Unable to verify monthly limit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (count && count >= 4) {
      return new Response(
        JSON.stringify({ error: 'Monthly outpass limit exceeded. You can only submit 4 requests per month.' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestId = crypto.randomUUID();

    // Create the outpass request with a stable UUID used across student, faculty, and security flows
    const { data: request, error: insertError } = await supabase
      .from('outpass_requests')
      .insert({
        id: requestId,
        student_id: user.id,
        purpose,
        from_date,
        to_date,
        qr_code: requestId,
        status: 'pending',
        visible_to_roles: ['class_incharge'],
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating request:', insertError);
      return new Response(JSON.stringify({ error: 'Unable to create request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Request created successfully:', request.id);

    return new Response(JSON.stringify({ request }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Unable to create request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
