import { state } from "../modules/state.js";

export function resolveSiteForQSlot(slot, ao) {
    const siteId =
        slot.siteId ||
        ao?.defaultSiteId ||
        null;

    if (!siteId) {
        return null;
    }

    return (
        state.sites.find(site => site.id === siteId) ||
        null
    );
}