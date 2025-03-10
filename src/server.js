// Import dotenv for environment variables
import dotenv from 'dotenv';
dotenv.config();

// Import the stuff we need
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import apiRoutes from './routes/api.js';

// Fix __dirname not working in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create our Express app and set the port
const app = express();
const PORT = process.env.PORT || 3000;

// Set up some basic middleware
app.use(cors()); // Allow cross-origin requests
// Let's handle big JSON payloads (up to 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Hook up our API routes
app.use('/api', apiRoutes);

// Handle any errors nicely
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Send our main page for the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Simple endpoint to check if server is alive
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

// Fire it up! 
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 