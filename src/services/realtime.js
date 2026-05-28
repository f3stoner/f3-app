import { supabase } from "./supabaseClient.js";

const activeChannels = new Map();

export function subscribeToManagedChannel(channelKey, buildChannel) {
    if (!channelKey || typeof buildChannel !== "function") {
        console.warn("Invalid realtime subscription request:", { channelKey });
        return null;
    }

    unsubscribeManagedChannel(channelKey);

    const channel = buildChannel();

    if (!channel) {
        console.warn("Realtime channel builder returned nothing:", channelKey);
        return null;
    }

    activeChannels.set(channelKey, channel);

    return channel;
}

export function unsubscribeManagedChannel(channelKey) {
    const existingChannel = activeChannels.get(channelKey);

    if (!existingChannel) return;

    supabase.removeChannel(existingChannel);
    activeChannels.delete(channelKey);
}

export function unsubscribeAllManagedChannels() {
    activeChannels.forEach(channel => {
        supabase.removeChannel(channel);
    });

    activeChannels.clear();
}

export function getActiveRealtimeChannelKeys() {
    return [...activeChannels.keys()];
}

export function logActiveRealtimeChannel() {
    console.log("Active realtime channels:", getActiveRealtimeChannelKeys());
}
