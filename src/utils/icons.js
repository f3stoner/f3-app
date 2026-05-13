import {
    createElement,
    Dumbbell,
    Flag,
    UserPlus,
    MapPin,
    CalendarDays,
    Sparkles,
    BicepsFlexed,
    Footprints,
    HeartPulse,
    Backpack,
    Badge,
    Zap,
    TrendingUp,
    Circle,
    ClipboardList,
} from "lucide";

const ICONS = {
    posts: Dumbbell,
    qs: Flag,
    fngsEh: UserPlus,
    favoriteAo: MapPin,
    lastPost: CalendarDays,
    fngDate: Sparkles,
    dumbbell: Dumbbell,
    bicepsFlexed: BicepsFlexed,
    footprints: Footprints,
    heartPulse: HeartPulse,
    backpack: Backpack,
    badge: Badge,
    zap: Zap,
    trendingUp: TrendingUp,
    circle: Circle,
    clipboardList: ClipboardList,
};

export function createIcon(name, className = "stat-icon") {
    const iconNode = ICONS[name];

    if (!iconNode) return document.createElement("span");

    return createElement(iconNode, {
        width: 20,
        height: 20,
        strokeWidth: 2,
        class: className,
    });
}