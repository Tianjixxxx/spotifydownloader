const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// FabDL API configuration
const API_URL = 'https://api.fabdl.com/spotify/get?url=';
const TASK_URL = 'https://api.fabdl.com/spotify/mp3-convert-task/';
const PROGRESS_URL = 'https://api.fabdl.com/spotify/mp3-convert-progress/';
const SPOTIFY_REGEX = /^(https?:\/\/)?(www\.)?open\.spotify\.com\/track\/[a-zA-Z0-9]+/;

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// API endpoint to fetch Spotify track data
app.get('/api/download', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a Spotify URL' 
            });
        }

        // Validate Spotify URL
        if (!SPOTIFY_REGEX.test(url)) {
            return res.status(400).json({
                success: false,
                message: 'Valid Spotify track URL required'
            });
        }

        // Step 1: Get track info
        const getResponse = await axios.get(`${API_URL}${encodeURIComponent(url)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });

        const result = getResponse.data.result;
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'No track data found'
            });
        }

        // Handle single track or playlist
        const tracks = result.type === 'track' ? [result] : result.tracks;
        const processedTracks = [];

        // Step 2: Process each track
        for (const track of tracks) {
            // Create conversion task
            const taskResponse = await axios.get(`${TASK_URL}${result.gid}/${track.id}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            });

            const tid = taskResponse.data.result?.tid;

            if (!tid) {
                processedTracks.push({
                    name: track.name,
                    artists: Array.isArray(track.artists) 
                        ? track.artists.map(a => a.name || a).join(', ')
                        : track.artists,
                    duration: formatDuration(track.duration_ms),
                    download_url: null,
                    error: 'Task creation failed'
                });
                continue;
            }

            // Check conversion progress
            let downloadUrl = null;
            try {
                const progressResponse = await axios.get(`${PROGRESS_URL}${tid}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });

                const progressResult = progressResponse.data.result;
                if (progressResult && progressResult.status === 3) {
                    downloadUrl = `https://api.fabdl.com${progressResult.download_url}`;
                }
            } catch (e) {
                console.log(`Progress check failed for ${track.name}:`, e.message);
            }

            processedTracks.push({
                name: track.name,
                artists: Array.isArray(track.artists) 
                    ? track.artists.map(a => a.name || a).join(', ')
                    : track.artists,
                duration: formatDuration(track.duration_ms),
                download_url: downloadUrl,
                thumbnail: track.image || result.image
            });
        }

        res.json({
            success: true,
            data: processedTracks
        });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch track data. Please try again.',
            error: error.message
        });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});