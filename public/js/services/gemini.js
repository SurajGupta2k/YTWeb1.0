import { getGeminiApiKey, API_ENDPOINTS } from '../config.js';
import { globalState } from '../state.js';
import { updateLoadingStatus, displayCategories } from '../ui/renderer.js';
import { getCachedData, cacheData } from './cache.js';

// This whole thing is for talking to Google's Gemini AI to sort videos into categories.
export async function categorizeVideos() {
    // First, make sure there are actually videos to work with.
    if (!globalState.videos || globalState.videos.length === 0) {
        alert('No videos to categorize. Please load some videos first.');
        return;
    }

    console.log('[Categorize] Starting video categorization');
    updateLoadingStatus('Preparing to categorize videos...', false, true);

    const videos = globalState.videos;
    const playlistId = videos[0]?.playlistId;
    // We create a unique key for this specific set of videos to use for caching.
    // This way, we don't have to ask the AI again for the same list.
    const categorizationKey = playlistId 
        ? `categorization_playlist_${playlistId}` 
        : `categorization_videos_${videos.map(v => v.id).sort().join(',')}`;

    try {
        // Let's check if we've already categorized this list before.
        const cachedCategories = await getCachedData(categorizationKey, 'categories');
        if (cachedCategories) {
            console.log('[Categorize] Using cached categories');
            updateLoadingStatus('Loading categories from cache...', true, false, true);
            // Sweet, we found it in the cache. Just show it and we're done.
            displayCategories(cachedCategories.categories);
            return;
        }

        // If it's not in the cache, we have to do the heavy lifting with the AI.
        updateLoadingStatus('Analyzing content with AI...', false, true);
        
        // We'll send the videos to the AI in smaller chunks (batches) to not overwhelm it.
        const BATCH_SIZE = 50;
        const totalBatches = Math.ceil(videos.length / BATCH_SIZE);
        let allCategories = {};

        for (let i = 0; i < totalBatches; i++) {
            const start = i * BATCH_SIZE;
            const end = start + BATCH_SIZE;
            const batchVideos = videos.slice(start, end);
            updateLoadingStatus(`Processing batch ${i + 1}/${totalBatches}...`, false, true);

            const videoTitles = batchVideos.map((video, index) => `${start + index}. ${video.title}`).join('\n');
            
            // This is the prompt we send to the AI. We're asking it to be a smart analyst
            // and group videos by themes, not just keywords, and to give us back a clean JSON object.
            const analysisPrompt = `
                As an expert content analyst, your task is to critically evaluate the following list of video titles and group them into insightful, well-defined categories.
                Do not just categorize by simple keywords. Instead, use your critical thinking abilities to identify deeper themes, underlying concepts, recurring patterns, or the creator's intent.
                For each video, provide a concise, one-sentence justification for why it belongs in its assigned category.

                The categories should be meaningful and reflect a thoughtful analysis of the content.

                Here is the list of video titles to analyze:
                ${videoTitles}

                Please provide the output in a valid, stringified JSON format as follows:
                [
                    {
                        "category": "Category Name 1",
                        "videos": [
                            { "title": "Video Title A", "justification": "This video belongs here because..." },
                            { "title": "Video Title B", "justification": "This video fits this category due to..." }
                        ]
                    },
                    {
                        "category": "Category Name 2",
                        "videos": [
                            { "title": "Video Title C", "justification": "This video is categorized here based on..." }
                        ]
                    }
                ]
            `;

            const geminiApiKey = getGeminiApiKey();
            if (!geminiApiKey) throw new Error('Gemini API key not available.');

            // Time to actually call the Gemini API.
            const response = await fetch(`${API_ENDPOINTS.GEMINI_BASE}/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: analysisPrompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
                })
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`API request failed: ${errorData}`);
            }

            const responseData = await response.json();
            const responseText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) throw new Error('Invalid response structure from API');

            // The AI sometimes wraps its response in markdown, so we clean that up.
            let cleanedText = responseText.trim().replace(/^```json|```$/g, '');
            
            let parsedCategories;
            try {
                // Sometimes the AI might return a single JSON object instead of an array,
                // so we wrap it to make it consistent.
                if (cleanedText.startsWith('{')) {
                    cleanedText = `[${cleanedText}]`;
                }
                parsedCategories = JSON.parse(cleanedText);
            } catch (parseError) {
                console.error('[Categorize] Failed to parse JSON:', parseError);
                console.error('[Categorize] Text that failed parsing:', cleanedText);
                throw new Error('Failed to parse AI response. See console for details.');
            }

            // Now we take the categories from the AI and match them back to our original video data.
            parsedCategories.forEach(categoryObj => {
                const categoryName = categoryObj.category;
                if (!categoryName || !Array.isArray(categoryObj.videos)) return;

                if (!allCategories[categoryName]) {
                    allCategories[categoryName] = [];
                }
                
                // The AI only gives us back titles, so we find the full video object that matches.
                categoryObj.videos.forEach(videoInfo => {
                    const originalVideo = videos.find(v => v.title === videoInfo.title);
                    if (originalVideo) {
                        allCategories[categoryName].push(originalVideo);
                    }
                });
            });
        }

        if (Object.keys(allCategories).length === 0) throw new Error('No categories were generated.');

        // All done! Let's save these results to the cache for next time.
        await cacheData(categorizationKey, { categories: allCategories }, 'categories');
        // And finally, show the categories on the screen.
        displayCategories(allCategories);

    } catch (error) {
        console.error('[Categorize] Error:', error);
        alert('Failed to categorize videos: ' + error.message);
        updateLoadingStatus('Categorization failed.', false);
    } finally {
        // Always hide the loading spinner when we're finished, success or fail.
        updateLoadingStatus(null);
    }
} 