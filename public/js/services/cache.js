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
export async function cacheData(key, data, collection = 'videos') {
    try {
        console.log(`[Cache] Storing data for key: ${key} in collection: ${collection}`);
        console.log('[Cache] Data to store:', data);
        updateLoadingStatus('Storing data in cache...', true);
        
        const cachePayload = { key, data, collection };
        console.log('[Cache] Sending payload:', cachePayload);
        
        const response = await fetch('/api/cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cachePayload)
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