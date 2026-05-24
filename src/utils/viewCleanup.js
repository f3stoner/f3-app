const cleanupHandlers = new Map();

export function registerViewCleanup(viewName, handler) {
    cleanupHandlers.set(viewName, handler);
}

export function runViewCleanup(viewName) {
    const handler = cleanupHandlers.get(viewName);

    if (typeof handler === "function") {
        handler();
    }
}