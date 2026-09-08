import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
            },
        }
    );
}

function getClientIp(request: Request) {
    const cloudflareIp = request.headers.get("cf-connecting-ip");

    if (cloudflareIp) {
        return cloudflareIp.trim();
    }

    const forwarded = request.headers.get("x-forwarded-for");

    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }

    const realIp = request.headers.get("x-real-ip");

    if (realIp) {
        return realIp.trim();
    }

    return null;
}

async function sha256(value: string) {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);

    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function getInterestLabel(value: string) {
    const labels: Record<string, string> = {
        first_workout: "First workout question",
        general: "General question",
        other: "Other",
    };

    return labels[value] || value;
}

Deno.serve(async request => {
    if (request.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders,
        });
    }

    if (request.method !== "POST") {
        return jsonResponse(
            {
                success: false,
                error: "Method not allowed.",
            },
            405
        );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("CONTACT_FROM_EMAIL");
    const rateLimitSalt = Deno.env.get("CONTACT_RATE_LIMIT_SALT");

    if (
        !supabaseUrl ||
        !serviceRoleKey ||
        !resendApiKey ||
        !fromEmail ||
        !rateLimitSalt
    ) {
        console.error("Missing contact function environment configuration.");

        return jsonResponse(
            {
                success: false,
                error: "Contact service unavailable.",
            },
            500
        );
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return jsonResponse(
            {
                success: false,
                error: "Invalid request.",
            },
            400
        );
    }

    const regionSlug = String(body?.regionSlug || "").trim();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const interestType = String(body?.interestType || "").trim();
    const message = String(body?.message || "").trim();
    const website = String(body?.website || "").trim();

    /*
     * Honeypot.
     *
     * Pretend success so bots do not learn which field trapped them.
     */
    if (website) {
        return jsonResponse({
            success: true,
        });
    }

    if (!regionSlug) {
        return jsonResponse(
            {
                success: false,
                error: "Region is required.",
            },
            400
        );
    }

    if (!name || name.length > 100) {
        return jsonResponse(
            {
                success: false,
                error: "Please enter your name.",
            },
            400
        );
    }

    if (
        !email ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return jsonResponse(
            {
                success: false,
                error: "Please enter a valid email address.",
            },
            400
        );
    }

    if (phone.length > 40) {
        return jsonResponse(
            {
                success: false,
                error: "Phone number is too long.",
            },
            400
        );
    }

    if (
        ![
            "first_workout",
            "general",
            "other",
        ].includes(interestType)
    ) {
        return jsonResponse(
            {
                success: false,
                error: "Please choose a valid reason.",
            },
            400
        );
    }

    if (!message || message.length > 2000) {
        return jsonResponse(
            {
                success: false,
                error: "Please enter a message.",
            },
            400
        );
    }

    const clientIp = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";

    /*
     * If the platform does not provide an IP, include UA so every
     * unknown request does not collapse into one global bucket.
     */
    const visitorIdentity = clientIp
        ? `ip:${clientIp}`
        : `unknown:${userAgent}`;

    const rateKey = await sha256(
        `${rateLimitSalt}:${visitorIdentity}`
    );

    const supabase = createClient(
        supabaseUrl,
        serviceRoleKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    );

    const { data: rateLimit, error: rateLimitError } =
        await supabase.rpc(
            "consume_public_site_contact_rate_limit",
            {
                p_key_hash: rateKey,
            }
        );

    if (rateLimitError) {
        console.error(
            "Contact rate limit failure:",
            rateLimitError
        );

        return jsonResponse(
            {
                success: false,
                error: "Contact service unavailable.",
            },
            500
        );
    }

    if (!rateLimit?.allowed) {
        return jsonResponse(
            {
                success: false,
                error:
                    "Too many messages have been sent recently. Please try again later.",
            },
            429
        );
    }

    /*
     * Resolve the private region destination.
     * This never goes back to the browser.
     */
    const { data: regionConfig, error: regionConfigError } =
        await supabase
            .from("region_public_site_config")
            .select(`
                region_id,
                contact_email,
                regions!inner (
                    id,
                    name,
                    slug,
                    environment
                )
            `)
            .eq("regions.slug", regionSlug)
            .eq("regions.environment", "production")
            .eq("is_enabled", true)
            .maybeSingle();

    if (
        regionConfigError ||
        !regionConfig ||
        !regionConfig.contact_email
    ) {
        console.error(
            "Unable to resolve region contact:",
            regionConfigError
        );

        return jsonResponse(
            {
                success: false,
                error:
                    "This region is not currently accepting contact messages.",
            },
            400
        );
    }

    const { data: submission, error: submissionError } =
        await supabase.rpc(
            "submit_public_region_contact",
            {
                p_region_slug: regionSlug,
                p_name: name,
                p_email: email,
                p_phone: phone || null,
                p_interest_type: interestType,
                p_message: message,
                p_website: null,
            }
        );

    if (submissionError || !submission?.submissionId) {
        console.error(
            "Unable to store contact submission:",
            submissionError
        );

        return jsonResponse(
            {
                success: false,
                error:
                    "We couldn't send your message right now. Please try again.",
            },
            500
        );
    }

    const submissionId = submission.submissionId;
    const regionName =
        regionConfig.regions?.name ||
        regionSlug;

    const interestLabel =
        getInterestLabel(interestType);

    const emailBody = [
        `New Q Site contact for ${regionName}`,
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || "Not provided"}`,
        `Reason: ${interestLabel}`,
        "",
        "Message:",
        message,
        "",
        `Submission ID: ${submissionId}`,
    ].join("\n");

    let notificationStatus = "failed";
    let notificationError: string | null = null;
    let notificationSentAt: string | null = null;

    try {
        const emailResponse = await fetch(
            "https://api.resend.com/emails",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${resendApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: fromEmail,
                    to: [regionConfig.contact_email],
                    reply_to: email,
                    subject:
                        `New Q Site contact — ${interestLabel}`,
                    text: emailBody,
                }),
            }
        );

        if (!emailResponse.ok) {
            notificationError =
                await emailResponse.text();

            console.error(
                "Resend failure:",
                notificationError
            );
        } else {
            notificationStatus = "sent";
            notificationSentAt =
                new Date().toISOString();
        }
    } catch (error) {
        notificationError =
            error instanceof Error
                ? error.message
                : String(error);

        console.error(
            "Contact email exception:",
            error
        );
    }

    const { error: notificationUpdateError } =
        await supabase
            .from(
                "region_public_site_contact_submissions"
            )
            .update({
                notification_status:
                    notificationStatus,
                notification_sent_at:
                    notificationSentAt,
                notification_error:
                    notificationError,
            })
            .eq(
                "id",
                submissionId
            );

    if (notificationUpdateError) {
        console.error(
            "Unable to update notification status:",
            notificationUpdateError
        );
    }

    /*
     * The lead is already safely stored. Do not tell the visitor
     * their submission failed merely because notification email failed.
     */
    return jsonResponse({
        success: true,
        submissionId,
    });
});