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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get the authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate input
    const BodySchema = z.object({
      request_id: z.string().uuid(),
      action: z.enum(['approved', 'rejected']),
      comments: z.string().max(500).optional(),
    });

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: parsed.error.issues.map(i => ({ path: i.path, message: i.message })) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { request_id, action, comments } = parsed.data;

    console.log(`Processing request ${request_id} with action ${action} by user ${user.id}`);

    // Get the request details
    const { data: request, error: fetchError } = await supabase
      .from('outpass_requests')
      .select('*, profiles!outpass_requests_student_id_fkey(*)')
      .eq('id', request_id)
      .single();

    if (fetchError || !request) {
      console.error('Error fetching request:', fetchError);
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (request.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Request is already ${request.status}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Authorization: user must have a faculty role and their role must be in visible_to_roles
    const facultyRoles = ['class_incharge', 'coordinator', 'hod', 'principal'];
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Error fetching user roles:', rolesError);
      return new Response(JSON.stringify({ error: 'Unable to verify permissions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userRoles = (rolesData || []).map((r: any) => r.role);
    const isFaculty = userRoles.some((r: string) => facultyRoles.includes(r));

    if (!isFaculty) {
      return new Response(JSON.stringify({ error: 'Forbidden: Faculty access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const canAct = Array.isArray(request.visible_to_roles)
      ? request.visible_to_roles.some((r: string) => userRoles.includes(r))
      : false;

    if (!canAct) {
      return new Response(JSON.stringify({ error: 'Forbidden: Request not assigned to your role' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const isApproved = action.toLowerCase() === 'approved';

    // Update the request status
    const updateData: any = {
      status: action.toLowerCase(),
      updated_at: now,
    };

    if (isApproved) {
      updateData.approved_by = user.id;
      updateData.approved_at = now;
      updateData.visible_to_roles = []; // Hide from approval queues
    } else {
      updateData.rejected_by = user.id;
      updateData.rejected_at = now;
      updateData.rejection_reason = comments || null;
      updateData.visible_to_roles = []; // Hide from approval queues
    }

    const { error: updateError } = await supabase
      .from('outpass_requests')
      .update(updateData)
      .eq('id', request_id);

    if (updateError) {
      console.error('Error updating request:', updateError);
      return new Response(JSON.stringify({ error: 'Unable to update request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record the approval/rejection
    const { error: approvalError } = await supabase
      .from('approvals')
      .insert({
        request_id,
        approver_id: user.id,
        action: action.toLowerCase(),
        comments: comments || null,
      });

    if (approvalError) {
      console.error('Error recording approval:', approvalError);
    }

    // Notify the student
    const studentMessage = isApproved
      ? `Your outpass request has been approved!`
      : `Your outpass request has been rejected. ${comments ? `Reason: ${comments}` : ''}`;

    const { error: studentNotifError } = await supabase
      .from('notifications')
      .insert({
        user_id: request.student_id,
        request_id,
        type: isApproved ? 'student_accept' : 'student_reject',
        message: studentMessage,
        payload: { action, approver_id: user.id, comments },
      });

    if (studentNotifError) {
      console.error('Error creating student notification:', studentNotifError);
    }

    // If approved, notify security personnel
    if (isApproved) {
      const { data: securityUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'security');

      if (securityUsers && securityUsers.length > 0) {
        const securityNotifications = securityUsers.map((sec) => ({
          user_id: sec.id,
          request_id,
          type: 'forward_to_security',
          message: `New approved outpass for ${request.profiles?.full_name || 'student'}`,
          payload: {
            student_id: request.student_id,
            student_name: request.profiles?.full_name,
            reg_no: request.profiles?.reg_no,
            purpose: request.purpose,
            approved_by: user.id,
          },
        }));

        const { error: securityNotifError } = await supabase
          .from('notifications')
          .insert(securityNotifications);

        if (securityNotifError) {
          console.error('Error creating security notifications:', securityNotifError);
        }
      }
    }

    // If rejected, also notify security
    if (!isApproved) {
      const { data: securityUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'security');

      if (securityUsers && securityUsers.length > 0) {
        const securityNotifications = securityUsers.map((sec) => ({
          user_id: sec.id,
          request_id,
          type: 'forward_reject_to_security',
          message: `Outpass request rejected for ${request.profiles?.full_name || 'student'}`,
          payload: {
            student_id: request.student_id,
            student_name: request.profiles?.full_name,
            rejected_by: user.id,
            reason: comments,
          },
        }));

        const { error: securityNotifError } = await supabase
          .from('notifications')
          .insert(securityNotifications);

        if (securityNotifError) {
          console.error('Error creating security notifications:', securityNotifError);
        }
      }
    }

    console.log(`Request ${request_id} processed successfully`);

    return new Response(
      JSON.stringify({ success: true, message: `Request ${action} successfully` }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Unable to process request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
