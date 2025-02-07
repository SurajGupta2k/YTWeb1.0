// API key configuration
const apiKey = 'AIzaSyB7W9EXdi70d8bM-qnti0ujTM0iuA8vNzs';

// Global variables
let videos = [];
let channelId = '';
let channelSearchMode = false;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Event listeners for controls
    document.getElementById('load-playlist').addEventListener('click', loadPlaylist);
    document.getElementById('sort-old-new').addEventListener('click', () => sortPlaylist(true));
    document.getElementById('sort-new-old').addEventListener('click', () => sortPlaylist(false));
    document.getElementById('sort-views').addEventListener('click', sortByViews);
    document.getElementById('search-video').addEventListener('click', searchVideo);
    document.getElementById('load-videos').addEventListener('click', () => loadChannelData('videos'));
    document.getElementById('load-streams').addEventListener('click', () => loadChannelData('streams'));
    document.getElementById('load-channel').addEventListener('click', () => {
        channelSearchMode = true;
        alert('Channel search mode activated. Enter a search query (e.g., "gta 5") and click Search.');
    });
});

async function loadPlaylist() {
    const loadingElement = document.getElementById('loading');
    loadingElement.style.display = 'block';
    const videoList = document.getElementById('video-list');
    videoList.innerHTML = '';
    
    const url = document.getElementById('playlist-url').value.trim();

    try {
        if (!url) {
            throw new Error('Please enter a YouTube channel URL or playlist URL');
        }

        const playlistIdMatch = url.match(/list=([^&]+)/);
        
        if (playlistIdMatch) {
            await loadPlaylistData(playlistIdMatch[1]);
        } else if (url.includes('youtube.com/@')) {
            const channelHandle = url.split('@')[1]?.split('/')[0];
            if (!channelHandle) {
                throw new Error('Invalid channel URL format. Please use a URL like: https://www.youtube.com/@ChannelName');
            }
            await getChannelId(channelHandle);
        } else {
            throw new Error('Please enter a valid YouTube channel URL (e.g., https://www.youtube.com/@ChannelName) or playlist URL');
        }
    } catch (error) {
        console.error('Error:', error.message);
        alert(error.message || 'An error occurred while loading the data. Please try again.');
        videoList.innerHTML = `<p class="text-red-500 text-center p-4">${error.message}</p>`;
    } finally {
        loadingElement.style.display = 'none';
    }
}

async function getChannelId(channelHandle) {
    if (!channelHandle) {
        throw new Error('Channel handle is required');
    }

    try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent('@' + channelHandle)}&type=channel&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        if (!searchResponse.ok) {
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
        
        const channelResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
        );
        const channelData = await channelResponse.json();
        
        if (!channelResponse.ok) {
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
        showChannelOptions();
    } catch (error) {
        console.error('Error finding channel:', error.message);
        throw new Error(error.message || 'Channel not found! Please make sure you entered the correct channel URL.');
    }
}

async function loadPlaylistData(playlistId) {
    if (!playlistId) {
        throw new Error('Playlist ID is required');
    }

    videos = [];
    let nextPageToken = '';

    try {
        do {
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}&pageToken=${nextPageToken}`
            );
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to fetch playlist items');
            }

            if (!data.items?.length) {
                break;
            }

            const videoDetails = await Promise.all(data.items.map(async item => {
                try {
                    if (!item?.snippet?.resourceId?.videoId) {
                        return null;
                    }

                    const statsResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${item.snippet.resourceId.videoId}&key=${apiKey}`
                    );
                    const statsData = await statsResponse.json();

                    if (!statsResponse.ok || !statsData.items?.[0]) {
                        return null;
                    }

                    return {
                        title: item.snippet.title,
                        videoId: item.snippet.resourceId.videoId,
                        publishedAt: new Date(item.snippet.publishedAt),
                        viewCount: parseInt(statsData.items[0].statistics.viewCount || '0', 10)
                    };
                } catch (error) {
                    console.error('Error fetching video details:', error.message);
                    return null;
                }
            }));

            const validVideos = videoDetails.filter(Boolean);
            videos = videos.concat(validVideos);
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        if (videos.length === 0) {
            throw new Error('No videos found in this playlist');
        }

        displayVideos(videos);
    } catch (error) {
        console.error('Fetch Error:', error.message);
        throw new Error(error.message || 'Failed to load playlist data');
    }
}

