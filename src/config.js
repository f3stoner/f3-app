//Old 300
//export const REGION_ID = "0925d0c8-2c87-4d9c-882a-86efa0ce1c5a";

//Aggieland
export const REGION_ID = "96c9eef9-3b6e-4365-86cd-51dbeccf231a";

export const REGION_AOS = {
    "96c9eef9-3b6e-4365-86cd-51dbeccf231a": [
        "BlackOps",
        "The Cave",
        "Dads",
        "The Forest",
        "The Iron",
        "The Keep",
        "The Mine",
        "The Rock",
        "Southie",
        "The Watch",
        "CSAUP",
        "Other",
    ],
    "0925d0c8-2c87-4d9c-882a-86efa0ce1c5a": [
        "The Hub",
        "The Melt Shop",
    ],
}

export const REGION_INTRO_TEMPLATES = {
    "96c9eef9-3b6e-4365-86cd-51dbeccf231a": (paxName = "<Insert PAX Name>") => `-1 Minute Warning-
    
Good Morning & Welcome to F3! My name is ${paxName} and I’ll be your Q today.

F3 stands for Fitness, Fellowship & Faith.

The Mission of F3 is to plant, grow and serve small workout groups for men for the invigoration of male community leadership. 

F3 has 5 Core Principles for our workouts:

1. Free of Charge
2. Open to All Men
3. Held Outdoors, Rain or Shine
4. Peer Led in a rotating fashion
5. Always Ends in Circle of Trust

F3 Credo: Leave no man behind but leave no man where you found him. 

Disclaimer: F3 is a free, volunteer, peer-led workout. I am not a professional trainer. I have no knowledge of any injuries or fitness history. It is each man’s responsibility to be safe and modify exercises if you need to, we all do it. Push yourself, but don’t hurt yourself. 

FNGs/Assign Battle Buddies 
Phones
CPR
Count-O-Rama`,

    "0925d0c8-2c87-4d9c-882a-86efa0ce1c5a": (paxName = "<Insert PAX Name>") => `Good Morning & Welcome to F3! My name is ${paxName} and I’ll be your Q today.

F3 Mission: The mission of F3 is to plant, grow and serve small workout groups for men for the invigoration of male community leadership.

5 Core Principles:

1. Free of charge
2. Open to all men
3. Held outdoors, rain or shine
4. Peer led
5. Always ends in a Circle of Trust

F3 Credo: Leave no man behind, but leave no man where you found him.

Disclaimer: F3 workouts are free and open to all men. Your participation is voluntary. I am not a fitness professional or healthcare provider. F3 workouts involve strenuous physical exercise. Push yourself but don’t hurt yourself. If you feel like something is wrong, let me know. Don’t hesitate to modify your exercise. We all do it. Aye?

ID of FNGs and assignment of battle buddies -

CPR and cell phone check -

Count-O-Rama -`,
}

export const WORKOUT_EMPHASIS = {
    heavy: { label: "Heavy", icon: "dumbbell" },
    upper: { label: "Upper", icon: "bicepsFlexed" },
    lower: { label: "Lower", icon: "footprints" },
    cardio: { label: "Cardio", icon: "heartPulse" },
    ruck: { label: "Ruck", icon: "backpack" },
    core: { label: "Core", icon: "badge" },
    "30/30": { label: "30/30", icon: "zap" },
    stairs: { label: "Stairs", icon: "trendingUp" },
    other: { label: "Other", icon: "circle" },
    benchmark: { label: "Benchmark", icon: "clipboardList"},
};

export const AO_WORKOUT_EMPHASIS_RULES = [

    // Cave
    { aoName: "The Cave", dayOfWeek: 1, pattern: "fixed", values: ["heavy"] },
    { aoName: "The Cave", dayOfWeek: 2, pattern: "alternating-weeks", values: ["upper", "core", "cardio"], startsOnDate: "2026-01-20" },
    { aoName: "The Cave", dayOfWeek: 5, pattern: "fixed", values: ["heavy"] },

    // Forest
    { aoName: "The Forest", dayOfWeek: 1, pattern: "fixed", values: ["ruck"] },
    { aoName: "The Forest", dayOfWeek: 2, pattern: "alternating-weeks", values: ["upper", "lower", "cardio", "core"], startsOnDate: "2026-02-17" },
    { aoName: "The Forest", dayOfWeek: 3, pattern: "alternating-weeks", values: ["lower", "cardio", "core", "upper"], startsOnDate: "2026-02-04" },
    { aoName: "The Forest", dayOfWeek: 4, pattern: "alternating-weeks", values: ["upper", "lower", "cardio", "core"], startsOnDate: "2026-02-05" },

    // Iron
    { aoName: "The Iron", dayOfWeek: 1, pattern: "alternating-weeks", values: ["core", "upper"], startsOnDate: "2026-01-05" },
    { aoName: "The Iron", dayOfWeek: 3, pattern: "alternating-weeks", values: ["cardio", "lower"], startsOnDate: "2026-01-07" },
    { aoName: "The Iron", dayOfWeek: 5, pattern: "fixed", values: ["ruck"] },

    // Keep
    { aoName: "The Keep", dayOfWeek: 2, pattern: "alternating-weeks", values: ["cardio", "lower"], startsOnDate: "2026-03-03" },
    { aoName: "The Keep", dayOfWeek: 3, pattern: "fixed", values: ["30/30"] },
    { aoName: "The Keep", dayOfWeek: 4, pattern: "alternating-weeks", values: ["core", "upper"], startsOnDate: "2026-05-07" },
    { aoName: "The Keep", dayOfWeek: 5, pattern: "fixed", values: ["ruck"] },

    // Mine
    { aoName: "The Mine", dayOfWeek: 2, pattern: "alternating-weeks", values: ["lower", "cardio"], startsOnDate: "2026-01-06" },
    { aoName: "The Mine", dayOfWeek: 4, pattern: "alternating-weeks", values: ["upper", "core"], startsOnDate: "2026-01-01" },

    // Rock
    { aoName: "The Rock", dayOfWeek: 1, pattern: "fixed", values: ["cardio"] },
    { aoName: "The Rock", dayOfWeek: 2, pattern: "fixed", values: ["lower"] },
    { aoName: "The Rock", dayOfWeek: 4, pattern: "fixed", values: ["upper"] },
    { aoName: "The Rock", dayOfWeek: 5, pattern: "fixed", values: ["cardio"] },

    // Southie
    { aoName: "The Southie", dayOfWeek: 3, pattern: "fixed", values: ["ruck"] },

    // F3Dads
    { aoName: "The F3Dads", dayOfWeek: 6, pattern: "alternating-weeks", values: ["core", "upper", "lower", "cardio"], startsOnDate: "2026-02-21" },
];