import { supabase } from "./supabaseClient.js";

function normalizeLibraryName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

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
        isActive: row.is_active !== false,
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
        .eq("is_active", true)
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

export async function createLibraryItemInCloud(item) {
    const { data, error } = await supabase
        .from("library_items")
        .insert({
            item_type: item.itemType || null,
            name: item.name?.trim() || "",
            normalized_name: normalizeLibraryName(item.name),
            description: item.description || "",
            aliases: item.aliases || [],
            tags: item.tags || [],
            equipment: item.equipment || [],
            emphasis: item.emphasis || [],
            movement_patterns: item.movementPatterns || [],
            body_parts: item.bodyParts || [],
            source_type: item.sourceType || "user_created",
            source_meta: item.sourceMeta || {},
            review_status: item.reviewStatus || "reviewed",
            is_active: true,
        })
        .select()
        .single();

    if (error) throw error;

    return mapLibraryItemFromDb(data);
}

export async function updateLibraryItemInCloud(item) {
    const { data, error } = await supabase
        .from("library_items")
        .update({
            item_type: item.itemType || null,
            name: item.name?.trim() || "",
            normalized_name: normalizeLibraryName(item.name),
            description: item.description || "",
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
        .eq("is_active", true)
        .or(
            `name.ilike.%${term}%,description.ilike.%${term}%`
        )
        .order("name")
        .limit(limit);

    if (error) throw error;

    return (data || []).map(mapLibraryItemFromDb);
}

export async function loadLibraryAutocompleteItems(limit = 1000) {
    const { data, error } = await supabase
        .from("library_items")
        .select("*")
        .eq("is_active", true)
        .in("review_status", ["imported", "reviewed"])
        .order("name", { ascending: true })
        .limit(limit);

    if (error) throw error;

    return (data || []).map(mapLibraryItemFromDb);
}

export function searchLibraryIdeas({
    items = [],
    text = "",
    type = "all",
    emphasis = [],
    equipment = [],
    tags = [],
    limit = 50,
} = {}) {
    const query = String(text || "").trim().toLowerCase();

    return (items || [])
        .filter(item => item.isActive !== false)
        .filter(item => {
            const haystack = [
                item.name,
                item.description,
                item.itemType,
                ...(item.emphasis || []),
                ...(item.equipment || []),
                ...(item.tags || []),
            ].join(" ").toLowerCase();

            if (query && !haystack.includes(query)) return false;
            if (type !== "all" && item.itemType !== type) return false;

            if (emphasis.length && !emphasis.some(value => item.emphasis?.includes(value))) return false;
            if (equipment.length && !equipment.some(value => item.equipment?.includes(value))) return false;
            if (tags.length && !tags.some(value => item.tags?.includes(value))) return false;

            return true;
        })
        .slice(0, limit);
}

export async function deactivateLibraryItem(itemId) {
    const { data, error } = await supabase
        .from("library_items")
        .update({
            is_active: false,
        })
        .eq("id", itemId)
        .select()
        .single();

    if (error) throw error;

    return mapLibraryItemFromDb(data);
}

export async function loadLibraryFilterOptions() {
    const { data, error } = await supabase
        .from("library_items")
        .select("tags,equipment,emphasis")
        .eq("is_active", true);

    if (error) throw error;

    const collect = key => [
        ...new Set(
            (data || [])
                .flatMap(row => Array.isArray(row[key]) ? row[key] : [])
                .filter(Boolean)
        ),
    ].sort((a, b) => a.localeCompare(b));

    return {
        tags: collect("tags"),
        equipment: collect("equipment"),
        emphasis: collect("emphasis"),
    };
}