import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { AttendanceStatus } from "@/lib/types";

const validStatuses: AttendanceStatus[] = ["present", "late", "absent", "excused"];

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
    status?: AttendanceStatus;
    reason?: string;
  };

  if (!body.memberId) return jsonError("Missing member id.");
  if (!body.sessionId) return jsonError("Missing session id.");
  if (!body.status || !validStatuses.includes(body.status)) return jsonError("Attendance status is invalid.");

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role,is_admin,member_id,display_name")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (profileError) return jsonError(profileError.message, 500);

  const fallbackDisplayName = String(
    authData.user.user_metadata?.display_name ??
    authData.user.email?.split("@")[0] ??
    ""
  ).trim();
  const displayName = profile?.display_name?.trim() || fallbackDisplayName;
  const isAdmin = Boolean(profile?.is_admin || profile?.role === "admin");
  let allowedMemberId = profile?.member_id as string | undefined;

  if (!allowedMemberId && displayName) {
    const { data: matchedMembers } = await adminClient
      .from("members")
      .select("id")
      .ilike("name", displayName)
      .limit(1);
    allowedMemberId = matchedMembers?.[0]?.id;
  }

  if (!profile && allowedMemberId) {
    await adminClient.from("profiles").upsert({
      user_id: authData.user.id,
      member_id: allowedMemberId,
      role: "member",
      is_admin: false,
      display_name: displayName,
      email: authData.user.email ?? "",
      require_password_reset: false
    }, { onConflict: "user_id" });
  }

  if (!isAdmin && allowedMemberId !== body.memberId) {
    return jsonError("You can only update your own attendance.", 403);
  }

  const { data: record, error: attendanceError } = await adminClient
    .from("attendance_records")
    .upsert({
      member_id: body.memberId,
      session_id: body.sessionId,
      status: body.status,
      reason: body.reason ?? ""
    }, { onConflict: "member_id,session_id" })
    .select("*")
    .single();

  if (attendanceError) return jsonError(attendanceError.message, 500);

  return NextResponse.json({ record });
}
