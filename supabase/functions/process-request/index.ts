import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const MONTHLY_APPROVAL_LIMIT = 5;

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

    // Get the request details with student info
    const { data: request, error: fetchError } = await supabase
      .from('outpass_requests')
      .select(`
        *,
        student:profiles!outpass_requests_student_id_fkey(
          full_name,
          reg_no,
          department,
          branch,
          year,
          section
        )
      `)
      .eq('id', request_id)
      .single();

    if (fetchError || !request) {
      console.error('Error fetching request:', fetchError);
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's role
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
    const userRole = userRoles.find((r: string) => facultyRoles.includes(r));

    if (!userRole) {
      return new Response(JSON.stringify({ error: 'Forbidden: Faculty access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User role:', userRole);
    console.log('Current approval level:', request.current_approval_level);

    // Check if already processed
    if (request.status === 'approved' || request.status === 'rejected') {
      console.log('Request already processed:', request.status);
      return new Response(
        JSON.stringify({ 
          error: 'Request has already been processed',
          current_status: request.status 
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: Check if user's role matches current approval level
    const canProcess = request.current_approval_level === userRole || 
                       userRoles.includes(request.current_approval_level);
    
    if (!canProcess) {
      console.log('User not authorized to process at this level');
      return new Response(
        JSON.stringify({ 
          error: 'Not authorized to process this request at current approval level',
          current_level: request.current_approval_level,
          your_role: userRole
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    const currentMonthYear = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    // Handle APPROVAL
    if (action === 'approved') {
      // Check monthly approval count for this faculty member (only for class_incharge and hod)
      let currentCount = 0;
      let hasExceededLimit = false;

      if (userRole === 'class_incharge' || userRole === 'hod') {
        const { data: approvalCount, error: countError } = await supabase
          .from('faculty_monthly_approvals')
          .select('approval_count')
          .eq('faculty_id', user.id)
          .eq('role', userRole)
          .eq('month_year', currentMonthYear)
          .maybeSingle();

        if (countError) {
          console.error('Error fetching approval count:', countError);
        }

        currentCount = approvalCount?.approval_count || 0;
        hasExceededLimit = currentCount >= MONTHLY_APPROVAL_LIMIT;
        console.log(`Faculty ${user.id} has ${currentCount} approvals this month (limit: ${MONTHLY_APPROVAL_LIMIT})`);
      }

      // Determine next approval level
      let nextLevel: string;
      let finalStatus = 'pending';
      let updateData: any = {
        updated_at: now,
      };

      if (hasExceededLimit) {
        console.log(`Faculty has exceeded limit, escalating to principal`);
        nextLevel = 'principal';
        updateData.current_approval_level = 'principal';
        updateData.visible_to_roles = ['principal'];
      } else {
        // Normal approval flow
        if (userRole === 'class_incharge') {
          nextLevel = 'hod';
          updateData.current_approval_level = 'hod';
          updateData.class_incharge_id = user.id;
          updateData.class_incharge_approved_at = now;
          updateData.visible_to_roles = ['hod'];
        } else if (userRole === 'hod') {
          nextLevel = 'principal';
          updateData.current_approval_level = 'principal';
          updateData.hod_id = user.id;
          updateData.hod_approved_at = now;
          updateData.visible_to_roles = ['principal'];
        } else if (userRole === 'principal') {
          // Final approval by principal
          finalStatus = 'approved';
          updateData.status = 'approved';
          updateData.current_approval_level = 'approved';
          updateData.principal_id = user.id;
          updateData.principal_approved_at = now;
          updateData.approved_by = user.id;
          updateData.approved_at = now;
          updateData.visible_to_roles = [];
          nextLevel = 'approved';
        } else {
          return new Response(
            JSON.stringify({ error: 'Invalid role for approval' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Update the request
      const { error: updateError } = await supabase
        .from('outpass_requests')
        .update(updateData)
        .eq('id', request_id);

      if (updateError) {
        console.error('Failed to update request:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update request status' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update or create approval count (only for class_incharge and hod)
      if (userRole === 'class_incharge' || userRole === 'hod') {
        const { error: countUpdateError } = await supabase
          .from('faculty_monthly_approvals')
          .upsert({
            faculty_id: user.id,
            month_year: currentMonthYear,
            role: userRole,
            approval_count: currentCount + 1,
            updated_at: now,
          }, {
            onConflict: 'faculty_id,month_year,role'
          });

        if (countUpdateError) {
          console.error('Failed to update approval count:', countUpdateError);
        }
      }

      // Record the approval in the approvals table
      const { error: approvalError } = await supabase
        .from('approvals')
        .insert({
          request_id: request_id,
          approver_id: user.id,
          action: 'approved',
          comments: comments || (hasExceededLimit ? 'Auto-escalated due to monthly limit' : null),
        });

      if (approvalError) {
        console.error('Failed to record approval:', approvalError);
      }

      // Send notification to student
      const notificationMessage = finalStatus === 'approved' 
        ? `Your outpass request has been fully approved and is ready for use`
        : hasExceededLimit
        ? `Your outpass request has been escalated to ${nextLevel} (faculty approval limit reached)`
        : `Your outpass request has been approved by ${userRole} and sent to ${nextLevel}`;

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: request.student_id,
          request_id: request_id,
          type: finalStatus === 'approved' ? 'student_accept' : 'status_update',
          message: notificationMessage,
          payload: {
            action: 'approved',
            approver_role: userRole,
            next_level: nextLevel,
            comments: comments,
            escalated: hasExceededLimit,
          },
        });

      if (notificationError) {
        console.error('Failed to send notification:', notificationError);
      }

      // If final approval, notify security personnel
      if (finalStatus === 'approved') {
        const { data: securityUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'security');

        if (securityUsers && securityUsers.length > 0) {
          const securityNotifications = securityUsers.map((sec) => ({
            user_id: sec.id,
            request_id: request_id,
            type: 'forward_to_security',
            message: `New approved outpass for ${request.student?.full_name || 'student'}`,
            payload: {
              student_id: request.student_id,
              student_name: request.student?.full_name,
              reg_no: request.student?.reg_no,
              purpose: request.purpose,
            },
          }));

          await supabase.from('notifications').insert(securityNotifications);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: finalStatus === 'approved' 
            ? 'Request fully approved' 
            : `Request approved and forwarded to ${nextLevel}`,
          status: finalStatus,
          next_level: nextLevel,
          escalated: hasExceededLimit,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Handle REJECTION
    else if (action === 'rejected') {
      let updateData: any = {
        status: 'rejected',
        rejected_by: user.id,
        rejected_at: now,
        rejection_reason: comments || 'No reason provided',
        updated_at: now,
        visible_to_roles: [],
      };

      // Track which level rejected
      if (userRole === 'class_incharge') {
        updateData.class_incharge_id = user.id;
      } else if (userRole === 'hod') {
        updateData.hod_id = user.id;
      } else if (userRole === 'principal') {
        updateData.principal_id = user.id;
      }

      const { error: updateError } = await supabase
        .from('outpass_requests')
        .update(updateData)
        .eq('id', request_id);

      if (updateError) {
        console.error('Failed to update request:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update request status' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Record the rejection in the approvals table
      const { error: approvalError } = await supabase
        .from('approvals')
        .insert({
          request_id: request_id,
          approver_id: user.id,
          action: 'rejected',
          comments: comments,
        });

      if (approvalError) {
        console.error('Failed to record rejection:', approvalError);
      }

      // Send notification to student
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: request.student_id,
          request_id: request_id,
          type: 'student_reject',
          message: `Your outpass request has been rejected by ${userRole}`,
          payload: {
            action: 'rejected',
            approver_role: userRole,
            reason: comments || 'No reason provided',
            student_name: request.student?.full_name,
          },
        });

      if (notificationError) {
        console.error('Failed to send notification:', notificationError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Request rejected successfully',
          status: 'rejected',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});