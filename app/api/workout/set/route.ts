import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError("Server is missing SUPABASE_SERVICE_ROLE_KEY.", 500);
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return jsonError("Missing login session.", 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) return jsonError("Invalid login session.", 401);

  const body = await request.json() as {
    memberId?: string;
    sessionId?: string;
    metricId?: string;
    value?: number;
    remark?: string;
  };

  if (!body.memberId) return jsonError("Missing member id.");
  if (!body.sessionId) return jsonError("Missing session id.");
  if (!body.metricId) return jsonError("Missing workout item id.");
  if (body.value === undefined || Number.isNaN(Number(body.value))) return jsonError("Workout value is invalid.");

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role,is_admin,member_id,display_name")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile) return jsonError("Login profile not found.", 404);

  const isAdmin = Boolean(profile.is_admin || profile.role === "admin");
  let allowedMemberId = profile.member_id as string | undefined;

  if (!allowedMemberId && profile.display_name) {
    const { data: matchedMember } = await adminClient
      .from("members")
      .select("id")
      .ilike("name", profile.display_name)
      .maybeSingle();
    allowedMemberId = matchedMember?.id;
  }

  if (!isAdmin && allowedMemberId !== body.memberId) {
    return jsonError("You can only update your own workout.", 403);
  }

  const { data: record, error: workoutError } = await adminClient
    .from("workout_records")
    .upsert({
      member_id: body.memberId,
      session_id: body.sessionId,
      metric_id: body.metricId,
      value: Number(body.value),
      remark: body.remark ?? ""
    }, { onConflict: "member_id,session_id,metric_id" })
    .select("*")
    .single();

  if (workoutError) return jsonError(workoutError.message, 500);

  return NextResponse.json({ record });
}
