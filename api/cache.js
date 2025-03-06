import { MongoClient } from 'mongodb';

// MongoDB connection string from environment variable
const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error('Please add your MongoDB URI to .env.local');
}

// MongoDB connection cache
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }

    const client = await MongoClient.connect(uri);
    const db = client.db('tubesort'); // Your database name

    cachedDb = db;
    return db;
}

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const db = await connectToDatabase();

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

        if (req.method === 'POST') {
            const { collection, key, data } = req.body;

            if (!collection || !key || !data) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const result = await db.collection(collection).updateOne(
                { key },
                {
                    $set: {
                        key,
                        data,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );

            return res.status(200).json({ success: true, result });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error', message: error.message });
    }
} 