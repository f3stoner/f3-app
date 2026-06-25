import { supabase } from "./supabaseClient.js";

export function mapLibraryItemFromDb(row) {
    return {
        id: row.id,
        itemType: row.item_type || null,
        name: row.name || "",
        normalizedName: row.normalized_name || "",
        slug: row.slug || "",
        description: row.description || "",
        descriptionHtml: row.description_html || "",
        aliases: row.aliases || [],
        tags: row.tags || [],
        equipment: row.equipment || [],
        emphasis: row.emphasis || [],
        movementPatterns: row.movement_patterns || [],
        bodyParts: row.body_parts || [],
        sourceType: row.source_type || "",
        sourceId: row.source_id || "",
        sourceMeta: row.source_meta || {},
        classificationConfidence: row.classification_confidence ?? null,
        reviewStatus: row.review_status || "imported",
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

export async function loadLibraryWorkbenchItems({
    reviewStatus = "imported",
    itemType = "all",
    search = "",
    limit = 100,
} = {}) {
    let query = supabase
        .from("library_items")
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("name", { ascending: true })
        .limit(limit);

    if (reviewStatus && reviewStatus !== "all") {
        query = query.eq("review_status", reviewStatus);
    }

    if (itemType === "unknown") {
        query = query.is("item_type", null);
    } else if (itemType && itemType !== "all") {
        query = query.eq("item_type", itemType);
    }

    const trimmedSearch = String(search || "").trim();

    if (trimmedSearch.length >= 2) {
        query = query.or(
            `name.ilike.%${trimmedSearch}%,description.ilike.%${trimmedSearch}%`
        );
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(mapLibraryItemFromDb);
}

export async function updateLibraryItemInCloud(item) {
    const { data, error } = await supabase
        .from("library_items")
        .update({
            item_type: item.itemType || null,
            aliases: item.aliases || [],
            tags: item.tags || [],
            equipment: item.equipment || [],
            emphasis: item.emphasis || [],
            movement_patterns: item.movementPatterns || [],
            body_parts: item.bodyParts || [],
            review_status: item.reviewStatus || "reviewed",
            updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .select()
        .single();

    if (error) throw error;

    return mapLibraryItemFromDb(data);
}

export async function searchLibrary(search, limit = 25) {
    const term = String(search || "").trim();

    if (!term) return [];

    const { data, error } = await supabase
        .from("library_items")
        .select("*")
        .or(
            `name.ilike.%${term}%,description.ilike.%${term}%`
        )
        .order("name")
        .limit(limit);

    if (error) throw error;

    return (data || []).map(mapLibraryItemFromDb);
}