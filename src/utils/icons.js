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
    ChevronRight,
    ChevronUp,
    ChartColumnIncreasing,
    ArrowUpRight,
    Shield,
    Medal,
    Pencil,
    Pen,
    Users,
    HeartHandshake,
    ShieldCheck,
    Settings2,
    CircleUserRound,
    CalendarCheck,
    History,
    NotebookPen,
    CalendarRange,
    Megaphone,
    Menu,
    ExternalLink,
    Award,
    SmilePlus,
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

    // Regional feed event icons
    feedWorkoutComplete: Dumbbell,
    feedFngWelcome: UserPlus,
    feedVqEarned: Award,
    feedAnnouncement: Megaphone,
    feedReactionAdd: SmilePlus,

    chevronRight: ChevronRight,
    chevronUp: ChevronUp,

    chartColumn: ChartColumnIncreasing,
    arrowUpRight: ArrowUpRight,
    externalLink: ExternalLink,

    shield: Shield,
    medal: Medal,
    pencil: Pencil,

    firstF: Dumbbell,
    secondF: Users,
    thirdF: HeartHandshake,
    leadership: ShieldCheck,
    administration: Settings2,
    account: CircleUserRound,

    qSignup: CalendarCheck,
    weeklySchedule: CalendarRange,
    planner: NotebookPen,
    history: History,
    announcements: Megaphone,
    menu: Menu,
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

export function createIcon(name, className = "stat-icon", options = {}) {
    const iconNode = ICONS[name];

    if (!iconNode) return document.createElement("span");

    return createElement(iconNode, {
        width: options.size || 20,
        height: options.size || 20,
        strokeWidth: options.strokeWidth || 2,
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