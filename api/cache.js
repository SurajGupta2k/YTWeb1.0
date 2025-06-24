import { MongoClient } from 'mongodb';

// Get MongoDB connection string from environment variables
const uri = process.env.MONGODB_URI;
if (!uri) {
    throw new Error('MongoDB URI is missing in the environment variables');
}

// Cache the database connection to reuse it
let cachedDb = null;

// Connect to the database, reuse the connection if already established
async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    const client = await MongoClient.connect(uri);
    const db = client.db('tubesort');
    cachedDb = db;
    return db;
}

// Handle API requests for caching data
export default async function handler(req, res) {
    // Set headers for CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Respond to OPTIONS requests for CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const db = await connectToDatabase();

        // Handle GET requests to retrieve cached data
        if (req.method === 'GET') {
            const { collection, key } = req.query;
            if (!collection || !key) {
                return res.status(400).json({ error: 'Missing collection or key parameter' });
            }
            const result = await db.collection(collection).findOne({ key });
            if (!result) {
                return res.status(404).json({ error: 'Not found' });
            }
            return res.status(200).json({ data: result.data });
        }

        // Handle POST requests to store or update cached data
        if (req.method === 'POST') {
            const { collection, key, data } = req.body;
            if (!collection || !key || !data) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }
            const result = await db.collection(collection).updateOne(
                { key },
                { $set: { key, data, updatedAt: new Date() } },
                { upsert: true }
            );
            return res.status(200).json({ success: true, result });
        }

        // Respond with an error for unsupported methods
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
} 