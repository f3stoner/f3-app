import { supabase } from "./supabaseClient.js";

export async function getCurrentSession() {
    const { data, error } = await supabase.auth.getSession();

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

export async function getMyProfile(existingSession = null) {
    const session = existingSession || await getCurrentSession();
    if (!session) return null;

    const { data, error } = await supabase
        .from("profiles")
        .select(`
            id,
            email,
            display_name,
            region_id,
            role,
            member_id,
            custom_templates
        `)
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

export async function ensureMyProfile(defaultRegionId = null, existingSession = null) {
    console.time("ensureMyProfile:total");

    console.time("ensureMyProfile:getSession");
    const session = existingSession || await getCurrentSession();
    console.timeEnd("ensureMyProfile:getSession");

    if (!session) {
        console.timeEnd("ensureMyProfile:total");
        return null;
    }

    try {
        console.time("ensureMyProfile:getMyProfile");
        const existingProfile = await getMyProfile(session);
        console.timeEnd("ensureMyProfile:getMyProfile");

        if (existingProfile) {
            console.timeEnd("ensureMyProfile:total");
            return existingProfile;
        }
    } catch (error) {
        console.timeEnd("ensureMyProfile:getMyProfile");
        console.warn("Profile lookup failed, attempting fallback profile creation.", error);
    }

    if (!defaultRegionId) {
        console.timeEnd("ensureMyProfile:total");
        throw new Error("No profile found and no default region provided for fallback.");
    }

    const email = session.user.email || null;
    const displayName = email ? email.split("@")[0] : "User";

    console.time("ensureMyProfile:createProfile");
    const createdProfile = await createProfile({
        id: session.user.id,
        email,
        displayName,
        regionId: defaultRegionId,
        role: "user"
    });
    console.timeEnd("ensureMyProfile:createProfile");

    console.timeEnd("ensureMyProfile:total");
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