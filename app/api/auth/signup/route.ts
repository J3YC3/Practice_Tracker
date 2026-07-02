import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SignupBody = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError("Server is missing SUPABASE_SERVICE_ROLE_KEY.", 500);
  }

  const body = (await request.json()) as SignupBody;
  const username = body.username?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const confirmPassword = body.confirmPassword ?? "";

  if (!username) return jsonError("Username is required.");
  if (!email) return jsonError("Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("Email is invalid.");
  if (password.length < 6) return jsonError("Password must be at least 6 characters.");
  if (password !== confirmPassword) return jsonError("Passwords do not match.");

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const [
    { data: sameNameProfiles, error: nameError },
    { data: sameEmailProfiles, error: emailError },
    { data: sameNameMembers, error: memberNameError }
  ] = await Promise.all([
    adminClient.from("profiles").select("id,email,display_name").ilike("display_name", username),
    adminClient.from("profiles").select("id,email,display_name").ilike("email", email),
    adminClient.from("members").select("id,name").ilike("name", username).limit(1)
  ]);

  if (nameError) return jsonError(nameError.message, 500);
  if (emailError) return jsonError(emailError.message, 500);
  if (memberNameError) return jsonError(memberNameError.message, 500);

  const hasSameName = Boolean(sameNameProfiles?.length || sameNameMembers?.length);
  const hasSameEmail = Boolean(sameEmailProfiles?.length);
  const sameProfile = sameNameProfiles?.some((profile) => profile.email?.toLowerCase() === email);

  if (sameProfile || (hasSameName && hasSameEmail)) {
    return jsonError("Username and email already exist. Please change both username and email.", 409);
  }
  if (hasSameName) return jsonError("Username already exists. Please choose another username.", 409);
  if (hasSameEmail) return jsonError("Email already exists. Please use another email.", 409);

  const { data: member, error: memberError } = await adminClient
    .from("members")
    .insert({
      name: username,
      role: "Drummer",
      group_name: "General",
      phone: "",
      active: true
    })
    .select("*")
    .single();

  if (memberError) return jsonError(memberError.message, 500);

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: username }
  });

  if (createUserError) {
    await adminClient.from("members").delete().eq("id", member.id);
    return jsonError(createUserError.message, 400);
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      user_id: createdUser.user.id,
      member_id: member.id,
      role: "member",
      display_name: username,
      email,
      require_password_reset: false
    }, { onConflict: "user_id" });

  if (profileError) return jsonError(profileError.message, 500);

  return NextResponse.json({ ok: true });
}
