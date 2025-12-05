import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StudentData {
  email: string;
  reg_no: string;
  department: string;
  year: string;
  section: string;
  full_name?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify they're a principal
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    
    if (authError || !user) {
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is a principal
    const { data: profile, error: profileError } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile fetch error:", profileError);
      return new Response(
        JSON.stringify({ error: "Could not verify user role" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.role !== "principal") {
      console.error("Unauthorized role:", profile.role);
      return new Response(
        JSON.stringify({ error: "Only principals can perform bulk updates" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { students }: { students: StudentData[] } = await req.json();

    if (!students || !Array.isArray(students) || students.length === 0) {
      return new Response(
        JSON.stringify({ error: "No student data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (students.length > 500) {
      return new Response(
        JSON.stringify({ error: "Maximum 500 records per import" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing bulk update for ${students.length} students by principal ${user.id}`);

    // Use service role client for updates
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const student of students) {
      try {
        // Validate required fields
        if (!student.email || !student.reg_no || !student.department || !student.year || !student.section) {
          errors.push(`Missing required fields for ${student.email || "unknown"}`);
          failed++;
          continue;
        }

        // Find user by email
        const { data: existingProfile, error: findError } = await supabaseAdmin
          .from("profiles")
          .select("id, role")
          .eq("email", student.email.toLowerCase().trim())
          .maybeSingle();

        if (findError) {
          console.error(`Error finding profile for ${student.email}:`, findError);
          errors.push(`Error finding ${student.email}: ${findError.message}`);
          failed++;
          continue;
        }

        if (!existingProfile) {
          errors.push(`No profile found for email: ${student.email}`);
          failed++;
          continue;
        }

        // Only update student profiles
        if (existingProfile.role !== "student") {
          errors.push(`${student.email} is not a student (role: ${existingProfile.role})`);
          failed++;
          continue;
        }

        // Build update object
        const updateData: Record<string, string> = {
          reg_no: student.reg_no.trim(),
          department: student.department.trim(),
          branch: student.department.trim(),
          year: student.year.trim(),
          section: student.section.trim().toUpperCase(),
        };

        // Optionally update full_name if provided
        if (student.full_name && student.full_name.trim()) {
          updateData.full_name = student.full_name.trim();
        }

        // Update the profile
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update(updateData)
          .eq("id", existingProfile.id);

        if (updateError) {
          console.error(`Error updating ${student.email}:`, updateError);
          errors.push(`Failed to update ${student.email}: ${updateError.message}`);
          failed++;
          continue;
        }

        console.log(`Successfully updated profile for ${student.email}`);
        success++;
      } catch (err: any) {
        console.error(`Unexpected error for ${student.email}:`, err);
        errors.push(`Unexpected error for ${student.email}: ${err.message}`);
        failed++;
      }
    }

    console.log(`Bulk update completed: ${success} success, ${failed} failed`);

    return new Response(
      JSON.stringify({ success, failed, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Bulk update error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
