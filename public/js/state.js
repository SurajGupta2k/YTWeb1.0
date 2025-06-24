// This object holds all the important data for our app, like the list of videos,
// search settings, and current channel info.
export const globalState = {
    videos: [],
    masterVideoList: [],
    channelId: null,
    uploadsPlaylistId: null,
    currentPage: 1,
    videosPerPage: 50,
    currentSort: 'date_desc',
    currentSearchTerm: '',
    channelSearchMode: false,
};

// This just keeps track of which page of videos we're currently looking at in the UI.
export const paginationState = {
    currentPage: 1,
    itemsPerPage: 12,
};

// A simple function to load a new list of videos into our state.
export function setVideos(videos) {
    globalState.videos = videos;
    globalState.masterVideoList = [...videos];
    globalState.currentPage = 1;
}

// When we want to search within a specific channel, this function sets everything up for that.
export function setChannelInfo(channelId, uploadsPlaylistId) {
    globalState.channelId = channelId;
    globalState.uploadsPlaylistId = uploadsPlaylistId;
    globalState.channelSearchMode = true;
    globalState.videos = [];
    globalState.masterVideoList = [];
    globalState.currentPage = 1;
    globalState.currentSort = 'date_desc';
    globalState.currentSearchTerm = '';
}

// This resets the app when we're done searching a specific channel.
export function clearChannelInfo() {
    globalState.channelId = null;
    globalState.uploadsPlaylistId = null;
    globalState.channelSearchMode = false;
    globalState.videos = [];
    globalState.masterVideoList = [];
    globalState.currentPage = 1;
    globalState.currentSort = 'date_desc';
    globalState.currentSearchTerm = '';
}

// Updates the page number for the pagination controls.
export function setCurrentPage(page) {
    paginationState.currentPage = page;
} 