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

  const { data: requesterProfile, error: requesterError } = await adminClient
    .from("profiles")
    .select("role,is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (requesterError || !(requesterProfile?.is_admin || requesterProfile?.role === "admin")) {
    return jsonError("Only admin can delete login accounts.", 403);
  }

  const body = await request.json() as { profileId?: string };
  if (!body.profileId) return jsonError("Missing profile id.");

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id,user_id,role,is_admin,member_id")
    .eq("id", body.profileId)
    .single();

  if (targetError || !targetProfile) return jsonError("Profile not found.", 404);
  if (targetProfile.user_id === authData.user.id) return jsonError("You cannot delete your own admin account.", 400);
  if (targetProfile.member_id) {
    const { data: updatedProfile, error: updateError } = await adminClient
      .from("profiles")
      .update({ is_admin: false, role: "member" })
      .eq("id", targetProfile.id)
      .select("*")
      .single();

    if (updateError) return jsonError(updateError.message, 500);
    return NextResponse.json({ ok: true, profile: updatedProfile });
  }

  const { error: profileDeleteError } = await adminClient
    .from("profiles")
    .delete()
    .eq("id", targetProfile.id);

  if (profileDeleteError) return jsonError(profileDeleteError.message, 500);

  if (targetProfile.user_id) {
    const { error: userDeleteError } = await adminClient.auth.admin.deleteUser(targetProfile.user_id);
    if (userDeleteError) return jsonError(userDeleteError.message, 500);
  }

  return NextResponse.json({ ok: true });
}
