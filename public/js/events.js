import {
    loadContent,
    handleChannelContentTypes,
    sortVideos,
    searchAndDisplayVideos,
    categorizeAndDisplayVideos
} from './app.js';

// This is where we hook up all the buttons and inputs to make the page interactive.
export function setupEventListeners() {
    // This handles the main "Load" button and pressing Enter in the URL bar.
    document.getElementById('load-content').addEventListener('click', loadContent);
    document.getElementById('playlist-url').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadContent();
    });

    // These buttons appear after a channel is loaded, letting you pick between videos or streams.
    document.getElementById('load-videos').addEventListener('click', () => handleChannelContentTypes('videos'));
    document.getElementById('load-streams').addEventListener('click', () => handleChannelContentTypes('streams'));

    // Hooking up all the sorting options.
    document.getElementById('sort-old-new').addEventListener('click', () => sortVideos('date_asc'));
    document.getElementById('sort-new-old').addEventListener('click', () => sortVideos('date_desc'));
    document.getElementById('sort-views').addEventListener('click', () => sortVideos('views_desc'));
    
    // Making the search bar work, both on click and with the Enter key.
    document.getElementById('search-video').addEventListener('click', searchAndDisplayVideos);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchAndDisplayVideos();
    });

    // The button that tells the AI to categorize the videos.
    document.getElementById('categorize-videos').addEventListener('click', categorizeAndDisplayVideos);

    // Just a little quality-of-life thing to stop the browser from suggesting old URLs.
    document.getElementById('playlist-url').setAttribute('autocomplete', 'off');
}