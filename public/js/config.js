// API configuration that will be populated
let GEMINI_API_KEY = null;

// Where we'll be making our API calls to
export const API_ENDPOINTS = {
    YOUTUBE_BASE: 'https://www.googleapis.com/youtube/v3',
    GEMINI_BASE: 'https://generativelanguage.googleapis.com/v1beta'
};

// All our MongoDB stuff lives here
export const DB_CONFIG = {
    // Connection string will be used server-side only
    dbName: 'ytweb',
    // Different collections we're using
    collections: {
        channels: 'channels',
        videos: 'videos',
        categories: 'categories',
        playlists: 'playlists'
    },
    // How long we keep things in cache
    cacheExpiry: {
        channels: 24,    // hours
        videos: 12,      // hours
        categories: 48,  // hours
        playlists: 24   // hours
    }
};

// Function to initialize configuration
export async function initConfig() {
    try {
        const response = await fetch('/api/config');
        const config = await response.json();
        GEMINI_API_KEY = config.geminiApiKey;
        return config;
    } catch (error) {
        console.error('Error loading configuration:', error);
        throw error;
    }
}

// Export the Gemini API key getter
export function getGeminiApiKey() {
    return GEMINI_API_KEY;
} 
