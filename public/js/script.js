// This is the main script that handles all YouTube video loading and display
// It uses YouTube API to fetch videos and show them in a nice grid layout
// Written by: [Your Name]

// Import configuration
import { getGeminiApiKey, API_ENDPOINTS, initConfig } from './config.js';

// API keys for YouTube - we use multiple keys to handle quota limits
let apiKeys = [];

// Keep track of which API key we're currently using
let currentApiKeyIndex = 0;

// Global variables to store video data and state
const globalState = {
    videos: [],
    channelId: '',
    channelSearchMode: false
};

// Cache management
async function getCachedData(key, collection = 'videos') {
    try {
        console.log(`[Cache] Checking cache for key: ${key} in collection: ${collection}`);
        updateLoadingStatus('Checking cache...', true);
        const response = await fetch(`/api/cache?collection=${collection}&key=${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
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

async function cacheData(key, data, collection = 'videos') {
    try {
        console.log(`[Cache] Storing data for key: ${key} in collection: ${collection}`);
        console.log('[Cache] Data to store:', data);
        updateLoadingStatus('Storing data in cache...', true);
        
        const cachePayload = {
            key,
            data,
            collection
        };

        console.log('[Cache] Sending payload:', cachePayload);
        
        const response = await fetch('/api/cache', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
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

// Get current API key from the rotation
function getCurrentApiKey() {
    return apiKeys[0]; // Always use the first key as it's the current one
}

// Rotate to next API key when quota is exceeded
async function rotateApiKey() {
    try {
        const response = await fetch('/api/rotate-key', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.keyRotated) {
            apiKeys = data.youtubeApiKeys; // Update the local keys array with the new rotation
            console.log('API key rotated successfully');
            return getCurrentApiKey();
        } else {
            throw new Error('Failed to rotate API key');
        }
    } catch (error) {
        console.error('Error rotating API key:', error);
        throw error;
    }
}

// Track API usage and errors
const apiUsage = {
    requests: 0,
    errors: 0,
    quotaExceeded: 0,
    lastRotation: null
};

// Handle API errors consistently
async function handleApiError(error, retryFunction, ...args) {
    apiUsage.errors++;
    
    if (error.message.includes('quota') || 
        (error.response && error.response.status === 403) || 
        error.message.includes('quotaExceeded')) {
        
        apiUsage.quotaExceeded++;
        apiUsage.lastRotation = new Date();
        
        try {
            await rotateApiKey();
            return retryFunction(...args);
        } catch (rotationError) {
            console.error('Failed to rotate API key:', rotationError);
            throw new Error('All API keys have exceeded their quota. Please try again later.');
        }
    }
    
    throw error;
}

// Check if a video is a livestream based on its metadata
function isStreamVideo(videoItem) {
    if (!videoItem.liveStreamingDetails) {
        return false;
    }

    const hasActualStartTime = !!videoItem.liveStreamingDetails.actualStartTime;
    const hasScheduledStartTime = !!videoItem.liveStreamingDetails.scheduledStartTime;
    
    return hasActualStartTime || hasScheduledStartTime;
}

// Global state management
let videos = [];
let channelId = '';
let channelSearchMode = false;

// Initialize YouTube API
function initYouTubeAPI() {
    return new Promise((resolve, reject) => {
        gapi.load('client', () => {
            gapi.client.init({
                apiKey: getCurrentApiKey(),
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
            }).then(() => {
                console.log('YouTube API initialized');
                resolve();
            }).catch(error => {
                console.error('Error initializing YouTube API:', error);
                reject(error);
            });
        });
    });
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load configuration first
        const config = await initConfig();
        apiKeys = config.youtubeApiKeys;
        
        await initYouTubeAPI();
        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize:', error);
        alert('Failed to initialize the application. Please try again later.');
    }
});

// Initialize event listeners when DOM is ready
function setupEventListeners() {
    document.getElementById('load-content').addEventListener('click', loadContent);
    document.getElementById('sort-old-new').addEventListener('click', () => sortPlaylist(true));
    document.getElementById('sort-new-old').addEventListener('click', () => sortPlaylist(false));
    document.getElementById('sort-views').addEventListener('click', sortByViews);
    document.getElementById('search-video').addEventListener('click', searchVideo);
    document.getElementById('load-videos').addEventListener('click', () => loadChannelData('videos'));
    document.getElementById('load-streams').addEventListener('click', () => loadChannelData('streams'));
    document.getElementById('categorize-videos').addEventListener('click', categorizeVideos);

    // Add refresh button
    const refreshButton = document.createElement('button');
    refreshButton.className = 'refresh-button';
    refreshButton.setAttribute('aria-label', 'Refresh page');
    refreshButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
    `;
    document.body.appendChild(refreshButton);

    refreshButton.addEventListener('click', () => {
        refreshButton.classList.add('refreshing');
        window.location.reload();
    });

    // Create scroll to top button
    const scrollToTopButton = document.createElement('button');
    scrollToTopButton.className = 'scroll-to-top';
    scrollToTopButton.setAttribute('aria-label', 'Scroll to top');
    scrollToTopButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
        </svg>
    `;
    document.body.appendChild(scrollToTopButton);

    // Handle scroll event
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            scrollToTopButton.classList.add('visible');
        } else {
            scrollToTopButton.classList.remove('visible');
        }
    });

    // Handle click event
    scrollToTopButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Add this new function to clear all content and reset state
function clearContent() {
    // Clear videos array
    videos = [];
    
    // Clear UI elements
    const videoList = document.getElementById('video-list');
    const categoriesView = document.getElementById('categories-view');
    const categoriesContainer = categoriesView.querySelector('div');
    
    // Reset video list
    videoList.innerHTML = '';
    videoList.style.display = 'grid';
    
    // Reset categories view
    categoriesView.style.display = 'none';
    categoriesContainer.innerHTML = '';
    
    // Remove any existing return to grid button
    const existingReturnButton = document.querySelector('button.fixed.bottom-4.right-4');
    if (existingReturnButton) {
        existingReturnButton.remove();
    }
    
    // Reset channel-specific UI
    document.getElementById('channel-options').style.display = 'none';
    channelSearchMode = false;
    channelId = '';
}

// Modified loadContent function
async function loadContent() {
    const loadingElement = document.getElementById('loading');
    loadingElement.style.display = 'block';
    
    // Clear previous content first
    clearContent();
    
    const url = document.getElementById('playlist-url').value.trim();

    try {
        if (!url) {
            throw new Error('Please enter a YouTube channel URL or playlist URL');
        }

        const playlistIdMatch = url.match(/list=([^&]+)/);
        
        if (playlistIdMatch) {
            // Handle playlist URL
            await loadPlaylistData(playlistIdMatch[1]);
        } else if (url.match(/^https?:\/\/(www\.)?youtube\.com\/@[\w-]+$/)) {
            // Handle channel URL with more flexible validation
            const channelHandle = url.split('@')[1];
            channelSearchMode = true;
            await getChannelId(channelHandle);
        } else if (url.match(/^https?:\/\/(www\.)?youtube\.com\/channel\/[A-Za-z0-9_-]{24}$/)) {
            // Handle direct channel ID URL
            const channelIdMatch = url.match(/channel\/([^/?]+)/);
            if (!channelIdMatch) {
                throw new Error('Invalid channel URL format');
            }
            channelSearchMode = true;
            channelId = channelIdMatch[1];
            await getChannelDetails(channelId);
        } else {
            throw new Error('Please enter a valid YouTube channel URL (e.g., https://youtube.com/@username) or playlist URL');
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.message.includes('quota')) {
            alert('API quota exceeded. Switching to another API key...');
            rotateApiKey();
            await loadContent(); // Retry with new API key
        } else {
            alert(error.message || 'An error occurred while loading the data. Please try again.');
            const videoList = document.getElementById('video-list');
            videoList.innerHTML = `<p class="text-red-500 text-center p-4">${error.message}</p>`;
        }
    } finally {
        loadingElement.style.display = 'none';
    }
}

// New function to get channel details directly from channel ID
async function getChannelDetails(channelId) {
    try {
        const channelResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${getCurrentApiKey()}`
        );
        const channelData = await channelResponse.json();
        
        if (!channelResponse.ok) {
            if (channelData.error?.message?.includes('quota')) {
                throw new Error('quota exceeded');
            }
            throw new Error(channelData.error?.message || 'Failed to fetch channel details');
        }

        if (!channelData.items?.length) {
            throw new Error('Channel details not found');
        }

        const channelItem = channelData.items[0];
        if (!channelItem?.contentDetails?.relatedPlaylists?.uploads) {
            throw new Error('Channel uploads playlist not found');
        }

        window.uploadsPlaylistId = channelItem.contentDetails.relatedPlaylists.uploads;
        showChannelOptions();
    } catch (error) {
        if (error.message.includes('quota')) {
            throw error;
        }
        throw new Error('Failed to load channel details. Please try again.');
    }
}

