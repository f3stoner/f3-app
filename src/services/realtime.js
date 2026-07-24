import { supabase } from "./supabaseClient.js";

const activeChannels = new Map();

export function subscribeToManagedChannel(
    channelKey,
    buildChannel
) {
    if (
        !channelKey ||
        typeof buildChannel !== "function"
    ) {
        console.warn(
            "Invalid realtime subscription request:",
            { channelKey }
        );

        return null;
    }

    /*
     * This cleanup is intentionally fire-and-forget here
     * because subscription creation itself is synchronous.
     * Full workspace cleanup awaits all removals through
     * unsubscribeAllManagedChannels().
     */
    void unsubscribeManagedChannel(channelKey);

    const channel = buildChannel();

    if (!channel) {
        console.warn(
            "Realtime channel builder returned nothing:",
            channelKey
        );

        return null;
    }

    activeChannels.set(
        channelKey,
        channel
    );

    return channel;
}

export async function unsubscribeManagedChannel(
    channelKey
) {
    const existingChannel =
        activeChannels.get(channelKey);

    if (!existingChannel) {
        return;
    }

    /*
     * Remove it from local ownership immediately so that
     * another subscription cannot treat it as active.
     */
    activeChannels.delete(channelKey);

    try {
        await supabase.removeChannel(
            existingChannel
        );
    } catch (error) {
        console.warn(
            "Failed to remove realtime channel:",
            {
                channelKey,
                error,
            }
        );
    }
}

export async function unsubscribeAllManagedChannels() {
    const channels = [
        ...activeChannels.entries(),
    ];

    activeChannels.clear();

    await Promise.allSettled(
        channels.map(
            async ([channelKey, channel]) => {
                try {
                    await supabase.removeChannel(
                        channel
                    );
                } catch (error) {
                    console.warn(
                        "Failed to remove realtime channel:",
                        {
                            channelKey,
                            error,
                        }
                    );
                }
            }
        )
    );
}

export function getActiveRealtimeChannelKeys() {
    return [...activeChannels.keys()];
}

export function logActiveRealtimeChannel() {
    console.log(
        "Active realtime channels:",
        getActiveRealtimeChannelKeys()
    );
}