import express from 'express';
import { MongoClient } from 'mongodb';
import { DB_CONFIG } from '../../public/js/config.js';
import dotenv from 'dotenv';

// This file sets up all our server-side API routes.
// It handles things like talking to the database for caching,
// managing our API keys so we don't run out of quota,
// and a few other utility tasks.
dotenv.config();

const router = express.Router();

// We have a bunch of YouTube API keys to avoid hitting our daily limits.
// This section handles automatically switching to a fresh key when one has been used too much.
const keyUsageTracking = {
    youtube: {
        currentKeyIndex: 0,
        quotaResets: new Map(),
        usageCount: new Map(),
    }
};

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
    
    const lastReset = keyUsageTracking.youtube.quotaResets.get(keyUsageTracking.youtube.currentKeyIndex);
    const now = new Date();
    if (lastReset && (now - lastReset) >= 24 * 60 * 60 * 1000) {
        keyUsageTracking.youtube.usageCount.set(keyUsageTracking.youtube.currentKeyIndex, 0);
        keyUsageTracking.youtube.quotaResets.set(keyUsageTracking.youtube.currentKeyIndex, now);
    }

    return youtubeApiKeys[keyUsageTracking.youtube.currentKeyIndex];
}

initializeKeyTracking();

if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set in environment variables');
    process.exit(1);
}

// Here we connect to our MongoDB database. We also have a quick check
// to make sure the connection works when the server starts.
const client = new MongoClient(process.env.MONGODB_URI);

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

testConnection();

// This is a helper that runs before our cache-related routes.
// It figures out which database collection to use based on the request
// and makes sure we're connected to the database.
const cacheMiddleware = async (req, res, next) => {
    try {
        console.log('[API] Cache middleware request:', {
            method: req.method,
            query: req.query,
            body: req.body
        });

        const collection = req.method === 'GET' ? req.query.collection : req.body.collection;
        
        console.log('[API] Processing collection:', collection);
        
        if (!collection || !DB_CONFIG.collections[collection]) {
            console.error('[API] Invalid collection:', collection);
            return res.status(400).json({ error: `Invalid collection: ${collection}. Valid collections are: ${Object.keys(DB_CONFIG.collections).join(', ')}` });
        }

        try {
            if (!client.topology || !client.topology.isConnected()) {
                console.log('[API] Reconnecting to MongoDB...');
                await client.connect();
            }
        } catch (error) {
            console.error('[API] MongoDB connection error:', error);
            return res.status(500).json({ error: 'Database connection error' });
        }

        req.dbCollection = client.db(DB_CONFIG.dbName).collection(DB_CONFIG.collections[collection]);
        next();
    } catch (error) {
        console.error('[API] Cache middleware error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// These routes are for basic cache operations: getting and saving items.
// We use the cache to avoid making the same API calls over and over again.
router.get('/cache', cacheMiddleware, async (req, res) => {
    try {
        console.log('[API] Get cache request:', req.query);
        const { key } = req.query;
        if (!key) {
            console.error('[API] No key provided');
            return res.status(400).json({ error: 'Key is required' });
        }

        const data = await req.dbCollection.findOne({ key });
        console.log('[API] Found data:', data ? 'yes' : 'no');

        if (!data) {
            return res.status(404).json({ error: 'Cache not found' });
        }

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

// This is just like the GET route above, but uses POST. This is useful
// for when the cache 'key' is very long and might not fit in a URL.
router.post('/cache/get', cacheMiddleware, async (req, res) => {
    try {
        const { key, collection } = req.body;
        if (!key || !collection) {
            return res.status(400).json({ error: 'Key and collection are required' });
        }

        const data = await req.dbCollection.findOne({ key });

        if (!data) {
            return res.status(404).json({ error: 'Cache not found' });
        }

        if (data.expiresAt && new Date() > new Date(data.expiresAt)) {
            await req.dbCollection.deleteOne({ key });
            return res.status(404).json({ error: 'Cache expired' });
        }

        res.json({ data });
    } catch (error) {
        console.error('[API] POST Get cache error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/cache', cacheMiddleware, async (req, res) => {
    try {
        console.log('[API] Store cache request:', {
            key: req.body.key,
            collection: req.body.collection,
            dataSize: req.body.data ? Object.keys(req.body.data).length : 0
        });

        const { key, data, collection } = req.body;
        if (!key || !data || !collection) {
            console.error('[API] Missing required fields');
            return res.status(400).json({ error: 'Key, data, and collection are required' });
        }

        const expiryHours = DB_CONFIG.cacheExpiry[collection] || 24;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiryHours);

        const cacheData = {
            key,
            ...data,
            collection,
            expiresAt,
            updatedAt: new Date(),
            cacheVersion: '1.0'
        };

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

// A few routes for housekeeping and checking on the cache.
// We can see the overall status, get all items, or clean out old data.
router.get('/cache/all/:collection', async (req, res) => {
    try {
        const { collection } = req.params;
        if (!DB_CONFIG.collections[collection]) {
            return res.status(400).json({ error: 'Invalid collection' });
        }

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

// This is the main endpoint our front-end uses to get the API keys it needs.
// It gives out the current YouTube key and automatically rotates to the next one
// if the current one is getting close to its usage limit.
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

    const currentKey = youtubeApiKeys[keyUsageTracking.youtube.currentKeyIndex];
    
    const currentUsage = keyUsageTracking.youtube.usageCount.get(keyUsageTracking.youtube.currentKeyIndex) || 0;
    keyUsageTracking.youtube.usageCount.set(keyUsageTracking.youtube.currentKeyIndex, currentUsage + 1);

    if (currentUsage >= 100) {
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

// Some extra routes for managing and checking on our API keys.
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

// A neat little utility to find a YouTube channel's ID from its user-friendly handle (e.g., '@username').
// It works by fetching the channel's page and finding the ID in the HTML source code.
router.get('/resolve-handle', async (req, res) => {
    const { handle } = req.query;
    if (!handle) {
        return res.status(400).json({ error: 'Handle is required' });
    }

    try {
        const response = await fetch(`https://www.youtube.com/@${handle}`);
        if (!response.ok) {
            throw new Error(`YouTube handle '@${handle}' not found or network error.`);
        }
        const html = await response.text();
        
        const match = html.match(/<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(UC[\w-]{22})">/);
        
        if (match && match[1]) {
            const channelId = match[1];
            res.json({ channelId });
        } else {
            throw new Error(`Could not resolve channel ID for handle '@${handle}'. The page structure might have changed.`);
        }
    } catch (error) {
        console.error(`[API/resolve-handle] Error: ${error.message}`);
        res.status(404).json({ error: error.message });
    }
});

export default router;