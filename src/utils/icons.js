import {
    createElement,
    Dumbbell,
    Flag,
    UserPlus,
    MapPin,
    CalendarDays,
    Sparkles,
} from "lucide";

const ICONS = {
    posts: Dumbbell,
    qs: Flag,
    fngsEh: UserPlus,
    favoriteAo: MapPin,
    lastPost: CalendarDays,
    fngDate: Sparkles,
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