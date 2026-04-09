import { supabase } from "./supabaseClient.js";

export async function getCurrentSession() {
    const { data, error } = await supabase.auth.getSession();
    console.log("getCurrentSession data:", data);
    console.log("getCurrentSession error:", error);

    if (error) throw error;
    return data.session;
}

export async function signInWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getMyProfile() {
    const session = await getCurrentSession();
    if (!session) return null;

    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

    if (error) throw error;
    return data;
}

export async function signUpWithEmail(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) throw error;
    return data;
}

export async function createProfile({ id, email, displayName, regionId, role = "user" }) {
    const { data, error } = await supabase
        .from("profiles")
        .insert([
            {
                id,
                email,
                display_name: displayName || null,
                region_id: regionId,
                role,
                member_id: null,
            },
        ])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function ensureMyProfile(defaultRegionId = null) {
    const session = await getCurrentSession();
    if (!session) return null;

    try {
        const existingProfile = await getMyProfile();
        if (existingProfile) return existingProfile;
    } catch (error) {
        console.warn("Profile lookup failed, attempting fallback profile creation.", error);
    }

    if (!defaultRegionId) {
        throw new Error("No profile found and no default region provided for fallback.");
    }

    const email = session.user.email || null;
    const displayName = email ? email.split("@")[0] : "User";

    const createdProfile = await createProfile({
        id: session.user.id,
        email,
        displayName,
        regionId: defaultRegionId,
        role: "user"
    });

    return createdProfile;
}

export async function updateMyProfile(updates) {
    const currentSession = await getCurrentSession();

    if (!currentSession) {
        throw new Error("No active session");
    }

    const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", currentSession.user.id)
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function requestPasswordReset(email) {
    const redirectTo = `${window.location.origin}${window.location.pathname}?mode=reset-password`;

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    });

    if (error) throw error;
    return data;
}

export async function updateMyPassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
    });

    if (error) throw error;
    return data;
}