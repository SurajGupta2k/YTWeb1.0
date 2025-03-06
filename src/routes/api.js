import express from 'express';
import { MongoClient } from 'mongodb';
import { DB_CONFIG } from '../../public/js/config.js';

const router = express.Router();

// Set up MongoDB connection
const client = new MongoClient(DB_CONFIG.uri);

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

        // Connect to MongoDB if we're not already connected
        if (!client.topology || !client.topology.isConnected()) {
            console.log('[API] Reconnecting to MongoDB...');
            await client.connect();
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

export default router; 