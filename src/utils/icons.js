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
    Sun,
    CloudSun,
    Cloud,
    CloudRain,
    CloudLightning,
    CloudFog,
    Snowflake,
    CloudDrizzle,
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

const weatherIconMap = {
    clear: Sun,
    "mostly-clear": CloudSun,
    "partly-cloudy": CloudSun,
    cloudy: Cloud,
    rain: CloudRain,
    storm: CloudLightning,
    fog: CloudFog,
    snow: Snowflake,
    "freezing-rain": CloudRain,
    drizzle: CloudDrizzle,
    unknown: Cloud,
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

export function createWeatherIcon(iconName, options = {}) {
    const Icon = weatherIconMap[iconName] || Cloud;

    return createElement(Icon, {
        width: options.size || 14,
        height: options.size || 14,
        strokeWidth: options.strokeWidth || 2.2,
        class: options.className || "weather-icon",
    });
}