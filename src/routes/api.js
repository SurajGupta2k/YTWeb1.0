import express from 'express';
import { MongoClient } from 'mongodb';
import { DB_CONFIG } from '../../public/js/config.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const router = express.Router();

// Key rotation tracking
const keyUsageTracking = {
    youtube: {
        currentKeyIndex: 0,
        quotaResets: new Map(), // Tracks when each key's quota resets
        usageCount: new Map(), // Tracks how many times each key has been used
    }
};

// Initialize key tracking
function initializeKeyTracking() {
    const youtubeApiKeys = [
        process.env.YOUTUBE_API_KEY_1,
        process.env.YOUTUBE_API_KEY_2,
        process.env.YOUTUBE_API_KEY_3,
        process.env.YOUTUBE_API_KEY_4,
        process.env.YOUTUBE_API_KEY_5
    ].filter(Boolean);

    youtubeApiKeys.forEach((key, index) => {
        keyUsageTracking.youtube.quotaResets.set(index, new Date());
        keyUsageTracking.youtube.usageCount.set(index, 0);
    });
}

// Function to rotate YouTube API key
function rotateYoutubeKey() {
    const youtubeApiKeys = [
        process.env.YOUTUBE_API_KEY_1,
        process.env.YOUTUBE_API_KEY_2,
        process.env.YOUTUBE_API_KEY_3,
        process.env.YOUTUBE_API_KEY_4,
        process.env.YOUTUBE_API_KEY_5
    ].filter(Boolean);

    keyUsageTracking.youtube.currentKeyIndex = 
        (keyUsageTracking.youtube.currentKeyIndex + 1) % youtubeApiKeys.length;
    
    // Reset usage count for the new key if it's been more than 24 hours
    const lastReset = keyUsageTracking.youtube.quotaResets.get(keyUsageTracking.youtube.currentKeyIndex);
    const now = new Date();
    if (lastReset && (now - lastReset) >= 24 * 60 * 60 * 1000) {
        keyUsageTracking.youtube.usageCount.set(keyUsageTracking.youtube.currentKeyIndex, 0);
        keyUsageTracking.youtube.quotaResets.set(keyUsageTracking.youtube.currentKeyIndex, now);
    }

    return youtubeApiKeys[keyUsageTracking.youtube.currentKeyIndex];
}

// Initialize key tracking on startup
initializeKeyTracking();

// Verify required environment variables
if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set in environment variables');
    process.exit(1);
}

// Set up MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI);

// Test MongoDB connection
async function testConnection() {
    try {
        await client.connect();
        console.log('Successfully connected to MongoDB');
        await client.close();
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1);
    }
}

// Test connection on startup
testConnection();

