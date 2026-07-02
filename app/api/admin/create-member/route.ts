import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreateMemberBody = {
  name?: string;
  email?: string;
  defaultPassword?: string;
  memberRole?: string;
  groupName?: string;
  accountRole?: "admin" | "member";
  existingProfileId?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function schemaError(message: string) {
  if (message.includes("profiles.email") || message.includes("email does not exist")) {
    return "Database is missing profiles.email. Run the latest supabase/schema.sql in Supabase SQL Editor.";
  }
  return message;
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
    return jsonError("Only admin can create member login accounts.", 403);
  }

  const body = (await request.json()) as CreateMemberBody;
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const defaultPassword = body.defaultPassword ?? "";
  const memberRole = body.memberRole?.trim() || "Drummer";
  const groupName = body.groupName?.trim() || "General";
  const accountRole = body.accountRole ?? "member";
  const existingProfileId = body.existingProfileId;

  let existingBaseProfile: { id: string; user_id: string; email?: string; display_name?: string; member_id?: string; is_admin?: boolean; role?: string } | null = null;

  if (existingProfileId) {
    const { data: foundProfile, error: foundProfileError } = await adminClient
      .from("profiles")
      .select("id,user_id,email,display_name,member_id,is_admin,role")
      .eq("id", existingProfileId)
      .single();

    if (foundProfileError || !foundProfile?.user_id) return jsonError("Existing login profile not found.", 404);
    existingBaseProfile = foundProfile;
  }

  const effectiveName = name || existingBaseProfile?.display_name?.trim();
  const effectiveEmail = email || existingBaseProfile?.email?.trim().toLowerCase();

  if (!effectiveName) return jsonError(`${accountRole === "admin" ? "Admin" : "Member"} name is required.`);
  if (!effectiveEmail) return jsonError(`${accountRole === "admin" ? "Admin" : "Member"} email is required.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveEmail)) return jsonError("Email is invalid.");
  if (!existingProfileId && defaultPassword.length < 6) return jsonError("Default password must be at least 6 characters.");

  if (existingProfileId && accountRole === "admin" && (existingBaseProfile?.is_admin || existingBaseProfile?.role === "admin")) {
    return jsonError("This user already has an admin account.", 409);
  }
  if (existingProfileId && accountRole === "member" && existingBaseProfile?.member_id) {
    return jsonError("This user already has a member account.", 409);
  }

  const [
    { data: existingMembers, error: existingMemberError },
    { data: sameNameProfiles, error: sameNameError },
    { data: sameEmailProfiles, error: sameEmailError }
  ] = await Promise.all([
    adminClient
      .from("members")
      .select("*")
      .ilike("name", effectiveName)
      .ilike("group_name", groupName)
      .limit(1),
    adminClient
      .from("profiles")
      .select("user_id,email,display_name,role")
      .ilike("display_name", effectiveName),
    adminClient
      .from("profiles")
      .select("user_id,email,display_name,role")
      .ilike("email", effectiveEmail)
  ]);

  if (existingMemberError) return jsonError(schemaError(existingMemberError.message), 500);
  if (sameNameError) return jsonError(schemaError(sameNameError.message), 500);
  if (sameEmailError) return jsonError(schemaError(sameEmailError.message), 500);

  const sameNameProfile = sameNameProfiles?.find((profile) => profile.display_name?.toLowerCase() === effectiveName.toLowerCase());
  const sameEmailProfile = sameEmailProfiles?.find((profile) => profile.email?.toLowerCase() === effectiveEmail);

  if (!existingProfileId && sameNameProfile && sameEmailProfile && sameNameProfile.user_id === sameEmailProfile.user_id) {
    return jsonError("Username and email already exist. Please change both username and email.", 409);
  }
  if (!existingProfileId && sameEmailProfile) return jsonError("Email already exists. Please use another email.", 409);
  if (!existingProfileId && accountRole === "member" && sameNameProfile) {
    return jsonError("Username already exists. Please choose another username.", 409);
  }

  let userId = existingBaseProfile?.user_id;

  if (!userId) {
    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: effectiveEmail,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: { display_name: effectiveName }
    });

    if (createUserError) return jsonError(createUserError.message, 400);
    userId = createdUser.user.id;
  }

  if (accountRole === "admin") {
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        user_id: userId,
        member_id: existingBaseProfile?.member_id ?? null,
        role: existingBaseProfile?.member_id ? "member" : "admin",
        is_admin: true,
        display_name: effectiveName,
        email: effectiveEmail,
        require_password_reset: !existingProfileId
      }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (profileError) return jsonError(schemaError(profileError.message), 500);
    return NextResponse.json({ member: null, profile });
  }

  if (existingMembers?.length) {
    return NextResponse.json(
        { error: `${effectiveName} already exists in ${groupName}.`, member: existingMembers[0] },
      { status: 409 }
    );
  }

  const { data: member, error: memberError } = await adminClient
    .from("members")
    .insert({
      name: effectiveName,
      role: memberRole,
      group_name: groupName,
      phone: "",
      active: true
    })
    .select("*")
    .single();

  if (memberError) return jsonError(memberError.message, 500);

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      user_id: userId,
      member_id: member.id,
      role: "member",
      is_admin: existingBaseProfile?.is_admin || existingBaseProfile?.role === "admin",
      display_name: effectiveName,
      email: effectiveEmail,
      require_password_reset: !existingProfileId
    }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (profileError) return jsonError(schemaError(profileError.message), 500);

  return NextResponse.json({ member, profile });
}
