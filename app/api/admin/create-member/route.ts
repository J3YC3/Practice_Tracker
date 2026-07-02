import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreateMemberBody = {
  name?: string;
  email?: string;
  defaultPassword?: string;
  memberRole?: string;
  groupName?: string;
  accountRole?: "admin" | "member";
};

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
    .select("role")
    .eq("user_id", authData.user.id)
    .single();

  if (requesterError || requesterProfile?.role !== "admin") {
    return jsonError("Only admin can create member login accounts.", 403);
  }

  const body = (await request.json()) as CreateMemberBody;
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const defaultPassword = body.defaultPassword ?? "";
  const memberRole = body.memberRole?.trim() || "Drummer";
  const groupName = body.groupName?.trim() || "General";
  const accountRole = body.accountRole ?? "member";

  if (!name) return jsonError("Member name is required.");
  if (!email) return jsonError("Member email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("Member email is invalid.");
  if (defaultPassword.length < 6) return jsonError("Default password must be at least 6 characters.");

  const [
    { data: existingMembers, error: existingMemberError },
    { data: sameNameProfiles, error: sameNameError },
    { data: sameEmailProfiles, error: sameEmailError }
  ] = await Promise.all([
    adminClient
      .from("members")
      .select("*")
      .ilike("name", name)
      .ilike("group_name", groupName)
      .limit(1),
    adminClient
      .from("profiles")
      .select("user_id,email,display_name,role")
      .ilike("display_name", name),
    adminClient
      .from("profiles")
      .select("user_id,email,display_name,role")
      .ilike("email", email)
  ]);

  if (existingMemberError) return jsonError(existingMemberError.message, 500);
  if (sameNameError) return jsonError(sameNameError.message, 500);
  if (sameEmailError) return jsonError(sameEmailError.message, 500);

  const sameNameProfile = sameNameProfiles?.find((profile) => profile.display_name?.toLowerCase() === name.toLowerCase());
  const sameEmailProfile = sameEmailProfiles?.find((profile) => profile.email?.toLowerCase() === email);

  if (sameNameProfile && sameEmailProfile && sameNameProfile.user_id === sameEmailProfile.user_id) {
    return jsonError("Username and email already exist. Please change both username and email.", 409);
  }
  if (sameEmailProfile) return jsonError("Email already exists. Please use another email.", 409);
  if (accountRole === "member" && sameNameProfile) {
    return jsonError("Username already exists. Please choose another username.", 409);
  }

  let userId: string | undefined;

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { display_name: name }
  });

  if (createUserError) return jsonError(createUserError.message, 400);
  userId = createdUser.user.id;

  if (accountRole === "admin") {
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        user_id: userId,
        member_id: null,
        role: "admin",
        display_name: name,
        email,
        require_password_reset: true
      }, { onConflict: "user_id" })
      .select("*")
      .single();

    if (profileError) return jsonError(profileError.message, 500);
    return NextResponse.json({ member: null, profile });
  }

  if (existingMembers?.length) {
    return NextResponse.json(
      { error: `${name} already exists in ${groupName}.`, member: existingMembers[0] },
      { status: 409 }
    );
  }

  const { data: member, error: memberError } = await adminClient
    .from("members")
    .insert({
      name,
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
      role: accountRole,
      display_name: name,
      email,
      require_password_reset: true
    }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (profileError) return jsonError(profileError.message, 500);

  return NextResponse.json({ member, profile });
}
