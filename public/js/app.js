import { VideoController } from './controllers/VideoController.js';
import { YouTubeService } from './services/YouTubeService.js';

class App {
    static async init() {
        try {
            await YouTubeService.initYouTubeAPI();
            this.setupEventListeners();
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    }

    static setupEventListeners() {
        // Load content button
        document.getElementById('load-content').addEventListener('click', () => VideoController.loadContent());

        // Channel options buttons
        document.getElementById('load-videos').addEventListener('click', () => VideoController.loadChannelData('videos'));
        document.getElementById('load-streams').addEventListener('click', () => VideoController.loadChannelData('streams'));

        // Search and categorize buttons
        document.getElementById('search-video').addEventListener('click', () => {
            const query = document.getElementById('search-input').value.trim();
            if (query) {
                const results = VideoController.videos.filter(video => 
                    video.title.toLowerCase().includes(query.toLowerCase())
                );
                VideoController.displayVideos(results);
            }
        });

        document.getElementById('categorize-videos').addEventListener('click', () => VideoController.categorizeVideos());

        // Sort buttons
        document.getElementById('sort-old-new').addEventListener('click', () => {
            VideoController.videos.sort((a, b) => a.publishedAt - b.publishedAt);
            VideoController.displayVideos(VideoController.videos);
        });

        document.getElementById('sort-new-old').addEventListener('click', () => {
            VideoController.videos.sort((a, b) => b.publishedAt - a.publishedAt);
            VideoController.displayVideos(VideoController.videos);
        });

        document.getElementById('sort-views').addEventListener('click', () => {
            VideoController.videos.sort((a, b) => b.viewCount - a.viewCount);
            VideoController.displayVideos(VideoController.videos);
        });

        // Search input enter key
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('search-video').click();
            }
        });

        // Playlist URL input enter key
        document.getElementById('playlist-url').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('load-content').click();
            }
        });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => App.init());