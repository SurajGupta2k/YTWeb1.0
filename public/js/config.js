// Hey! Here's how to get your Gemini API key:
// Just head over to https://makersuite.google.com/app/apikey
// Log in with Google, make a new key, and pop it in below
export const GEMINI_API_KEY = 'AIzaSyAbPUZqTr7vR0nMrnL2-L_NS-3_sjvcvnY';

// Where we'll be making our API calls to
export const API_ENDPOINTS = {
    YOUTUBE_BASE: 'https://www.googleapis.com/youtube/v3',
    GEMINI_BASE: 'https://generativelanguage.googleapis.com/v1beta'
};

// All our MongoDB stuff lives here
export const DB_CONFIG = {
    // Connection string to our MongoDB cluster
    uri: 'mongodb+srv://
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
