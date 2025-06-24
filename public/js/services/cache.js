import { updateLoadingStatus } from '../ui/renderer.js';

// Before we ask YouTube for data, we check our own cache first.
// It's way faster if we already have what we're looking for.
export async function getCachedData(key, collection = 'videos') {
    try {
        console.log(`[Cache] Checking cache for key: ${key.substring(0, 100)}... in collection: ${collection}`);
        updateLoadingStatus('Checking cache...', true);
        
        const response = await fetch(`/api/cache/get`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, collection })
        });
        
        console.log(`[Cache] Response status: ${response.status}`);
        const result = await response.json();
        console.log('[Cache] Response data:', result);

        if (response.status === 404 || !result.data) {
            console.log('[Cache] Cache miss');
            updateLoadingStatus('Cache miss, fetching from YouTube API...');
            return null;
        }
        
        console.log('[Cache] Cache hit:', result.data);
        updateLoadingStatus('Found in cache!', true, false, true);
        return result.data;
    } catch (error) {
        console.error('[Cache] Error getting cached data:', error);
        updateLoadingStatus('Cache error, falling back to YouTube API...');
        return null;
    }
}

// Once we've fetched new data from YouTube, we store it in our cache.
// This helps us avoid making the same request over and over.
async function cacheDataInChunks(key, videos, collection) {
    const CHUNK_SIZE = 150; // Number of videos per chunk
    const totalChunks = Math.ceil(videos.length / CHUNK_SIZE);
    console.log(`[Cache] Splitting ${videos.length} videos into ${totalChunks} chunks.`);

    for (let i = 0; i < totalChunks; i++) {
        updateLoadingStatus(`Caching data to DB... (Chunk ${i + 1}/${totalChunks})`, true);
        const chunk = videos.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        
        const payload = {
            key,
            collection,
            chunk,
            isFirstChunk: i === 0
        };

        const response = await fetch('/api/cache-chunk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to cache chunk ${i + 1}: ${errorText}`);
        }
        console.log(`[Cache] Chunk ${i + 1}/${totalChunks} cached successfully.`);
    }
    console.log('[Cache] All chunks cached successfully.');
}

export async function cacheData(key, data, collection = 'videos') {
    const MAX_PAYLOAD_SIZE = 4 * 1024 * 1024; // 4MB Vercel limit

    try {
        const payload = JSON.stringify({ key, data, collection });

        if (payload.length > MAX_PAYLOAD_SIZE) {
            console.warn(`[Cache] Payload for key "${key}" is too large, attempting to cache in chunks.`);
            if (data.videos && Array.isArray(data.videos)) {
                await cacheDataInChunks(key, data.videos, collection);
            } else {
                console.error("[Cache] Data is too large but doesn't have a 'videos' array to chunk. Skipping.");
            }
            return;
        }
        
        console.log(`[Cache] Storing data for key: ${key} in collection: ${collection}`);
        console.log('[Cache] Data to store:', data);
        updateLoadingStatus('Storing data in cache...', true);
        
        const response = await fetch('/api/cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('[Cache] Store response:', result);

        if (!response.ok) {
            throw new Error(`Failed to cache data: ${result.error || 'Unknown error'}`);
        }

        updateLoadingStatus('Data cached successfully!', true, false, true);
        console.log('[Cache] Data stored successfully');
        return result;
    } catch (error) {
        console.error('[Cache] Error caching data:', error);
        updateLoadingStatus('Failed to cache data', false);
        throw error;
    }
} 