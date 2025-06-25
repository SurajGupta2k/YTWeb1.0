    // intenintentionally pushed this check something it not actually keys 
    # YouTube API Keys
    YOUTUBE_API_KEY_1=AIzaSyACa-u0MCCbw5TEU2cw7qTgy4mmKq8_KWI
    YOUTUBE_API_KEY_2=AIzaSyARk_biBXGLZEfuMXm2plw9QDmsrSlld0w
    YOUTUBE_API_KEY_3=AIzaSyAfAxofftgj_r1LP1KcvTHof94AIgFL1l8
    YOUTUBE_API_KEY_4=AIzaSyDFrOkjC18GKf2kkLuagJm_irsNcuCYBRY
    YOUTUBE_API_KEY_5=AIzaSyBJPNjjSjSLU0l0Y_rQ0af0Z7elWNNrgbQ
    
    # MongoDB Connection URI
    MONGODB_URI=mongodb+srv://tempid3738:gh9tnaN5rLz4FIxG@cluster0.mkvbq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
    
    # Gemini API Key
    GEMINI_API_KEY=AIzaSyAbPUZqTr7vR0nMrnL2-L_NS-3_sjvcvnY 
    
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes with debug logging
console.log('Mounting API routes...');
app.use('/api', apiRoutes);
console.log('API routes mounted');

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).send('Something broke!');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// List all registered routes for debugging
console.log('\nRegistered Routes:');
app._router.stack.forEach(middleware => {
    if (middleware.route) {
        // Routes registered directly on the app
        console.log(`${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
        // Router middleware
        middleware.handle.stack.forEach(handler => {
            if (handler.route) {
                const path = handler.route.path;
                const methods = Object.keys(handler.route.methods);
                console.log(`${methods} /api${path}`);
            }
        });
    }
});

app.listen(PORT, () => {
    console.log(`\nServer is running on http://localhost:${PORT}`);
}); 