// Middleware to handle caching logic
const cacheMiddleware = async (req, res, next) => {
    try {
        console.log('[API] Cache middleware request:', {
            method: req.method,
            query: req.query,
            body: req.body
        });

        // Figure out which collection we're working with
        const collection = req.method === 'GET' ? req.query.collection : req.body.collection;
        
        console.log('[API] Processing collection:', collection);
        
        // Make sure the collection is valid
        if (!collection || !DB_CONFIG.collections[collection]) {
            console.error('[API] Invalid collection:', collection);
            return res.status(400).json({ error: `Invalid collection: ${collection}. Valid collections are: ${Object.keys(DB_CONFIG.collections).join(', ')}` });
        }

        try {
            // Connect to MongoDB if we're not already connected
            if (!client.topology || !client.topology.isConnected()) {
                console.log('[API] Reconnecting to MongoDB...');
                await client.connect();
            }
        } catch (error) {
            console.error('[API] MongoDB connection error:', error);
            return res.status(500).json({ error: 'Database connection error' });
        }

        // Add the collection to the request object so routes can use it
        req.dbCollection = client.db(DB_CONFIG.dbName).collection(DB_CONFIG.collections[collection]);
        next();
    } catch (error) {
        console.error('[API] Cache middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get data from cache
router.get('/cache', cacheMiddleware, async (req, res) => {
    try {
        console.log('[API] Get cache request:', req.query);
        const { key } = req.query;
        if (!key) {
            console.error('[API] No key provided');
            return res.status(400).json({ error: 'Key is required' });
        }

        // Try to find the data
        const data = await req.dbCollection.findOne({ key });
        console.log('[API] Found data:', data ? 'yes' : 'no');

        if (!data) {
            return res.status(404).json({ error: 'Cache not found' });
        }

        // Remove expired data
        if (data.expiresAt && new Date() > new Date(data.expiresAt)) {
            console.log('[API] Cache expired, deleting...');
            await req.dbCollection.deleteOne({ key });
            return res.status(404).json({ error: 'Cache expired' });
        }

        res.json({ data });
    } catch (error) {
        console.error('[API] Get cache error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Save data to cache
router.post('/cache', cacheMiddleware, async (req, res) => {
    try {
        console.log('[API] Store cache request:', {
            key: req.body.key,
            collection: req.body.collection,
            dataSize: req.body.data ? Object.keys(req.body.data).length : 0
        });

        // Make sure we have all the required data
        const { key, data, collection } = req.body;
        if (!key || !data || !collection) {
            console.error('[API] Missing required fields');
            return res.status(400).json({ error: 'Key, data, and collection are required' });
        }

        // Calculate when this cache should expire
        const expiryHours = DB_CONFIG.cacheExpiry[collection] || 24;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiryHours);

        // Add some metadata to the cache
        const cacheData = {
            key,
            ...data,
            collection,
            expiresAt,
            updatedAt: new Date(),
            cacheVersion: '1.0'
        };

        // Save it to the database
        console.log('[API] Storing data with key:', key);
        const result = await req.dbCollection.updateOne(
            { key },
            { $set: cacheData },
            { upsert: true }
        );

        console.log('[API] Store result:', {
            matched: result.matchedCount,
            modified: result.modifiedCount,
            upserted: result.upsertedCount
        });

        res.json({ 
            message: 'Cache stored successfully',
            expiresAt,
            operation: result.upsertedCount > 0 ? 'inserted' : 'updated'
        });
    } catch (error) {
        console.error('[API] Store cache error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get everything in a collection
router.get('/cache/all/:collection', async (req, res) => {
    try {
        const { collection } = req.params;
        if (!DB_CONFIG.collections[collection]) {
            return res.status(400).json({ error: 'Invalid collection' });
        }

        // Get all non-expired items
        const db = client.db(DB_CONFIG.dbName);
        const data = await db.collection(DB_CONFIG.collections[collection])
            .find({ 
                expiresAt: { $gt: new Date() } 
            })
            .project({ 
                key: 1, 
                updatedAt: 1, 
                expiresAt: 1,
                totalVideos: 1,
                playlistId: 1,
                channelId: 1
            })
            .toArray();

        res.json({ data });
    } catch (error) {
        console.error('Get all cache error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Clean up old cache entries
router.delete('/cache/expired', async (req, res) => {
    try {
        const collections = Object.values(DB_CONFIG.collections);
        const results = await Promise.all(
            collections.map(async (collectionName) => {
                const collection = client.db(DB_CONFIG.dbName).collection(collectionName);
                const result = await collection.deleteMany({
                    expiresAt: { $lt: new Date() }
                });
                return { collection: collectionName, deleted: result.deletedCount };
            })
        );

        res.json({ 
            message: 'Expired cache cleaned', 
            results,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Clean cache error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Check how the cache is doing
router.get('/cache/status', async (req, res) => {
    try {
        const collections = Object.values(DB_CONFIG.collections);
        const status = await Promise.all(
            collections.map(async (collectionName) => {
                const collection = client.db(DB_CONFIG.dbName).collection(collectionName);
                const total = await collection.countDocuments();
                const expired = await collection.countDocuments({
                    expiresAt: { $lt: new Date() }
                });
                const active = await collection.countDocuments({
                    expiresAt: { $gt: new Date() }
                });
                return {
                    collection: collectionName,
                    total,
                    expired,
                    active
                };
            })
        );

        res.json({ 
            status,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Cache status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to get API keys securely with rotation support
router.get('/config', (req, res) => {
    const youtubeApiKeys = [
        process.env.YOUTUBE_API_KEY_1,
        process.env.YOUTUBE_API_KEY_2,
        process.env.YOUTUBE_API_KEY_3,
        process.env.YOUTUBE_API_KEY_4,
        process.env.YOUTUBE_API_KEY_5
    ].filter(Boolean);

    if (youtubeApiKeys.length === 0) {
        console.error('No YouTube API keys found in environment variables');
        return res.status(500).json({ error: 'YouTube API keys not configured' });
    }

    if (!process.env.GEMINI_API_KEY) {
        console.error('Gemini API key not found in environment variables');
        return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Get current YouTube API key
    const currentKey = youtubeApiKeys[keyUsageTracking.youtube.currentKeyIndex];
    
    // Increment usage count for current key
    const currentUsage = keyUsageTracking.youtube.usageCount.get(keyUsageTracking.youtube.currentKeyIndex) || 0;
    keyUsageTracking.youtube.usageCount.set(keyUsageTracking.youtube.currentKeyIndex, currentUsage + 1);

    // Check if we need to rotate the key (e.g., if usage is high)
    if (currentUsage >= 100) { // Threshold for rotation
        const newKey = rotateYoutubeKey();
        console.log(`Rotating YouTube API key due to high usage. New key index: ${keyUsageTracking.youtube.currentKeyIndex}`);
        res.json({
            youtubeApiKeys: [newKey, ...youtubeApiKeys.filter(k => k !== newKey)],
            geminiApiKey: process.env.GEMINI_API_KEY,
            keyRotated: true
        });
    } else {
        res.json({
            youtubeApiKeys: [currentKey, ...youtubeApiKeys.filter(k => k !== currentKey)],
            geminiApiKey: process.env.GEMINI_API_KEY,
            keyRotated: false
        });
    }
});

// Endpoint to manually rotate YouTube API key
router.post('/rotate-key', (req, res) => {
    const newKey = rotateYoutubeKey();
    const youtubeApiKeys = [
        process.env.YOUTUBE_API_KEY_1,
        process.env.YOUTUBE_API_KEY_2,
        process.env.YOUTUBE_API_KEY_3,
        process.env.YOUTUBE_API_KEY_4,
        process.env.YOUTUBE_API_KEY_5
    ].filter(Boolean);

    res.json({
        youtubeApiKeys: [newKey, ...youtubeApiKeys.filter(k => k !== newKey)],
        currentKeyIndex: keyUsageTracking.youtube.currentKeyIndex,
        keyRotated: true
    });
});

// Endpoint to get key usage statistics
router.get('/key-usage', (req, res) => {
    const stats = {
        currentKeyIndex: keyUsageTracking.youtube.currentKeyIndex,
        usage: Array.from(keyUsageTracking.youtube.usageCount.entries()).map(([index, count]) => ({
            keyIndex: index,
            usageCount: count,
            lastReset: keyUsageTracking.youtube.quotaResets.get(index)
        }))
    };
    res.json(stats);
});

export default router; 