// Modified getChannelId function with caching
async function getChannelId(channelHandle) {
    if (!channelHandle) {
        throw new Error('Channel handle is required');
    }

    // Check cache first
    const cachedData = await getCachedData(`channel_${channelHandle}`);
    if (cachedData && new Date() < new Date(cachedData.expiresAt)) {
        console.log('Using cached channel data');
        channelId = cachedData.channelId;
        window.uploadsPlaylistId = cachedData.uploadsPlaylistId;
        showChannelOptions();
        return;
    }

    try {
        // If not in cache, fetch from YouTube API
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent('@' + channelHandle)}&type=channel&key=${getCurrentApiKey()}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        if (!searchResponse.ok) {
            if (searchData.error?.message?.includes('quota')) {
                throw new Error('quota exceeded');
            }
            throw new Error(searchData.error?.message || 'Failed to search for channel');
        }

        if (!searchData.items?.length) {
            throw new Error(`Channel '@${channelHandle}' not found. Please check the channel name and try again.`);
        }

        const channel = searchData.items[0];
        if (!channel?.id?.channelId) {
            throw new Error('Invalid channel data received');
        }

        channelId = channel.id.channelId;
        
        // Get channel details including uploads playlist ID
        const channelResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${getCurrentApiKey()}`
        );
        const channelData = await channelResponse.json();
        
        if (!channelResponse.ok) {
            if (channelData.error?.message?.includes('quota')) {
                throw new Error('quota exceeded');
            }
            throw new Error(channelData.error?.message || 'Failed to fetch channel details');
        }

        if (!channelData.items?.length) {
            throw new Error('Channel details not found');
        }

        const channelItem = channelData.items[0];
        if (!channelItem?.contentDetails?.relatedPlaylists?.uploads) {
            throw new Error('Channel uploads playlist not found');
        }

        channelId = channelItem.id;
        window.uploadsPlaylistId = channelItem.contentDetails.relatedPlaylists.uploads;

        // Store in cache
        await cacheData(`channel_${channelHandle}`, {
            channelId: channelId,
            uploadsPlaylistId: window.uploadsPlaylistId,
            channelData: channelData
        });

        showChannelOptions();
    } catch (error) {
        console.error('Error finding channel:', error.message);
        if (error.message.includes('quota')) {
            alert('API quota exceeded. Switching to another API key...');
            rotateApiKey();
            await getChannelId(channelHandle);
        } else {
            throw new Error(error.message || 'Channel not found! Please make sure you entered the correct channel URL.');
        }
    }
}

// Modified loadPlaylistData function
async function loadPlaylistData(playlistId) {
    if (!playlistId) {
        throw new Error('Playlist ID is required');
    }

    console.log(`[Playlist] Loading playlist: ${playlistId}`);
    // Check cache first for playlist data
    const playlistCacheKey = `playlist_${playlistId}`;
    const cachedPlaylist = await getCachedData(playlistCacheKey, 'playlists');
    
    if (cachedPlaylist) {
        console.log('[Playlist] Using cached playlist data');
        updateLoadingStatus('Loading playlist from cache...', true);
        // Convert date strings back to Date objects and ensure videoId is present
        videos = cachedPlaylist.videos.map(video => ({
            ...video,
            videoId: video.videoId, // Ensure videoId is explicitly set
            publishedAt: new Date(video.publishedAt),
            actualStartTime: video.actualStartTime ? new Date(video.actualStartTime) : null,
            playlistId: playlistId // Ensure playlistId is set
        }));
        
        // Always show the grid view first
        displayVideos(videos);
        
        // Reset categories view if it was previously shown
        const categoriesView = document.getElementById('categories-view');
        const videoList = document.getElementById('video-list');
        categoriesView.style.display = 'none';
        videoList.style.display = 'grid';
        
        return;
    }

    // If not in cache, fetch from API
    videos = [];
    let nextPageToken = '';
    let totalFetched = 0;

    try {
        console.log('[Playlist] Fetching from YouTube API');
        updateLoadingStatus('Fetching playlist data from YouTube API...', false);
        do {
            updateLoadingStatus(`Fetching videos from YouTube API (${totalFetched} loaded)...`);
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${getCurrentApiKey()}&pageToken=${nextPageToken}`
            );
            const data = await response.json();

            if (!response.ok) {
                if (data.error?.message?.includes('quota')) {
                    throw new Error('quota exceeded');
                }
                throw new Error(data.error?.message || 'Failed to fetch playlist items');
            }

            console.log(`[Playlist] Fetched ${data.items?.length || 0} items`);
            if (!data.items?.length) {
                break;
            }

            const videoDetails = await Promise.all(data.items.map(async item => {
                try {
                    if (!item?.snippet?.resourceId?.videoId) {
                        return null;
                    }

                    const statsResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails,liveStreamingDetails,status&id=${item.snippet.resourceId.videoId}&key=${getCurrentApiKey()}`
                    );
                    const statsData = await statsResponse.json();

                    if (!statsResponse.ok) {
                        if (statsData.error?.message?.includes('quota')) {
                            throw new Error('quota exceeded');
                        }
                        return null;
                    }

                    if (!statsData.items?.[0]) {
                        return null;
                    }

                    const videoItem = statsData.items[0];
                    totalFetched++;
                    return {
                        title: item.snippet.title,
                        videoId: item.snippet.resourceId.videoId,
                        publishedAt: new Date(item.snippet.publishedAt),
                        actualStartTime: videoItem.liveStreamingDetails?.actualStartTime ? new Date(videoItem.liveStreamingDetails.actualStartTime) : null,
                        viewCount: parseInt(statsData.items[0].statistics.viewCount || '0', 10),
                        isStream: isStreamVideo(videoItem),
                        playlistId: playlistId // Add playlist ID reference
                    };
                } catch (error) {
                    console.error('[Playlist] Error fetching video details:', error);
                    if (error.message.includes('quota')) {
                        throw error;
                    }
                    return null;
                }
            }));

            const validVideos = videoDetails.filter(Boolean);
            console.log(`[Playlist] Added ${validVideos.length} valid videos`);
            videos = videos.concat(validVideos);
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        if (videos.length === 0) {
            throw new Error('No videos found in this playlist');
        }

        console.log(`[Playlist] Total videos fetched: ${videos.length}`);
        // After successfully fetching all videos
        const playlistData = {
            videos,
            playlistId,
            fetchedAt: new Date(),
            totalVideos: videos.length,
            type: 'playlist'
        };

        // Cache the playlist data
        console.log('[Playlist] Caching playlist data');
        await cacheData(playlistCacheKey, playlistData, 'playlists');
        
        displayVideos(videos);
    } catch (error) {
        console.error('[Playlist] Error:', error);
        if (error.message.includes('quota')) {
            alert('API quota exceeded. Switching to another API key...');
            rotateApiKey();
            await loadPlaylistData(playlistId);
        } else {
            throw new Error(error.message || 'Failed to load playlist data');
        }
    }
}

// Modified loadChannelData function with caching
async function loadChannelData(type) {
    if (!channelId || !window.uploadsPlaylistId) {
        alert('Please load a channel first');
        return;
    }

    // Clear previous content before loading new data
    clearContent();
    document.getElementById('channel-options').style.display = 'block'; // Keep channel options visible

    // Check cache first
    const channelCacheKey = `${channelId}_${type}`;
    const cachedChannel = await getCachedData(channelCacheKey, 'channels');
    
    if (cachedChannel) {
        updateLoadingStatus('Loading channel data from cache...', true);
        // Convert date strings back to Date objects
        videos = cachedChannel.videos.map(video => ({
            ...video,
            publishedAt: new Date(video.publishedAt),
            actualStartTime: video.actualStartTime ? new Date(video.actualStartTime) : null
        }));
        displayVideos(videos);
        return;
    }

    // If not in cache, fetch from API
    videos = [];
    let nextPageToken = '';
    let totalFetched = 0;

    try {
        updateLoadingStatus(`Fetching ${type} from YouTube API...`, false);
        do {
            updateLoadingStatus(`Fetching ${type} from YouTube API (${totalFetched} loaded)...`);
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${window.uploadsPlaylistId}&key=${getCurrentApiKey()}&pageToken=${nextPageToken}`
            );
            const data = await response.json();

            if (!response.ok) {
                if (data.error?.message?.includes('quota')) {
                    throw new Error('quota exceeded');
                }
                throw new Error(data.error?.message || response.statusText);
            }

            if (!data.items?.length) {
                break;
            }

            const videoDetails = await Promise.all(data.items.map(async item => {
                try {
                    const videoId = item.snippet.resourceId.videoId;
                    const detailsResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails,liveStreamingDetails,status&id=${videoId}&key=${getCurrentApiKey()}`
                    );
                    const detailsData = await detailsResponse.json();
                    
                    if (!detailsResponse.ok) {
                        if (detailsData.error?.message?.includes('quota')) {
                            throw new Error('quota exceeded');
                        }
                        return null;
                    }

                    if (!detailsData.items?.length) {
                        return null;
                    }

                    const videoItem = detailsData.items[0];
                    const isVideoStream = isStreamVideo(videoItem);
                    
                    // Filter based on content type (stream/video)
                    if ((type === 'streams' && !isVideoStream) || (type !== 'streams' && isVideoStream)) {
                        return null;
                    }

                    return {
                        title: videoItem.snippet.title,
                        videoId: videoId,
                        publishedAt: new Date(videoItem.snippet.publishedAt),
                        actualStartTime: videoItem.liveStreamingDetails?.actualStartTime ? new Date(videoItem.liveStreamingDetails.actualStartTime) : null,
                        viewCount: parseInt(videoItem.statistics.viewCount || 0, 10),
                        channelTitle: videoItem.snippet.channelTitle,
                        description: videoItem.snippet.description,
                        duration: videoItem.contentDetails.duration,
                        isStream: isVideoStream,
                        privacyStatus: videoItem.status.privacyStatus
                    };
                } catch (error) {
                    if (error.message.includes('quota')) {
                        throw error;
                    }
                    console.error("Error fetching video details:", error);
                    return null;
                }
            }));

            const validVideos = videoDetails.filter(video => video !== null);
            videos = videos.concat(validVideos);
            
            totalFetched += validVideos.length;
            updateLoadingStatus(`Processing ${type}... Found ${totalFetched} so far...`);
            
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        if (videos.length === 0) {
            alert(`No ${type === 'streams' ? 'streams' : 'videos'} found for this channel`);
        } else {
            console.log(`Total ${type} found: ${videos.length}`);
            displayVideos(videos);
        }

        // After successfully fetching all videos
        const channelData = {
            videos,
            channelId,
            type,
            fetchedAt: new Date(),
            totalVideos: videos.length
        };

        // Cache the channel data
        await cacheData(channelCacheKey, channelData, 'channels');
        
        displayVideos(videos);
    } catch (error) {
        console.error("Error loading content:", error);
        if (error.message.includes('quota')) {
            alert('API quota exceeded. Switching to another API key...');
            rotateApiKey();
            await loadChannelData(type);
        } else {
            alert(`An error occurred while loading the ${type}. Please try again.`);
        }
    }
}

// Show channel-specific options
function showChannelOptions() {
    document.getElementById('channel-options').style.display = 'block';
}

// Handle video search functionality
function searchVideo() {
    const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
    if (channelSearchMode) {
        searchChannelVideos(searchTerm);
    } else {
        const filteredVideos = videos.filter(video => 
            video.title.toLowerCase().includes(searchTerm)
        );
        videos = filteredVideos; // Store filtered results in global videos array
        filteredVideos.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
        displayVideos(filteredVideos);
    }
}

// Search videos within a specific channel
async function searchChannelVideos(query) {
    if (!channelId) {
        alert('Please load a channel first.');
        return;
    }
    const loadingElement = document.getElementById('loading');
    loadingElement.style.display = 'block';
    const videoList = document.getElementById('video-list');
    videoList.innerHTML = '';
    let nextPageToken = '';
    let searchResults = [];
    
    try {
        do {
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&q=${encodeURIComponent(query)}&maxResults=50&type=video&key=${getCurrentApiKey()}&pageToken=${nextPageToken}`
            );
            const data = await response.json();
            
            if (!response.ok) {
                if (data.error?.message?.includes('quota')) {
                    throw new Error('quota exceeded');
                }
                throw new Error(data.error?.message || response.statusText);
            }

            const videoDetails = await Promise.all(data.items.map(async item => {
                try {
                    const videoId = item.id.videoId;
                    const statsResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails,liveStreamingDetails,status&id=${videoId}&key=${getCurrentApiKey()}`
                    );
                    const statsData = await statsResponse.json();
                    
                    if (!statsResponse.ok) {
                        if (statsData.error?.message?.includes('quota')) {
                            throw new Error('quota exceeded');
                        }
                        return null;
                    }

                    if (!statsData.items?.length) {
                        return null;
                    }

                    const videoItem = statsData.items[0];
                    
                    if (videoItem.snippet.title.toLowerCase().includes(query) || 
                        videoItem.snippet.description.toLowerCase().includes(query)) {
                        return {
                            title: videoItem.snippet.title,
                            videoId: videoId,
                            publishedAt: new Date(videoItem.snippet.publishedAt),
                            viewCount: parseInt(videoItem.statistics.viewCount || 0, 10),
                            isStream: isStreamVideo(videoItem),
                            privacyStatus: videoItem.status.privacyStatus
                        };
                    }
                    return null;
                } catch (error) {
                    if (error.message.includes('quota')) {
                        throw error;
                    }
                    console.error('Error fetching video details:', error);
                    return null;
                }
            }));

            const validVideos = videoDetails.filter(v => v !== null);
            searchResults = searchResults.concat(validVideos);
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);
        
        if (searchResults.length === 0) {
            alert('No videos found for the search query in this channel.');
            return;
        }
        
        searchResults.sort((a, b) => a.publishedAt - b.publishedAt);
        videos = searchResults; // Store search results in global videos array
        displayVideos(searchResults);
    } catch (error) {
        console.error("Error searching channel videos: ", error);
        if (error.message.includes('quota')) {
            alert('API quota exceeded. Switching to another API key...');
            rotateApiKey();
            await searchChannelVideos(query);
        } else {
            alert('An error occurred while searching channel videos. Please try again.');
        }
    } finally {
        loadingElement.style.display = 'none';
    }
}

// Sort playlist by date
function sortPlaylist(oldToNew) {
    if (!videos || videos.length === 0) {
        alert('No videos to sort');
        return;
    }
    
    videos.sort((a, b) => {
        const dateA = new Date(a.publishedAt);
        const dateB = new Date(b.publishedAt);
        return oldToNew ? dateA - dateB : dateB - dateA;
    });
    
    displayVideos(videos);
}

// Display videos in the UI
function displayVideos(videosToDisplay) {
    const videoList = document.getElementById('video-list');
    videoList.innerHTML = '';

    // Show loading states first
    for (let i = 0; i < 8; i++) {
        const loadingItem = document.createElement('li');
        loadingItem.className = 'loading-state';
        loadingItem.innerHTML = `
            <div class="video-card">
                <div class="loading-thumbnail"></div>
                <div class="video-info p-4">
                    <div class="loading-title"></div>
                    <div class="loading-meta"></div>
                </div>
            </div>
        `;
        videoList.appendChild(loadingItem);
    }

    // Remove loading states and display actual videos after a short delay
    setTimeout(() => {
        videoList.innerHTML = '';
        videosToDisplay.forEach(video => {
            const li = document.createElement('li');
            const publishDate = video.actualStartTime ? 
                (video.actualStartTime instanceof Date ? video.actualStartTime : new Date(video.actualStartTime)) :
                (video.publishedAt instanceof Date ? video.publishedAt : new Date(video.publishedAt));
                
            const formattedDate = publishDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            li.innerHTML = `
                <div class="video-card">
                    <a href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank" 
                       class="block relative aspect-video overflow-hidden rounded-t-xl">
                        <img src="https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg" 
                             alt="${video.title}"
                             class="w-full h-full object-cover"
                             loading="lazy">
                        <div class="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded-md">
                            ${formatViewCount(video.viewCount)}
                        </div>
                    </a>
                    <div class="video-info">
                        <h3>
                            <a href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank" 
                               class="video-title hover:text-youtube transition-colors duration-200">
                                ${video.title}
                            </a>
                        </h3>
                        <div class="flex items-center gap-2 mt-2">
                            ${video.isStream ? 
                                '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Live Stream</span>' : 
                                '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Video</span>'
                            }
                            <span class="text-xs text-gray-600">${formattedDate}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-2">
                            <span class="text-sm text-gray-700 font-medium">${formatViewCount(video.viewCount)} views</span>
                            ${video.privacyStatus && video.privacyStatus !== 'public' ? 
                                `<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">${video.privacyStatus}</span>` : 
                                ''
                            }
                        </div>
                    </div>
                </div>
            `;
            videoList.appendChild(li);
        });
    }, 500);
}

// Helper function to format view count
function formatViewCount(count) {
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
}

// Helper function to format date
function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years}y ago`;
    } else if (months > 0) {
        return `${months}mo ago`;
    } else if (days > 0) {
        return `${days}d ago`;
    } else if (hours > 0) {
        return `${hours}h ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return 'Just now';
    }
}

// Sort videos by view count
function sortByViews() {
    const sortedVideos = [...videos].sort((a, b) => b.viewCount - a.viewCount);
    displayVideos(sortedVideos);
}

// Function to check available Gemini models
async function checkAvailableModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${getCurrentApiKey()}`);
        const data = await response.json();
        console.log('Available Models:', data);
        return data.models || [];
    } catch (error) {
        console.error('Error checking available models:', error);
        throw error;
    }
}

// Modified categorizeVideos function with smart content analysis
async function categorizeVideos() {
    if (!videos || videos.length === 0) {
        alert('No videos to categorize. Please load some videos first.');
        return;
    }

    console.log('[Categorize] Starting video categorization');
    
    // Clear existing views
    const categoriesView = document.getElementById('categories-view');
    const categoriesContainer = categoriesView.querySelector('div');
    categoriesContainer.innerHTML = '';
    
    // Remove existing return button
    const existingReturnButton = document.querySelector('button.fixed.bottom-4.right-4');
    if (existingReturnButton) {
        existingReturnButton.remove();
    }
    
    // Generate cache key using playlistId if available, otherwise use video IDs
    const playlistId = videos[0]?.playlistId;
    const categorizationKey = playlistId ? 
        `categorization_playlist_${playlistId}` : 
        `categorization_videos_${videos.map(v => v.videoId).sort().join(',')}`;
    
    console.log('[Categorize] Using cache key:', categorizationKey);
    
    try {
        // Check cache
        const cachedCategories = await getCachedData(categorizationKey, 'categories');
        if (cachedCategories) {
            console.log('[Categorize] Using cached categories');
            updateLoadingStatus('Loading categories from cache...', true);
            
            // Show categories view and hide grid view
            const videoList = document.getElementById('video-list');
            videoList.style.display = 'none';
            categoriesView.style.display = 'block';
            
            displayCategories(cachedCategories.categories);
            document.getElementById('loading').style.display = 'none';
            return;
        }

        updateLoadingStatus('Analyzing content type...', false, true);
        console.log('[Categorize] No cache found, starting content analysis');
        
        const BATCH_SIZE = 200;
        const totalBatches = Math.ceil(videos.length / BATCH_SIZE);
        let allCategories = {};

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const start = batchIndex * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, videos.length);
            const batchVideos = videos.slice(start, end);

            updateLoadingStatus(`Processing batch ${batchIndex + 1}/${totalBatches}...`, false, true);

            const videoTitles = batchVideos.map((video, index) => 
                `${start + index}. ${video.title}`
            ).join('\n');

            // Updated content analysis prompt
            const analysisPrompt = `You are a video content analyzer. Your task is to categorize YouTube video titles into meaningful and specific groups, reflecting the core content of each video.

Instructions:
1. Analyze the video titles carefully and identify the central topic or theme.
2. Create categories that accurately represent the content of the videos, even if those categories are not pre-defined.
3. Prioritize creating *specific* categories that capture the unique nature of the content. Avoid using overly broad or generic categories unless absolutely necessary.
4. Categories should reflect the primary subject matter of the video, considering keywords, context, and implied meaning within the title.
5. Return a JSON object where:
   - Keys are category names (use descriptive and specific names that reflect the content).
   - Values are arrays of video indices (starting from 0).  *Not the titles themselves*.
6. Every video must be categorized into *one and only one* category.
7. The overall goal is to create a set of categories that provides a clear and organized overview of the video content, enabling users to easily find videos of interest.
8. If a video title can fit in multiple categories pick only the one that it most belongs to
9. The categories should be as specific as possible, e.g. rather than "Tutorials", use "Cooking Tutorials", "Programming Tutorials", etc.

Video titles to analyze:
${videoTitles}

Respond with ONLY the JSON object, no additional text.`;

            console.log('[Categorize] Sending prompt to Gemini API');
            const geminiApiKey = getGeminiApiKey();
            if (!geminiApiKey) {
                throw new Error('Gemini API key is not available. Please try again later.');
            }
            
            const response = await fetch(`${API_ENDPOINTS.GEMINI_BASE}/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: analysisPrompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        topK: 32,
                        topP: 0.9,
                        maxOutputTokens: 2048
                    }
                })
            });

            console.log('[Categorize] API Response Status:', response.status);
            const responseData = await response.text();
            console.log('[Categorize] Raw API Response:', responseData);

            if (!response.ok) {
                let errorMessage = `API request failed with status ${response.status}`;
                try {
                    const errorJson = JSON.parse(responseData);
                    if (errorJson.error) {
                        errorMessage += `: ${errorJson.error.message || errorJson.error}`;
                    }
                } catch (e) {
                    // If we can't parse the error as JSON, use the raw response
                    errorMessage += `: ${responseData}`;
                }
                throw new Error(errorMessage);
            }

            const data = JSON.parse(responseData);
            console.log('[Categorize] Received response from Gemini API:', data);
            
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error('Invalid response structure from API');
            }

            const responseText = data.candidates[0].content.parts[0].text;
            console.log('[Categorize] Raw response text:', responseText);

            // Enhanced response cleaning
            let cleanedText = responseText.trim();
            
            // Remove markdown code blocks if present
            cleanedText = cleanedText.replace(/```json\n?|\n?```/g, '');
            
            // Find the first { and last } to extract just the JSON object
            const startIndex = cleanedText.indexOf('{');
            const endIndex = cleanedText.lastIndexOf('}');
            
            if (startIndex === -1 || endIndex === -1) {
                console.error('[Categorize] No valid JSON object found in response');
                throw new Error('Invalid response format from API');
            }
            
            cleanedText = cleanedText.substring(startIndex, endIndex + 1);
            
            // Remove any non-printable characters
            cleanedText = cleanedText.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            
            console.log('[Categorize] Cleaned response text:', cleanedText);

            let batchCategories;
            try {
                batchCategories = JSON.parse(cleanedText);
            } catch (parseError) {
                console.error('[Categorize] JSON parse error:', parseError);
                console.error('[Categorize] Failed text:', cleanedText);
                throw new Error(`Failed to parse API response: ${parseError.message}`);
            }

            if (!batchCategories || typeof batchCategories !== 'object' || Object.keys(batchCategories).length === 0) {
                console.error('[Categorize] Invalid categories object:', batchCategories);
                throw new Error('Invalid categories received from API');
            }

            // Merge batch categories with validation
            Object.entries(batchCategories).forEach(([category, indices]) => {
                if (!Array.isArray(indices)) {
                    console.error(`Invalid indices for category ${category}:`, indices);
                    return;
                }

                // Validate indices
                const validIndices = indices.filter(index => 
                    typeof index === 'number' && 
                    Number.isInteger(index) && 
                    index >= 0 && 
                    index < batchVideos.length
                );

                if (!allCategories[category]) {
                    allCategories[category] = [];
                }
                // Adjust indices for the current batch
                const adjustedIndices = validIndices.map(index => index + start);
                allCategories[category] = allCategories[category].concat(adjustedIndices);
            });

            // Add delay between batches to avoid rate limiting
            if (batchIndex < totalBatches - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (Object.keys(allCategories).length === 0) {
            throw new Error('No categories found');
        }

        // Sort indices within categories
        Object.keys(allCategories).forEach(category => {
            if (Array.isArray(allCategories[category])) {
                allCategories[category] = Array.from(new Set(allCategories[category])).sort((a, b) => a - b);
            } else {
                allCategories[category] = [];
            }
        });

        // Cache the results with consistent key
        const categoryData = {
            categories: allCategories,
            playlistId: playlistId, // Store playlistId if available
            videoIds: videos.map(v => v.videoId),
            totalVideos: videos.length,
            categorizedAt: new Date(),
            type: 'categories'
        };

        console.log('[Categorize] Caching categorization results');
        await cacheData(categorizationKey, categoryData, 'categories');
        
        // Show categories view and hide grid view
        const videoList = document.getElementById('video-list');
        videoList.style.display = 'none';
        categoriesView.style.display = 'block';
        
        displayCategories(allCategories);
    } catch (error) {
        console.error('[Categorize] Error:', error);
        alert('Failed to categorize videos: ' + error.message);
    } finally {
        // Always hide the loading indicator when done
        document.getElementById('loading').style.display = 'none';
    }
}

// Function to display categorized videos
function displayCategories(categories) {
    const videoList = document.getElementById('video-list');
    const categoriesView = document.getElementById('categories-view');
    const categoriesContainer = categoriesView.querySelector('div');
    
    // Hide video list and show categories
    videoList.style.display = 'none';
    categoriesView.style.display = 'block';
    categoriesContainer.innerHTML = '';

    // Keep track of the currently open category
    let currentlyOpenCategory = null;
    
    // Sort categories to put "Other" at the end
    const sortedCategories = Object.entries(categories).sort((a, b) => {
        if (a[0] === "Other") return 1;
        if (b[0] === "Other") return -1;
        return a[0].localeCompare(b[0]);
    });
    
    // Create a section for each category
    const categoryElements = sortedCategories.map(([category, videoIndices], index) => {
        const categoryId = `category-${index}`;
        const categorySection = document.createElement('div');
        categorySection.className = 'category-card mb-4 bg-gray-800 rounded-lg overflow-hidden';
        
        // Category header with count and toggle button
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header cursor-pointer bg-gray-700 p-4 hover:bg-gray-600 transition-colors duration-200';
        categoryHeader.innerHTML = `
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center">
                    <span class="text-lg font-bold text-white">${category}</span>
                    <span class="category-count ml-2 text-gray-300">${videoIndices.length} videos</span>
                </div>
                <svg class="w-6 h-6 transform transition-transform duration-200 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>
        `;
        
        // Category videos container (initially hidden)
        const categoryVideos = document.createElement('div');
        categoryVideos.id = categoryId;
        categoryVideos.className = 'category-videos hidden p-4 space-y-3';
        
        // Function to toggle category
        const toggleCategory = (shouldOpen = null) => {
            const isCurrentlyHidden = categoryVideos.classList.contains('hidden');
            const shouldShow = shouldOpen === null ? isCurrentlyHidden : shouldOpen;

            // If we're opening this category, close the currently open one
            if (shouldShow && currentlyOpenCategory && currentlyOpenCategory !== categoryVideos) {
                const openHeader = currentlyOpenCategory.previousElementSibling;
                const openArrow = openHeader?.querySelector('svg');
                if (openArrow) openArrow.style.transform = 'rotate(0deg)';
                currentlyOpenCategory.classList.add('hidden');
            }

            // Toggle current category
            categoryVideos.classList.toggle('hidden', !shouldShow);
            const arrow = categoryHeader.querySelector('svg');
            arrow.style.transform = shouldShow ? 'rotate(180deg)' : 'rotate(0deg)';

            // Update currently open category
            currentlyOpenCategory = shouldShow ? categoryVideos : null;

            // Scroll into view if opening
            if (shouldShow) {
                categorySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        // Add click handler
        categoryHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCategory();
        });
        
        // Add videos to the category
        videoIndices.forEach(index => {
            if (index < 0 || index >= videos.length) return;
            const video = videos[index];
            if (!video) return;
            
            const videoElement = document.createElement('div');
            videoElement.className = 'video-item bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors duration-200 p-3';
            videoElement.innerHTML = `
                <div class="flex space-x-3">
                    <div class="flex-shrink-0 w-32 h-18 overflow-hidden rounded-md">
                        <img src="https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg" 
                             alt="${video.title}"
                             class="w-full h-full object-cover"
                             loading="lazy">
                    </div>
                    <div class="flex-1">
                        <a href="https://www.youtube.com/watch?v=${video.videoId}" 
                           target="_blank"
                           class="text-gray-100 hover:text-youtube transition-colors">
                            <h3 class="font-medium text-sm line-clamp-2">${video.title}</h3>
                        </a>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs text-gray-400">${video.viewCount.toLocaleString()} views</span>
                            ${video.isStream ? 
                                '<span class="text-xs bg-red-900 text-red-100 px-2 py-0.5 rounded-full">Stream</span>' : 
                                '<span class="text-xs bg-blue-900 text-blue-100 px-2 py-0.5 rounded-full">Video</span>'
                            }
                        </div>
                    </div>
                </div>
            `;
            categoryVideos.appendChild(videoElement);
        });
        
        categorySection.appendChild(categoryHeader);
        categorySection.appendChild(categoryVideos);
        return categorySection;
    });

    // Add all category elements to the container
    categoryElements.forEach(element => {
        categoriesContainer.appendChild(element);
    });

    // Add a button to return to grid view
    const returnButton = document.createElement('button');
    returnButton.className = 'fixed bottom-4 right-4 bg-youtube hover:bg-youtube-dark text-white px-4 py-2 rounded-lg shadow-lg transition-colors duration-200 text-sm z-50';
    returnButton.textContent = 'Return to Grid View';
    returnButton.onclick = () => {
        categoriesView.style.display = 'none';
        videoList.style.display = 'grid';
        returnButton.remove();
    };
    document.body.appendChild(returnButton);

    // Add click handler to close categories when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.category-card') && currentlyOpenCategory) {
            const header = currentlyOpenCategory.previousElementSibling;
            const arrow = header?.querySelector('svg');
            if (arrow) arrow.style.transform = 'rotate(0deg)';
            currentlyOpenCategory.classList.add('hidden');
            currentlyOpenCategory = null;
        }
    });
}

// Update loading indicator
function updateLoadingStatus(message, isCache = false, isGemini = false, isSuccess = false) {
    const loadingElement = document.getElementById('loading');
    loadingElement.style.display = 'block';

    if (isSuccess) {
        loadingElement.innerHTML = `
            <div class="flex items-center justify-center p-4">
                <div class="success-animation active">
                    <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                    </svg>
                </div>
                <div class="ml-4">
                    <p class="success-message">${message}</p>
                    <p class="text-xs text-gray-500">Source: ${isCache ? 'MongoDB Cache' : isGemini ? 'Gemini API' : 'YouTube API'}</p>
                </div>
            </div>
        `;
        
        // Hide the success message after 2 seconds
        setTimeout(() => {
            loadingElement.style.display = 'none';
        }, 2000);
    } else {
        loadingElement.innerHTML = `
            <div class="flex items-center justify-center p-4">
                <div class="loading-spinner ${isCache ? 'border-green-500' : isGemini ? 'border-blue-500' : 'border-youtube'}"></div>
                <div class="ml-4">
                    <p class="text-sm font-medium ${isCache ? 'text-green-600' : isGemini ? 'text-blue-600' : 'text-youtube'}">${message}</p>
                    <p class="text-xs text-gray-500">Source: ${isCache ? 'MongoDB Cache' : isGemini ? 'Gemini API' : 'YouTube API'}</p>
                </div>
            </div>
        `;
    }
}