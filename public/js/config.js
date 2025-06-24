// We'll store our API keys here once we get them from the server.
let GEMINI_API_KEY = null;
let youtubeApiKeys = [];

// These are the web addresses for the YouTube and Gemini services we talk to.
export const API_ENDPOINTS = {
    YOUTUBE_BASE: 'https://www.googleapis.com/youtube/v3',
    GEMINI_BASE: 'https://generativelanguage.googleapis.com/v1beta'
};

// This holds all our database settings, like collection names and how long
// we should cache things before they're considered old.
export const DB_CONFIG = {
    dbName: 'ytweb',
    collections: {
        channels: 'channels',
        videos: 'videos',
        categories: 'categories',
        playlists: 'playlists'
    },
    cacheExpiry: {
        channels: 24,    // hours
        videos: 12,      // hours
        categories: 48,  // hours
        playlists: 24   // hours
    }
};

// When the app starts, this function fetches our secret keys and other settings
// from the server so we can use them.
export async function initConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        GEMINI_API_KEY = config.geminiApiKey;
        youtubeApiKeys = config.youtubeApiKeys || [];
        return config;
    } catch (error) {
        console.error('Error loading configuration:', error);
        throw error;
    }
}

// These functions let other parts of the app get the API keys after they're loaded.
export function getGeminiApiKey() {
    return GEMINI_API_KEY;
}

export function getYouTubeApiKeys() {
    return youtubeApiKeys;
}
