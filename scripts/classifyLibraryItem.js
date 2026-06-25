function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function includesAny(text, terms) {
    return terms.some((term) => text.includes(term));
}

export function classifyLibraryItem({
    name,
    description = "",
    descriptionHtml = "",
}) {
    const nameText = String(name || "").toLowerCase();
    const text = `${name} ${description} ${descriptionHtml}`.toLowerCase();
    const metadata = {
        tags: [],
        equipment: [],
        emphasis: [],
        movementPatterns: [],
        bodyParts: [],
    };

    const reasons = [];

    let itemType = null;
    let confidence = 0.35;

    //
    // THANG DETECTION
    //

    if (
        includesAny(text, [
            "partner up",
            "pax partner",
            "split into",
            "stations",
            "station ",
            "rotation",
            "rotate",
            "relay",
            "amrap",
            "emom",
            "tabata",
            "11s",
            "elevens",
            "dora",
            "circuit",
            "rounds",
            "rinse and repeat",
        ])
    ) {
        itemType = "thang";
        confidence = 0.85;
        metadata.tags.push("routine");
        reasons.push("Matched thang keywords.");
    }

    //
    // EXERCISE DETECTION
    //

    if (
        !itemType &&
        includesAny(nameText, [
            "merkin",
            "burpee",
            "squat",
            "lunge",
            "crawl",
            "carry",
            "press",
            "curl",
            "hammer",
            "dip",
            "pull-up",
            "pull up",
            "plank",
            "flutter",
            "lbc",
        ])
    ) {
        itemType = "exercise";
        confidence = 0.80;
        reasons.push("Matched exercise name keywords.");
    }

    //
    // TAGS
    //

    if (text.includes("partner")) metadata.tags.push("partner");

    if (text.includes("team")) metadata.tags.push("team");

    if (
        includesAny(text, [
            "game",
            "ultimate",
            "competition",
            "competitive",
        ])
    ) {
        metadata.tags.push("game");
        metadata.tags.push("competitive");
    }

    //
    // EQUIPMENT
    //

    if (
        includesAny(text, [
            "coupon",
            "cindy",
            "block",
            "cmu",
        ])
    ) {
        metadata.equipment.push("coupon");
        metadata.emphasis.push("heavy");
    }

    if (text.includes("ruck")) {
        metadata.equipment.push("ruck");
        metadata.emphasis.push("ruck");
    }

    //
    // EMPHASIS
    //

    if (
        includesAny(text, [
            "merkin",
            "push-up",
            "push up",
            "press",
            "dip",
        ])
    ) {
        metadata.emphasis.push("upper");
        metadata.movementPatterns.push("push");
        metadata.bodyParts.push("chest", "shoulders", "triceps");
    }

    if (
        includesAny(text, [
            "squat",
            "lunge",
            "lt. dan",
            "lt dan",
        ])
    ) {
        metadata.emphasis.push("lower");
        metadata.movementPatterns.push("squat");
        metadata.bodyParts.push("quads", "glutes", "hamstrings");
    }

    if (
        includesAny(text, [
            "plank",
            "hammer",
            "flutter",
            "lbc",
            "big boy",
        ])
    ) {
        metadata.emphasis.push("core");
        metadata.bodyParts.push("core");
    }

    return {
        itemType,
        metadata: {
            tags: unique(metadata.tags),
            equipment: unique(metadata.equipment),
            emphasis: unique(metadata.emphasis),
            movementPatterns: unique(metadata.movementPatterns),
            bodyParts: unique(metadata.bodyParts),
        },
        confidence,
        reasons,
    };
}