async function loadChannelData(type) {
    if (!channelId) {
        alert('Please load a channel first');
        return;
    }

    videos = [];
    let nextPageToken = '';
    const loadingElement = document.getElementById('loading');
    const videoList = document.getElementById('video-list');
    loadingElement.style.display = 'block';
    videoList.innerHTML = '<p>Loading ' + (type === 'streams' ? 'streams' : 'videos') + '... This may take a while.</p>';

    try {
        let totalFetched = 0;
        do {
            let apiUrl;
            if (type === 'streams') {
                apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${window.uploadsPlaylistId}&key=${apiKey}&pageToken=${nextPageToken}`;
            } else {
                apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&type=video&key=${apiKey}&pageToken=${nextPageToken}`;
            }

            const response = await fetch(apiUrl);
            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error ? data.error.message : response.statusText);
            }

            if (!data.items || data.items.length === 0) {
                break;
            }

            const videoDetails = await Promise.all(data.items.map(async item => {
                try {
                    const videoId = type === 'streams' ? item.snippet.resourceId.videoId : item.id.videoId;
                    const detailsResponse = await fetch(
                        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails,liveStreamingDetails,status&id=${videoId}&key=${apiKey}`
                    );
                    const detailsData = await detailsResponse.json();
                    
                    if (!detailsData.items || detailsData.items.length === 0) {
                        return null;
                    }

                    const videoItem = detailsData.items[0];
                    
                    if (type === 'streams' && !videoItem.liveStreamingDetails) {
                        return null;
                    }
                    
                    if (type !== 'streams' && videoItem.liveStreamingDetails) {
                        return null;
                    }

                    return {
                        title: videoItem.snippet.title,
                        videoId: videoId,
                        publishedAt: new Date(videoItem.snippet.publishedAt),
                        actualStartTime: videoItem.liveStreamingDetails ? new Date(videoItem.liveStreamingDetails.actualStartTime) : null,
                        viewCount: parseInt(videoItem.statistics.viewCount || 0, 10),
                        channelTitle: videoItem.snippet.channelTitle,
                        description: videoItem.snippet.description,
                        duration: videoItem.contentDetails.duration,
                        isStream: !!videoItem.liveStreamingDetails,
                        privacyStatus: videoItem.status.privacyStatus
                    };
                } catch (error) {
                    console.error("Error fetching video details:", error);
                    return null;
                }
            }));

            const validVideos = videoDetails.filter(video => video !== null);
            videos = videos.concat(validVideos);
            
            totalFetched += validVideos.length;
            videoList.innerHTML = `<p>Loading ${type === 'streams' ? 'streams' : 'videos'}... Found ${totalFetched} so far...</p>`;
            
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        if (videos.length === 0) {
            alert(`No ${type === 'streams' ? 'streams' : 'videos'} found for this channel`);
        } else {
            console.log(`Total ${type} found: ${videos.length}`);
            displayVideos(videos);
        }
    } catch (error) {
        console.error("Error loading content:", error);
        alert(`An error occurred while loading the ${type}. Please try again.`);
    } finally {
        loadingElement.style.display = 'none';
    }
}

function showChannelOptions() {
    document.getElementById('channel-options').style.display = 'block';
}

function searchVideo() {
    const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
    if (channelSearchMode) {
        searchChannelVideos(searchTerm);
    } else {
        const filteredVideos = videos.filter(video => 
            video.title.toLowerCase().includes(searchTerm)
        );
        filteredVideos.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
        displayVideos(filteredVideos);
    }
}

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
            const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&q=${encodeURIComponent(query)}&maxResults=50&type=video&key=${apiKey}&pageToken=${nextPageToken}`);
            const data = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error ? data.error.message : response.statusText);
            }

            const videoDetails = await Promise.all(data.items.map(async item => {
                const videoId = item.id.videoId;
                const statsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails,liveStreamingDetails,status&id=${videoId}&key=${apiKey}`);
                const statsData = await statsResponse.json();
                if (!statsData.items || statsData.items.length === 0) return null;
                const videoItem = statsData.items[0];
                
                if (videoItem.snippet.title.toLowerCase().includes(query) || videoItem.snippet.description.toLowerCase().includes(query)) {
                    return {
                        title: videoItem.snippet.title,
                        videoId: videoId,
                        publishedAt: new Date(videoItem.snippet.publishedAt),
                        viewCount: parseInt(videoItem.statistics.viewCount || 0, 10),
                        isStream: !!videoItem.liveStreamingDetails,
                        privacyStatus: videoItem.status.privacyStatus
                    };
                }
                return null;
            }));
            const validVideos = videoDetails.filter(v => v !== null);
            searchResults = searchResults.concat(validVideos);
            nextPageToken = data.nextPageToken;
        } while (nextPageToken);
        
        if (searchResults.length === 0) {
            alert('No videos found for the search query in this channel.');
        }
        
        searchResults.sort((a, b) => a.publishedAt - b.publishedAt);
        displayVideos(searchResults);
    } catch (error) {
        console.error("Error searching channel videos: ", error);
        alert('An error occurred while searching channel videos. Please try again.');
    } finally {
        loadingElement.style.display = 'none';
    }
}

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

function displayVideos(videosToDisplay) {
    const videoList = document.getElementById('video-list');
    videoList.innerHTML = '';

    videosToDisplay.forEach(video => {
        const li = document.createElement('li');
        const publishDate = video.actualStartTime || video.publishedAt;
        const formattedDate = publishDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        li.innerHTML = `
            <div class="video-card group">
                <a href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank" 
                   class="block relative aspect-video overflow-hidden">
                    <img src="https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg" 
                         alt="${video.title}"
                         class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-200">
                </a>
                <div class="video-info">
                    <h3 class="font-semibold text-gray-800 line-clamp-2 hover:text-primary">
                        <a href="https://www.youtube.com/watch?v=${video.videoId}" target="_blank">
                            ${video.title}
                        </a>
                    </h3>
                    <p class="text-sm text-gray-600">
                        ${video.isStream ? 
                            '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Stream</span>' : 
                            '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Video</span>'
                        }
                        <span class="ml-2">${formattedDate}</span>
                    </p>
                    <p class="text-sm text-gray-600">
                        <span class="font-medium">${video.viewCount.toLocaleString()}</span> views
                    </p>
                    ${video.privacyStatus && video.privacyStatus !== 'public' ? 
                        `<p class="text-xs text-red-600 font-medium mt-2">(${video.privacyStatus})</p>` : 
                        ''
                    }
                </div>
            </div>
        `;
        videoList.appendChild(li);
    });
}

function sortByViews() {
    const sortedVideos = [...videos].sort((a, b) => b.viewCount - a.viewCount);
    displayVideos(sortedVideos);
}
