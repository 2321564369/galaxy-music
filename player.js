/*hoi2*/
/* ========= CONFIGURATION ========= */
// Use jsDelivr for everything (no CORS, no rate limits)
const JS_DELIVR_BASE = "https://cdn.jsdelivr.net/gh/2321564369/galaxy-music@main";
const MUSIC_FOLDER = `${JS_DELIVR_BASE}/music/`;
const GITHUB_API_URL = "https://api.github.com/repos/2321564369/galaxy-music/contents/music";
const CACHE_NAME = 'galaxy-music-cache-v1';

/* ========= SONG DATA ========= */
var songs = [];
var coverFilesCache = null;

/* ========= STATE ========= */
var currentSongs = [];
var filteredSongs = [];
var searchQuery = "";
var index = 0;
var shuffle = false;
var autoplay = true;
var cachingEnabled = false; // Disabled by default to avoid rate limits
var currentSongId = null;
var currentCacheBlobUrl = null;
var liked = JSON.parse(localStorage.getItem("likedSongs")) || [];
var playlists = JSON.parse(localStorage.getItem("playlists")) || {};
var disabledSongs = JSON.parse(localStorage.getItem("disabledSongs")) || [];
var currentPlaylist = null;
var selectedArtist = null;
var playlistToDelete = null;
var isCaching = false;
var cacheProgress = 0;
var totalToCache = 0;
var isPlaying = false; // Prevent multiple songs playing at once

/* ========= ELEMENTS ========= */
var audio = document.getElementById("audio");
var list = document.getElementById("songList");
var cover = document.getElementById("cover");
var now = document.getElementById("nowPlaying");
var progress = document.getElementById("progress");
var volume = document.getElementById("volume");
var timeText = document.getElementById("timeText");
var sortSelect = document.getElementById("sortSelect");
var playlistOptions = document.getElementById("playlistOptions");
var playerHeartBtn = document.getElementById("playerHeartBtn");
var viewTitle = document.getElementById("viewTitle");
var deletePlaylistMessage = document.getElementById("deletePlaylistMessage");
var connectionStatus = document.getElementById("connectionStatus");
var cachingToggle = document.getElementById("cachingToggle");
var searchInput = document.getElementById("searchInput");
var clearSearchBtn = document.getElementById("clearSearchBtn");

/* ========= HELPER FUNCTIONS ========= */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function escapeString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function highlightText(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
}

function getMusicUrl(filename) {
    return `${JS_DELIVR_BASE}/music/${encodeURIComponent(filename)}`;
}

/* ========= BEAT VISUALIZER ========= */
var beatVisualizer = null;
var VISUALIZER_CONFIG = {
  numBars: 50, 
  sensitivity: 5,
  smoothing: 0,
  maxHeight: 200,
  colors: {
    low: ['#7c3aed', '#a78bfa'],
    mid: ['#0ea5e9', '#38bdf8'],
    high: ['#10b981', '#34d399']
  }
};

class BeatVisualizer {
  constructor(audioElement) {
    this.audio = audioElement;
    this.bars = [];
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
    this.rafId = null;
    this.isInitialized = false;
    
    this.prevLevels = new Array(VISUALIZER_CONFIG.numBars).fill(0);
    this.initBars();
  }
  
  initBars() {
    const container = document.querySelector('.beat-visualizer');
    if (!container) return;
    container.innerHTML = '';
    this.bars = [];
    
    for (let i = 0; i < VISUALIZER_CONFIG.numBars; i++) {
      const bar = document.createElement('div');
      bar.className = 'beat-bar';
      
      const third = Math.floor(VISUALIZER_CONFIG.numBars / 3);
      if (i < third) {
        bar.classList.add('low');
      } else if (i < third * 2) {
        bar.classList.add('mid');
      } else {
        bar.classList.add('high');
      }
      
      container.appendChild(bar);
      this.bars.push(bar);
    }
  }
  
  async init() {
    if (this.isInitialized) return;
    
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContext();
      
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      
      this.source = this.context.createMediaElementSource(this.audio);
      this.analyser = this.context.createAnalyser();
      
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;
      
      this.source.connect(compressor);
      compressor.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = VISUALIZER_CONFIG.smoothing;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      this.isInitialized = true;
      console.log('Beat visualizer initialized');
      
    } catch (error) {
      console.error('Failed to initialize beat visualizer:', error);
    }
  }
  
  start() {
    if (!this.isInitialized || this.rafId) return;
    
    const animate = () => {
      if (!this.isInitialized) return;
      
      this.rafId = requestAnimationFrame(animate);
      this.analyser.getByteFrequencyData(this.dataArray);
      
      const barCount = this.bars.length;
      const dataLength = this.dataArray.length;
      const groupSize = Math.floor(dataLength / barCount);
      
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        const start = i * groupSize;
        const end = Math.min(start + groupSize, dataLength);
        
        for (let j = start; j < end; j++) {
          sum += this.dataArray[j];
        }
        
        let avg = sum / (end - start);
        let normalized = avg / 256;
        normalized = Math.pow(normalized, 1 + VISUALIZER_CONFIG.sensitivity);
        normalized = Math.max(normalized, this.prevLevels[i] * 0.8);
        this.prevLevels[i] = normalized;
        
        const minHeight = 5;
        let height = minHeight + (normalized * (VISUALIZER_CONFIG.maxHeight - minHeight));
        
        if (normalized > 0.3) {
          height *= (0.9 + Math.random() * 0.2);
        }
        
        const bar = this.bars[i];
        bar.style.height = `${height}px`;
        
        if (normalized > 0.7) {
          bar.classList.add('active');
          setTimeout(() => bar.classList.remove('active'), 150);
        }
        
        const glowIntensity = Math.min(normalized * 50, 40);
        if (i < Math.floor(barCount / 3)) {
          bar.style.boxShadow = `0 0 ${glowIntensity}px rgba(124, 58, 237, ${normalized * 0.5})`;
        } else if (i < Math.floor(barCount * 2 / 3)) {
          bar.style.boxShadow = `0 0 ${glowIntensity}px rgba(14, 165, 233, ${normalized * 0.5})`;
        } else {
          bar.style.boxShadow = `0 0 ${glowIntensity}px rgba(16, 185, 129, ${normalized * 0.5})`;
        }
      }
    };
    
    animate();
  }
  
  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    this.bars.forEach(bar => {
      bar.style.height = '5px';
      bar.style.boxShadow = 'none';
      bar.classList.remove('active');
    });
    
    this.prevLevels.fill(0);
  }
  
  destroy() {
    this.stop();
    if (this.context && this.context.state !== 'closed') {
      this.context.close();
    }
    this.isInitialized = false;
    this.bars = [];
  }
  
  updateBarCount(newCount) {
    VISUALIZER_CONFIG.numBars = Math.max(5, Math.min(50, newCount));
    this.prevLevels = new Array(VISUALIZER_CONFIG.numBars).fill(0);
    this.initBars();
    console.log('Updated visualizer to', VISUALIZER_CONFIG.numBars, 'bars');
  }
}

/* ========= CACHING FUNCTIONS ========= */
async function cacheSingleSong(song) {
    if (!cachingEnabled) return false;
    
    try {
        const cache = await caches.open(CACHE_NAME);
        if (!cache) return false;
        
        const cachedResponse = await cache.match(song.file);
        if (cachedResponse) {
            song.cached = true;
            return true;
        }
        
        const filename = song.file.split('/').pop();
        const audioUrl = getMusicUrl(filename);
        
        console.log(`📥 Caching from: ${audioUrl}`);
        
        const response = await fetch(audioUrl, {
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const cacheResponse = new Response(blob, {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg'
                }
            });
            await cache.put(song.file, cacheResponse);
            song.cached = true;
            updateCachedSongsUI(false);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`Failed to cache ${song.title}:`, error);
        return false;
    }
}

async function getCachedSong(song) {
    if (!cachingEnabled) return null;
    
    try {
        const cache = await caches.open(CACHE_NAME);
        if (!cache) return null;
        
        const cachedResponse = await cache.match(song.file);
        if (cachedResponse) {
            return await cachedResponse.blob();
        }
        return null;
    } catch (error) {
        console.error(`Failed to get cached song ${song.title}:`, error);
        return null;
    }
}

async function removeFromCache(song) {
    try {
        const cache = await caches.open(CACHE_NAME);
        if (!cache) return false;
        
        await cache.delete(song.file);
        song.cached = false;
        updateCachedSongsUI(false);
        return true;
    } catch (error) {
        console.error(`Failed to remove ${song.title} from cache:`, error);
        return false;
    }
}

async function cacheAllSongsBackground(songList) {
    if (isCaching || songList.length === 0 || !cachingEnabled) return;
    
    isCaching = true;
    totalToCache = Math.min(songList.length, 50); // Only cache 50 max
    cacheProgress = 0;
    
    console.log(`Starting background cache of ${totalToCache} songs...`);
    
    for (let i = 0; i < totalToCache; i++) {
        if (!isCaching) break;
        if (!cachingEnabled) {
            console.log('Caching stopped (disabled by user)');
            break;
        }
        
        const song = songList[i];
        const success = await cacheSingleSong(song);
        
        if (success) {
            cacheProgress++;
            song.cached = true;
            
            if (cacheProgress % 5 === 0 || cacheProgress === totalToCache) {
                updateCachedSongsUI(false);
                console.log(`Caching progress: ${cacheProgress}/${totalToCache}`);
            }
        }
        
        // Delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    isCaching = false;
    console.log(`Background caching complete: ${cacheProgress}/${totalToCache} songs cached`);
    updateCachedSongsUI(false);
    saveSongsToCache();
}

async function clearCache() {
    try {
        if ('caches' in window) {
            await caches.delete(CACHE_NAME);
        }
        songs.forEach(song => {
            song.cached = false;
        });
        updateCachedSongsUI(false);
        saveSongsToCache();
        return true;
    } catch (error) {
        console.error("Failed to clear cache:", error);
        return false;
    }
}

/* ========= TOGGLE CACHING ========= */
function toggleCaching() {
    if (!cachingToggle) return;
    cachingEnabled = cachingToggle.checked;
    localStorage.setItem('cachingEnabled', JSON.stringify(cachingEnabled));
    
    console.log(`💾 Caching ${cachingEnabled ? 'enabled' : 'disabled'}`);
    
    if (cachingEnabled) {
        viewTitle.innerText = "Caching songs...";
        setTimeout(() => {
            cacheAllSongsBackground(songs);
        }, 500);
    } else {
        clearCache();
        viewTitle.innerText = "Cache Off - Streaming Only";
    }
    
    updateCachedSongsUI(false);
}

/* ========= FILENAME PARSING ========= */
function parseFilename(filename) {
    let name = filename.replace(/\.mp3$/i, '').replace(/_/g, ' ');
    
    // Remove duplicate artist names (e.g., "OneRepublic - OneRepublic - Song")
    if (name.includes(' - ')) {
        const parts = name.split(' - ');
        if (parts.length >= 2 && parts[0] === parts[1]) {
            name = parts.slice(1).join(' - ');
        }
    }
    
    let artist = "Unknown Artist";
    let title = name;
    let album = "Unknown";
    
    if (name.includes(' - ')) {
        const parts = name.split(' - ');
        artist = parts[0].trim();
        const rest = parts.slice(1).join(' - ');
        
        const parenMatch = rest.match(/\(([^)]+)\)/);
        if (parenMatch) {
            album = parenMatch[1].trim();
            title = rest.replace(parenMatch[0], '').trim();
        } else {
            title = rest.trim();
        }
    } else {
        const parenMatch = name.match(/([^(]+)\s*\(([^)]+)\)/);
        if (parenMatch) {
            title = parenMatch[1].trim();
            album = parenMatch[2].trim();
        }
    }
    
    // Clean up
    title = title.replace(/Official (Music )?Video/i, '').replace(/Lyric Video/i, '').replace(/\(Lyrics\)/i, '').trim();
    title = title.replace(/\s+/g, ' ').trim();
    
    if (artist === "Panic! At The Disco") title = "House of Memories";
    if (artist === "3 Doors Down") title = "Kryptonite";
    if (artist === "Drowning Pool") title = "Bodies";
    if (title.includes("Enter Sandman")) artist = "Metallica";
    if (title.includes("Master of Puppets")) artist = "Metallica";
    
    return { artist: artist.trim(), title: title.trim(), album: album.trim() };
}

/* ========= COVER ART SYSTEM ========= */
async function scanForCoverFiles() {
    try {
        const response = await fetch(GITHUB_API_URL);
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const files = await response.json();
        
        coverFilesCache = files
            .filter(file => {
                const name = file.name.toLowerCase();
                return name.endsWith('.png') || 
                       name.endsWith('.jpg') || 
                       name.endsWith('.jpeg') ||
                       name.endsWith('.webp') ||
                       name.endsWith('.gif');
            })
            .map(file => file.name);
        
        return coverFilesCache;
    } catch (error) {
        console.error("Error scanning for cover files:", error);
        return [];
    }
}

function findCoverForSong(mp3Filename) {
    if (!coverFilesCache || coverFilesCache.length === 0) return null;
    
    const baseName = mp3Filename.replace(/\.mp3$/i, '').toLowerCase().replace(/_/g, ' ');
    const baseNameWithUnderscores = mp3Filename.replace(/\.mp3$/i, '').toLowerCase();
    
    const exactMatch = coverFilesCache.find(cover => {
        const coverBase = cover.replace(/\.[^.]+$/, '').toLowerCase().replace(/_/g, ' ');
        return coverBase === baseName;
    });
    
    if (exactMatch) return exactMatch;
    
    const exactMatchUnderscore = coverFilesCache.find(cover => {
        const coverBase = cover.replace(/\.[^.]+$/, '').toLowerCase();
        return coverBase === baseNameWithUnderscores;
    });
    
    if (exactMatchUnderscore) return exactMatchUnderscore;
    
    const partialMatch = coverFilesCache.find(cover => {
        const coverBase = cover.replace(/\.[^.]+$/, '').toLowerCase().replace(/_/g, ' ');
        return coverBase.includes(baseName) || baseName.includes(coverBase);
    });
    
    if (partialMatch) return partialMatch;
    
    const genericCovers = ['cover.png', 'cover.jpg', 'album.png', 'album.jpg', 'folder.png', 'folder.jpg'];
    for (const generic of genericCovers) {
        if (coverFilesCache.includes(generic)) {
            return generic;
        }
    }
    
    return null;
}

async function getCoverArt(artist, title, filename) {
    const coverFile = findCoverForSong(filename);
    if (coverFile) {
        return `https://raw.githubusercontent.com/2321564369/galaxy-music/main/music/${encodeURIComponent(coverFile)}`;
    }
    
    const coverMap = {
        "Panic! At The Disco": "https://i1.sndcdn.com/artworks-pmJKYkhBWgQ5wyEM-8y9l8A-t500x500.jpg",
        "3 Doors Down": "https://i1.sndcdn.com/artworks-000061461506-i53bjg-t500x500.jpg",
        "Drowning Pool": "https://i1.sndcdn.com/artworks-iWPxXTl6La9i-0-t500x500.jpg",
        "Metallica": "https://i1.sndcdn.com/artworks-000258189284-6xuusb-t500x500.jpg",
        "Limp Bizkit": "https://i1.sndcdn.com/artworks-UgqpwRjPcqZL-0-t500x500.jpg",
        "Papa Roach": "https://cdn-images.dzcdn.net/images/cover/dd426bbcdfda3442eeb286d87da26fa3/500x500.jpg",
        "Rick Astley": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTMNO_gNGIVzSfgd2rBoQVIepnVpinlrhaRqA&s",
        "Spiderbait": "https://m.media-amazon.com/images/I/51yf2z6ql4L._UXNaN_FMjpg_QL85_.jpg",
        "System Of A Down": "https://cdn-images.dzcdn.net/images/cover/6baa3ad626e859f67bbddae6528fd949/500x500.jpg",
        "_NSYNC": "https://cdn-images.dzcdn.net/images/cover/01fdca2ecf54d678ff005162b5b6cc92/500x500.jpg"
    };
    
    if (coverMap[artist]) {
        return coverMap[artist];
    }
    
    return generateColoredCover(artist);
}

function generateColoredCover(artist) {
    const colors = [
        ['#7c3aed', '#5b21b6'],
        ['#0ea5e9', '#0284c7'],
        ['#10b981', '#059669'],
        ['#f59e0b', '#d97706'],
        ['#ef4444', '#dc2626'],
    ];
    
    const colorSet = colors[artist.length % colors.length];
    const initials = artist
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 3);
    
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${colorSet[0]};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${colorSet[1]};stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="500" height="500" fill="url(#grad)"/>
        <text x="250" y="250" font-family="Arial" font-size="80" 
              fill="white" text-anchor="middle" dy=".3em" font-weight="bold">
            ${initials}
        </text>
    </svg>`;
}

/* ========= GITHUB API SCAN ========= */
async function scanWithGitHubAPI() {
    console.log("Scanning with GitHub API...");
    viewTitle.innerText = "Scanning GitHub...";
    list.innerHTML = '<div class="empty"><div class="spinner"></div><p>Scanning music folder...</p></div>';
    
    try {
        const response = await fetch(GITHUB_API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 403) {
                console.error('Rate limit exceeded. Please try again later.');
                viewTitle.innerText = "Rate Limit Exceeded";
                list.innerHTML = `
                    <div class="empty">
                        <p>GitHub API rate limit exceeded.</p>
                        <p>Please try again later.</p>
                    </div>`;
                return;
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const files = await response.json();
        
        const mp3Files = files
            .filter(file => file.type === "file" && file.name.toLowerCase().endsWith('.mp3'))
            .map(file => file.name);
        
        console.log("Found MP3 files:", mp3Files);
        
        if (mp3Files.length > 0) {
            await scanForCoverFiles();
            await loadSongsFromList(mp3Files);
        } else {
            console.warn("No MP3 files found via GitHub API");
            useCachedSongs();
        }
        
    } catch (error) {
        console.error("GitHub API scan failed:", error);
        tryCommonFiles();
    }
}

async function loadSongsFromList(fileList) {
    console.log(`Loading ${fileList.length} songs from list...`);
    
    const loadedSongs = [];
    let loadedCount = 0;
    
    for (let i = 0; i < fileList.length; i++) {
        const filename = fileList[i];
        
        const { artist, title, album } = parseFilename(filename);
        const fileUrl = getMusicUrl(filename);
        const songCover = await getCoverArt(artist, title, filename);
        
        const song = {
            id: i,
            title: title,
            artist: artist,
            album: album,
            file: fileUrl,
            cover: songCover,
            disabled: disabledSongs.includes(i),
            liked: liked.includes(i),
            cached: false,
            duration: 0
        };
        
        loadedSongs.push(song);
        
        loadSongDuration(song).then(duration => {
            song.duration = duration;
            loadedCount++;
            
            if (loadedCount % 3 === 0) {
                viewTitle.innerText = `Loading... (${loadedCount}/${fileList.length})`;
            }
            
            if (loadedCount === fileList.length) {
                finishLoading(loadedSongs);
            }
        }).catch(() => {
            song.duration = 180;
            loadedCount++;
            
            if (loadedCount === fileList.length) {
                finishLoading(loadedSongs);
            }
        });
    }
    
    if (fileList.length === 0) {
        finishLoading([]);
    }
}

async function tryCommonFiles() {
    console.log("Trying common file patterns...");
    viewTitle.innerText = "Checking common files...";
    
    const commonFiles = [
        "Panic! At The Disco - House of Memories.mp3",
        "3 Doors Down - Kryptonite (Official Video).mp3",
        "Drowning Pool - Bodies (Official HD Music Video).mp3",
        "Enter Sandman (Remastered).mp3",
        "Limp Bizkit - Break Stuff (Official Music Video).mp3",
        "Master of Puppets (Remastered).mp3",
        "Papa Roach - Last Resort (Squeaky Clean Version) (Official Music Video).mp3",
        "Rick Astley - Never Gonna Give You Up (Official Music Video) [ ezmp3.cc ].mp3",
        "Spiderbait - Black Betty (Audio).mp3",
        "System Of A Down - Toxicity (Official HD Video).mp3",
        "_NSYNC - Bye Bye Bye (Lyrics) (Deadpool 3 Soundtrack) [ ezmp3.cc ].mp3"
    ];
    
    const foundFiles = [];
    
    for (const filename of commonFiles) {
        try {
            const url = getMusicUrl(filename);
            const response = await fetch(url, { method: 'HEAD' });
            
            if (response.ok) {
                foundFiles.push(filename);
                console.log("✓ Found:", filename);
            }
        } catch (error) {}
    }
    
    const uniqueFiles = [...new Set(foundFiles)];
    
    if (uniqueFiles.length > 0) {
        console.log("Found via file check:", uniqueFiles);
        await scanForCoverFiles();
        await loadSongsFromList(uniqueFiles);
    } else {
        console.log("No files found");
        useCachedSongs();
    }
}

function loadSongDuration(song) {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = song.file;
        
        audio.onloadedmetadata = () => {
            resolve(audio.duration);
        };
        
        audio.onerror = () => {
            resolve(180);
        };
        
        setTimeout(() => {
            resolve(180);
        }, 3000);
    });
}

async function finishLoading(loadedSongs) {
    songs = shuffleArray(loadedSongs);
    
    songs.forEach((song, index) => {
        song.id = index;
    });
    
    console.log(`Loaded and shuffled ${songs.length} songs`);
    
    await clearCache();
    saveSongsToCache();
    loadAll();
    
    // Don't auto-cache - let users enable it if they want
    if (cachingEnabled) {
        setTimeout(() => {
            cacheAllSongsBackground(songs);
        }, 500);
    } else {
        console.log('Background caching disabled - streaming only');
    }
    
    // Auto-play first song after loading
    setTimeout(() => {
        if (songs.length > 0 && !isPlaying) {
            const firstEnabledIndex = songs.findIndex(s => !s.disabled);
            if (firstEnabledIndex !== -1) {
                play(firstEnabledIndex);
            }
        }
    }, 1500);
}

function saveSongsToCache() {
    localStorage.setItem('cachedSongs', JSON.stringify(songs.map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        file: s.file,
        cover: s.cover,
        duration: s.duration || 180,
        liked: s.liked || false,
        disabled: s.disabled || false,
        cached: s.cached || false
    }))));
    localStorage.setItem('lastScan', Date.now());
}

function useCachedSongs() {
    console.log("Checking cache...");
    const cached = localStorage.getItem('cachedSongs');
    const lastScan = localStorage.getItem('lastScan');
    
    if (cached && lastScan && (Date.now() - lastScan) < 24 * 60 * 60 * 1000) {
        try {
            songs = JSON.parse(cached);
            songs = shuffleArray(songs);
            songs.forEach((song, index) => {
                song.id = index;
            });
            console.log(`Loaded ${songs.length} songs from cache`);
            loadAll();
        } catch (e) {
            console.error("Cache corrupted, scanning...");
            scanWithGitHubAPI();
        }
    } else {
        scanWithGitHubAPI();
    }
}

function rescanSongs() {
    if (confirm("Clear cache and rescan for new songs?")) {
        localStorage.removeItem('cachedSongs');
        localStorage.removeItem('lastScan');
        
        songs = [];
        currentSongs = [];
        
        viewTitle.innerText = "Scanning...";
        list.innerHTML = '<div class="empty"><div class="spinner"></div><p>Scanning with GitHub API...</p></div>';
        
        scanWithGitHubAPI();
    }
}

function shuffleSongsList() {
    songs = shuffleArray(songs);
    songs.forEach((song, index) => {
        song.id = index;
    });
    saveSongsToCache();
    loadAll();
    console.log('🔀 Songs shuffled!');
}

/* ========= PLAYBACK FUNCTIONS ========= */
async function play(i) {
    if (!currentSongs || i < 0 || i >= currentSongs.length) return;
    if (isPlaying) return; // Prevent multiple plays
    
    isPlaying = true;
    
    if (!cachingEnabled && currentSongId !== null && currentSongId !== currentSongs[i].id) {
        const prevSong = songs.find(s => s.id === currentSongId);
        if (prevSong && prevSong.cached) {
            await removeFromCache(prevSong);
        }
        if (currentCacheBlobUrl) {
            URL.revokeObjectURL(currentCacheBlobUrl);
            currentCacheBlobUrl = null;
        }
    }
    
    index = i;
    const song = currentSongs[i];
    
    console.log(`🎵 Playing: ${song.title} (Cached: ${song.cached})`);
    
    updateNowPlayingUI(song);
    
    if (beatVisualizer && !beatVisualizer.isInitialized) {
        await beatVisualizer.init();
    }
    
    if (beatVisualizer && beatVisualizer.isInitialized) {
        beatVisualizer.start();
    }
    
    const cachedBlob = await getCachedSong(song);
    
    if (cachedBlob) {
        playFromCache(song, cachedBlob);
    } else if (navigator.onLine) {
        await downloadAndPlay(song);
    } else {
        alert(`Cannot play "${song.title}" offline. Please connect to the internet first.`);
        if (beatVisualizer) beatVisualizer.stop();
        isPlaying = false;
    }
}

function playFromCache(song, blob) {
    if (currentCacheBlobUrl) {
        URL.revokeObjectURL(currentCacheBlobUrl);
        currentCacheBlobUrl = null;
    }
    
    const blobUrl = URL.createObjectURL(blob);
    currentCacheBlobUrl = blobUrl;
    
    audio.src = blobUrl;
    audio.crossOrigin = "anonymous";
    
    audio.play().then(() => {
        document.querySelector(".icon.play").classList.add("playing");
        isPlaying = false;
    }).catch(e => {
        console.error("Play error from cache:", e);
        if (beatVisualizer) beatVisualizer.stop();
        if (navigator.onLine) {
            downloadAndPlay(song);
        } else {
            isPlaying = false;
        }
    });
}

async function downloadAndPlay(song) {
    now.innerText = `Loading "${song.title}"...`;
    
    try {
        const filename = song.file.split('/').pop();
        const audioUrl = getMusicUrl(filename);
        
        console.log(`🌐 Fetching from: ${audioUrl}`);
        
        const response = await fetch(audioUrl, {
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        // Cache if enabled
        if (cachingEnabled) {
            const cache = await caches.open(CACHE_NAME);
            const cacheResponse = new Response(blob, {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg'
                }
            });
            await cache.put(song.file, cacheResponse);
            song.cached = true;
            updateCachedSongsUI(false);
        }
        
        if (currentCacheBlobUrl) {
            URL.revokeObjectURL(currentCacheBlobUrl);
            currentCacheBlobUrl = null;
        }
        
        const blobUrl = URL.createObjectURL(blob);
        currentCacheBlobUrl = blobUrl;
        
        audio.src = blobUrl;
        audio.crossOrigin = "anonymous";
        
        audio.play().then(() => {
            document.querySelector(".icon.play").classList.add("playing");
            now.innerText = `${song.title} • ${song.artist}`;
            isPlaying = false;
        }).catch(e => {
            console.error("Play error after caching:", e);
            if (beatVisualizer) beatVisualizer.stop();
            isPlaying = false;
            alert("Could not play this song. Please try again.");
        });
        
    } catch (error) {
        console.error("Download error:", error);
        alert("Could not load this song. Please try again later.");
        now.innerText = `${song.title} • ${song.artist}`;
        isPlaying = false;
    }
}

function toggle() {
    if (audio.paused) {
        if (!audio.src && currentSongs.length > 0) {
            play(0);
        } else {
            audio.play();
            document.querySelector(".icon.play").classList.add("playing");
            addPlayingGifToCover();
            
            if (beatVisualizer && beatVisualizer.isInitialized) {
                beatVisualizer.start();
            }
        }
    } else {
        audio.pause();
        document.querySelector(".icon.play").classList.remove("playing");
        removePlayingGifFromCover();
        
        if (beatVisualizer) {
            beatVisualizer.stop();
        }
    }
}

function next() {
    if (!currentSongs || currentSongs.length === 0) return false;
    
    let nextIndex;
    
    if (shuffle) {
        const available = currentSongs.filter((s, i) => !s.disabled && i !== index);
        if (available.length === 0) return false;
        const randomSong = available[Math.floor(Math.random() * available.length)];
        nextIndex = currentSongs.findIndex(s => s.id === randomSong.id);
    } else {
        nextIndex = (index + 1) % currentSongs.length;
        let tries = 0;
        while (currentSongs[nextIndex].disabled && tries < currentSongs.length) {
            nextIndex = (nextIndex + 1) % currentSongs.length;
            tries++;
        }
    }
    
    if (nextIndex >= 0 && nextIndex < currentSongs.length && !currentSongs[nextIndex].disabled) {
        play(nextIndex);
        return true;
    }
    
    return false;
}

function prev() {
    if (!currentSongs || currentSongs.length === 0) return false;
    
    let prevIndex = (index - 1 + currentSongs.length) % currentSongs.length;
    let tries = 0;
    while (currentSongs[prevIndex].disabled && tries < currentSongs.length) {
        prevIndex = (prevIndex - 1 + currentSongs.length) % currentSongs.length;
        tries++;
    }
    
    if (prevIndex >= 0 && prevIndex < currentSongs.length && !currentSongs[prevIndex].disabled) {
        play(prevIndex);
        return true;
    }
    
    return false;
}

function toggleShuffle() {
    shuffle = !shuffle;
    document.querySelector(".icon.shuffle").classList.toggle("active", shuffle);
    localStorage.setItem("shuffle", JSON.stringify(shuffle));
}

function toggleAutoplay() {
    autoplay = !autoplay;
    document.querySelector(".icon.autoplay").classList.toggle("active", autoplay);
    localStorage.setItem("autoplay", JSON.stringify(autoplay));
}

/* ========= UI UPDATE FUNCTIONS ========= */
function updateNowPlayingUI(song) {
    cover.src = song.cover;
    now.innerText = `${song.title} • ${song.artist}`;
    currentSongId = song.id;
    updatePlayingStateInList();
    updateLikeButton();
    addPlayingGifToCover();
}

function updatePlayingStateInList(shouldScroll = true) {
    document.querySelectorAll('.song').forEach(songEl => {
        songEl.classList.remove('playing');
    });
    
    if (currentSongId !== null) {
        const playingSong = document.querySelector(`.song[data-id="${currentSongId}"]`);
        if (playingSong) {
            playingSong.classList.add('playing');
            
            if (shouldScroll) {
                playingSong.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }
}

function addPlayingGifToCover() {
    const existingOverlay = cover.parentNode.querySelector('.playing-gif-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'playing-gif-overlay';
    overlay.innerHTML = `
        <div class="music-notes">
            <span class="note">♪</span>
            <span class="note">♫</span>
            <span class="note">♬</span>
        </div>
        <div class="pulse-ring"></div>
    `;
    
    cover.parentNode.appendChild(overlay);
}

function removePlayingGifFromCover() {
    const overlay = cover.parentNode.querySelector('.playing-gif-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function updateCachedSongsUI(shouldScroll = false) {
    const cachedCount = songs.filter(s => s.cached).length;
    if (currentPlaylist === null) {
        const total = songs.length;
        if (!cachingEnabled) {
            viewTitle.innerText = `All Songs (${total}) ⚡ Streaming`;
        } else if (cachedCount === total && total > 0) {
            viewTitle.innerText = `All Songs (${total}) ✅ All Cached`;
        } else if (cachedCount > 0) {
            viewTitle.innerText = `All Songs (${total}) 📥 ${cachedCount}/${total}`;
        } else {
            viewTitle.innerText = `All Songs (${total})`;
        }
    }
    
    if (currentPlaylist === null) {
        renderSongs(currentSongs, shouldScroll);
    }
}

/* ========= RENDER SONGS ========= */
function renderSongs(arr, shouldScroll = false) {
    if (!arr || arr.length === 0) {
        list.innerHTML = `
            <div class="empty">
                <p>No songs found</p>
                ${searchQuery ? `<p>Try a different search term</p>` : ''}
                ${selectedArtist ? `<button onclick="loadArtists()" class="scan-btn">Back to Artists</button>` : ''}
                <button onclick="rescanSongs()" class="scan-btn">Try Scanning Again</button>
            </div>`;
        return;
    }
    
    let html = '';
    
    // Add back button if viewing an artist
    if (selectedArtist) {
        html += `
            <div class="back-to-artists" onclick="loadArtists()" style="cursor:pointer; padding:10px 16px; background:rgba(255,255,255,0.05); border-radius:12px; margin-bottom:15px; display:inline-block; border:1px solid rgba(167,139,250,0.15); transition:all 0.2s ease;">
                ← Back to Artists
            </div>
        `;
    }
    
    // Add artist header if viewing an artist
    if (selectedArtist) {
        const artistSongs = songs.filter(s => s.artist === selectedArtist);
        html += `
            <div class="artist-detail-header">
                <div class="artist-detail-avatar" style="background: linear-gradient(135deg, #7c3aed, #5b21b6);">
                    ${selectedArtist.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 3)}
                </div>
                <div class="artist-detail-info">
                    <div class="artist-name">${escapeHTML(selectedArtist)}</div>
                    <div class="artist-song-count">${artistSongs.length} songs</div>
                    <button class="artist-play-all" onclick="playArtist('${escapeString(selectedArtist)}')">▶ Play All</button>
                </div>
            </div>
        `;
    }
    
    // Add songs
    html += `<div class="songs-list">`;
    
    arr.forEach(function (s) {
        const isDisabled = s.disabled ? ' disabled' : '';
        const isLiked = s.liked ? ' liked' : '';
        const isCached = s.cached && cachingEnabled;
        const songId = s.id;
        
        html += `
            <div class="song${isDisabled}" data-id="${songId}">
                <div class="thumb" style="background-image: url('${s.cover}')">
                    ${isCached ? '<div class="offline-badge" title="Available offline">📥</div>' : ''}
                </div>
                <div class="songInfo">
                    <div class="songTitle">
                        ${searchQuery && s.title.toLowerCase().includes(searchQuery) ? highlightText(escapeHTML(s.title), searchQuery) : escapeHTML(s.title)}
                        ${isCached ? '<span class="offline-indicator" title="Available offline"> 📥</span>' : ''}
                    </div>
                    <div class="songMeta">
                        ${searchQuery ? highlightText(`${escapeHTML(s.artist)} • ${escapeHTML(s.album)} • ${formatTime(s.duration)}`, searchQuery) : `${escapeHTML(s.artist)} • ${escapeHTML(s.album)} • ${formatTime(s.duration)}`}
                    </div>
                </div>
                <div class="songControls">
                    <button class="likeBtn${isLiked}" onclick="event.stopPropagation(); toggleSongLike(${songId});"></button>
                    <button class="addBtn" onclick="event.stopPropagation(); showAddToPlaylistModal(${songId});">+</button>
                    <label class="toggle-switch" onclick="event.stopPropagation();">
                        <input type="checkbox" ${s.disabled ? '' : 'checked'} onchange="
                            const newState = !this.checked;
                            s.disabled = newState;
                            saveToggleState(${songId}, newState);
                            const songRow = this.closest('.song');
                            if (newState) {
                                songRow.classList.add('disabled');
                            } else {
                                songRow.classList.remove('disabled');
                            }
                        ">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    list.innerHTML = html;
    
    // Add click event listeners to each song after rendering
    document.querySelectorAll('.song').forEach(function(songEl) {
        songEl.addEventListener('click', function(e) {
            // Don't trigger if click was on a button or toggle
            if (e.target.closest('button') || e.target.closest('.toggle-switch') || e.target.closest('.toggle-slider') || e.target.closest('input')) {
                return;
            }
            const songId = parseInt(this.dataset.id);
            const song = songs.find(s => s.id === songId);
            if (song && !song.disabled) {
                const playIndex = currentSongs.findIndex(s => s.id === songId);
                if (playIndex !== -1) {
                    play(playIndex);
                }
            }
        });
    });
    
    updatePlayingStateInList(shouldScroll);
}

/* ========= ARTISTS FUNCTIONS ========= */
function renderArtists(artists) {
    if (!artists || artists.length === 0) {
        list.innerHTML = `
            <div class="empty">
                <p>No artists found</p>
            </div>`;
        return;
    }
    
    let html = '<div class="artists-grid">';
    
    artists.forEach(([artist, songsList]) => {
        const initials = artist
            .split(' ')
            .filter(word => word.length > 0)
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 3);
        
        const colors = [
            ['#7c3aed', '#5b21b6'],
            ['#0ea5e9', '#0284c7'],
            ['#10b981', '#059669'],
            ['#f59e0b', '#d97706'],
            ['#ef4444', '#dc2626'],
            ['#ec4899', '#db2777'],
            ['#8b5cf6', '#7c3aed'],
            ['#14b8a6', '#0d9488'],
            ['#f97316', '#ea580c'],
            ['#6366f1', '#4f46e5']
        ];
        const colorSet = colors[artist.length % colors.length];
        
        html += `
            <div class="artist-card" onclick="selectArtist('${escapeString(artist)}')">
                <div class="artist-avatar" style="background: linear-gradient(135deg, ${colorSet[0]}, ${colorSet[1]});">
                    ${initials}
                </div>
                <div class="artist-name">${escapeHTML(artist)}</div>
                <div class="artist-song-count">${songsList.length} song${songsList.length > 1 ? 's' : ''}</div>
                <div class="artist-play-icon" onclick="event.stopPropagation(); playArtist('${escapeString(artist)}')">▶</div>
            </div>
        `;
    });
    
    html += '</div>';
    list.innerHTML = html;
}

function selectArtist(artistName) {
    selectedArtist = artistName;
    const artistSongs = songs.filter(s => s.artist === artistName);
    artistSongs.sort((a, b) => a.title.localeCompare(b.title));
    
    currentSongs = artistSongs;
    currentPlaylist = `artist_${artistName}`;
    
    viewTitle.innerText = `${artistName} (${currentSongs.length})`;
    renderSongs(currentSongs, false);
    renderPlaylists();
}

function playArtist(artistName) {
    const artistSongs = songs.filter(s => s.artist === artistName && !s.disabled);
    if (artistSongs.length === 0) return;
    
    artistSongs.sort((a, b) => a.title.localeCompare(b.title));
    
    currentSongs = artistSongs;
    currentPlaylist = `artist_${artistName}`;
    selectedArtist = artistName;
    
    play(0);
}

/* ========= UI FUNCTIONS ========= */
function loadArtists() {
    selectedArtist = null;
    currentPlaylist = "artists";
    if (searchQuery) clearSearch();
    
    const artistMap = new Map();
    songs.forEach(song => {
        if (!artistMap.has(song.artist)) {
            artistMap.set(song.artist, []);
        }
        artistMap.get(song.artist).push(song);
    });
    
    const sortedArtists = Array.from(artistMap.entries()).sort((a, b) => 
        a[0].localeCompare(b[0])
    );
    
    viewTitle.innerText = `Artists (${sortedArtists.length})`;
    renderArtists(sortedArtists);
    renderPlaylists();
}

function loadLiked() {
    currentSongs = songs.filter(s => s.liked);
    currentPlaylist = "liked";
    selectedArtist = null;
    if (searchQuery) {
        clearSearch();
    }
    viewTitle.innerText = `Liked Songs (${currentSongs.length})`;
    renderSongs(currentSongs, false);
    renderPlaylists();
}

function loadAll() {
    currentSongs = songs;
    currentPlaylist = null;
    selectedArtist = null;
    if (searchQuery) {
        clearSearch();
    }
    updateCachedSongsUI(false);
    renderSongs(currentSongs, false);
    renderPlaylists();
    viewTitle.innerText = `All Songs (${songs.length})`;
}

function loadPlaylist(name) {
    if (playlists[name]) {
        currentSongs = songs.filter(s => playlists[name].includes(s.id));
        currentPlaylist = name;
        selectedArtist = null;
        if (searchQuery) {
            clearSearch();
        }
        viewTitle.innerText = `${name} (${currentSongs.length})`;
        renderSongs(currentSongs, false);
        renderPlaylists();
    }
}

function renderPlaylists() {
    const playlistsList = document.getElementById("playlists");
    
    // Clear everything
    playlistsList.innerHTML = '';
    
    // Create All Songs
    const allLi = document.createElement("li");
    allLi.id = "allSongsLi";
    if (currentPlaylist === null || currentPlaylist === "all") allLi.className = "active";
    allLi.onclick = function() { if (searchQuery) clearSearch(); loadAll(); };
    allLi.textContent = "All Songs";
    playlistsList.appendChild(allLi);
    
    // Create Artists
    const artistsLi = document.createElement("li");
    artistsLi.id = "artistsLi";
    if (currentPlaylist === "artists") artistsLi.className = "active";
    artistsLi.onclick = function() { if (searchQuery) clearSearch(); loadArtists(); };
    artistsLi.textContent = "🎤 Artists";
    playlistsList.appendChild(artistsLi);
    
    // Create Liked
    const likedLi = document.createElement("li");
    likedLi.id = "likedLi";
    if (currentPlaylist === "liked") likedLi.className = "active";
    likedLi.onclick = function() { if (searchQuery) clearSearch(); loadLiked(); };
    likedLi.textContent = "❤️ Liked";
    playlistsList.appendChild(likedLi);
    
    // Add user playlists
    for (const name in playlists) {
        const li = document.createElement("li");
        li.className = "playlist-item";
        if (currentPlaylist === name) li.classList.add("active");
        li.onclick = function() { if (searchQuery) clearSearch(); loadPlaylist(name); };
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "playlist-name";
        nameSpan.textContent = name;
        
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-playlist-btn";
        deleteBtn.title = "Delete playlist";
        deleteBtn.innerHTML = "🗑️";
        deleteBtn.onclick = function(e) {
            e.stopPropagation();
            showDeletePlaylistModal(name);
        };
        
        li.appendChild(nameSpan);
        li.appendChild(deleteBtn);
        playlistsList.appendChild(li);
    }
}

/* ========= SEARCH FUNCTIONS ========= */
function searchSongs() {
    if (!searchInput) return;
    
    searchQuery = searchInput.value.trim().toLowerCase();
    
    if (searchQuery === "") {
        filteredSongs = [];
        if (clearSearchBtn) clearSearchBtn.style.display = "none";
        renderCurrentView();
        return;
    }
    
    if (clearSearchBtn) clearSearchBtn.style.display = "block";
    
    filteredSongs = currentSongs.filter(song => {
        return song.title.toLowerCase().includes(searchQuery) ||
               song.artist.toLowerCase().includes(searchQuery) ||
               song.album.toLowerCase().includes(searchQuery);
    });
    
    if (filteredSongs.length > 0) {
        viewTitle.innerText = `Search Results (${filteredSongs.length})`;
    } else {
        viewTitle.innerText = `No results for "${searchQuery}"`;
    }
    
    renderSongs(filteredSongs, false);
    updatePlayingStateInList(false);
}

function clearSearch() {
    if (searchInput) searchInput.value = "";
    searchQuery = "";
    filteredSongs = [];
    if (clearSearchBtn) clearSearchBtn.style.display = "none";
    renderCurrentView();
}

function renderCurrentView() {
    if (currentPlaylist === null) {
        loadAll();
    } else if (currentPlaylist === "liked") {
        loadLiked();
    } else if (currentPlaylist === "artists") {
        loadArtists();
    } else if (currentPlaylist && currentPlaylist.startsWith("artist_")) {
        const artistName = currentPlaylist.replace("artist_", "");
        selectedArtist = artistName;
        const artistSongs = songs.filter(s => s.artist === artistName);
        artistSongs.sort((a, b) => a.title.localeCompare(b.title));
        currentSongs = artistSongs;
        viewTitle.innerText = `${artistName} (${currentSongs.length})`;
        renderSongs(currentSongs, false);
    } else {
        loadPlaylist(currentPlaylist);
    }
}

/* ========= HELPER FUNCTIONS ========= */
function formatTime(sec) {
    if (!sec) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
}

function updateLikeButton() {
    if (currentSongs[index]) {
        const song = currentSongs[index];
        const originalSong = songs.find(s => s.id === song.id);
        if (originalSong && originalSong.liked) {
            playerHeartBtn.classList.add('liked');
        } else {
            playerHeartBtn.classList.remove('liked');
        }
    }
}

function updateProgressBars() {
    if (audio.duration) {
        const progressPercent = (audio.currentTime / audio.duration) * 100;
        progress.style.setProperty('--progress', `${progressPercent}%`);
    }
    
    const volumePercent = audio.volume * 100;
    volume.style.setProperty('--volume', `${volumePercent}%`);
}

/* ========= TOGGLE STATE SAVING ========= */
function saveToggleState(songId, isDisabled) {
    if (isDisabled) {
        if (!disabledSongs.includes(songId)) {
            disabledSongs.push(songId);
        }
    } else {
        disabledSongs = disabledSongs.filter(id => id !== songId);
    }
    
    localStorage.setItem("disabledSongs", JSON.stringify(disabledSongs));
    
    const song = songs.find(s => s.id === songId);
    if (song) {
        song.disabled = isDisabled;
        saveSongsToCache();
    }
}

function toggleLike() {
    if (!currentSongs[index]) return;
    
    const song = currentSongs[index];
    const originalSong = songs.find(s => s.id === song.id);
    
    if (originalSong) {
        originalSong.liked = !originalSong.liked;
        song.liked = originalSong.liked;
        
        if (originalSong.liked) {
            if (!liked.includes(originalSong.id)) liked.push(originalSong.id);
        } else {
            liked = liked.filter(id => id !== originalSong.id);
        }
        
        localStorage.setItem("likedSongs", JSON.stringify(liked));
        updateLikeButton();
        
        const songRow = document.querySelector(`.song[data-id="${originalSong.id}"] .likeBtn`);
        if (songRow) {
            songRow.classList.toggle('liked', originalSong.liked);
        }
    }
}

function toggleSongLike(songId) {
    const originalSong = songs.find(s => s.id === songId);
    if (!originalSong) return;
    
    originalSong.liked = !originalSong.liked;
    
    const currentSong = currentSongs.find(s => s.id === songId);
    if (currentSong) {
        currentSong.liked = originalSong.liked;
    }
    
    if (originalSong.liked) {
        if (!liked.includes(originalSong.id)) liked.push(originalSong.id);
    } else {
        liked = liked.filter(id => id !== originalSong.id);
    }
    
    localStorage.setItem("likedSongs", JSON.stringify(liked));
    
    const songRow = document.querySelector(`.song[data-id="${songId}"] .likeBtn`);
    if (songRow) {
        songRow.classList.toggle('liked', originalSong.liked);
    }
    
    if (currentSongId === songId) {
        updateLikeButton();
    }
}

/* ========= PLAYLIST FUNCTIONS ========= */
function newPlaylist() {
    document.getElementById("playlistModal").style.display = "flex";
    document.getElementById("playlistName").focus();
}

function createPlaylist() {
    const name = document.getElementById("playlistName").value.trim();
    if (name) {
        if (!playlists[name]) {
            playlists[name] = [];
            localStorage.setItem("playlists", JSON.stringify(playlists));
            renderPlaylists();
        } else {
            alert("A playlist with that name already exists!");
        }
    }
    closeModal();
}

function showDeletePlaylistModal(playlistName) {
    playlistToDelete = playlistName;
    deletePlaylistMessage.textContent = `Are you sure you want to delete "${playlistName}"? This action cannot be undone.`;
    document.getElementById("deletePlaylistModal").style.display = "flex";
}

function confirmDeletePlaylist() {
    if (playlistToDelete && playlists[playlistToDelete]) {
        delete playlists[playlistToDelete];
        localStorage.setItem("playlists", JSON.stringify(playlists));
        
        if (currentPlaylist === playlistToDelete) {
            loadAll();
        }
        
        renderPlaylists();
        playlistToDelete = null;
    }
    
    closeDeleteModal();
}

function closeDeleteModal() {
    document.getElementById("deletePlaylistModal").style.display = "none";
    playlistToDelete = null;
}

function showAddToPlaylistModal(songId) {
    playlistOptions.innerHTML = "";
    currentSongId = songId;
    
    for (const name in playlists) {
        const div = document.createElement("div");
        div.className = "playlist-option";
        div.innerHTML = `
            <span>${name}</span>
            <button onclick="addToPlaylist('${name}', ${songId})">
                ${playlists[name].includes(songId) ? "Remove" : "Add"}
            </button>
        `;
        playlistOptions.appendChild(div);
    }
    
    if (Object.keys(playlists).length === 0) {
        playlistOptions.innerHTML = "<p>No playlists yet. Create one first!</p>";
    }
    
    document.getElementById("addToPlaylistModal").style.display = "flex";
}

function addToPlaylist(playlistName, songId) {
    if (!playlists[playlistName]) playlists[playlistName] = [];
    
    const index = playlists[playlistName].indexOf(songId);
    if (index === -1) {
        playlists[playlistName].push(songId);
    } else {
        playlists[playlistName].splice(index, 1);
    }
    
    localStorage.setItem("playlists", JSON.stringify(playlists));
    showAddToPlaylistModal(songId);
}

function closeModal() {
    document.getElementById("playlistModal").style.display = "none";
    document.getElementById("playlistName").value = "";
}

function closeAddModal() {
    document.getElementById("addToPlaylistModal").style.display = "none";
}

function sugg() {
    const url = "https://docs.google.com/forms/d/e/1FAIpQLSc2-D2zzAHNZ_qSi5KfAHnb5uIgtaGw2d_cutTVNJEK-UEOSA/viewform";
    const injectedHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;height:100%;background:#000}
iframe{border:0;width:100%;height:100%}
</style></head><body>
<iframe src="${url}" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen"></iframe>
</body></html>`;
    
    const formWindow = window.open("", "_blank", "width=800,height=600,resizable=yes,scrollbars=yes");
    
    if (formWindow) {
        formWindow.document.write(injectedHTML);
        formWindow.document.close();
        formWindow.focus();
    } else {
        window.open(url, "_blank");
    }
}

/* ========= BEAT VISUALIZER HELPER ========= */
function initBeatVisualizer() {
    const audioElement = document.getElementById('audio');
    beatVisualizer = new BeatVisualizer(audioElement);
    
    document.addEventListener('click', async function initOnInteraction() {
        if (beatVisualizer && !beatVisualizer.isInitialized) {
            await beatVisualizer.init();
            console.log('Beat visualizer ready');
        }
        document.removeEventListener('click', initOnInteraction);
    }, { once: true });
}

function updateConnectionStatus() {
    if (!connectionStatus) return;
    
    if (navigator.onLine) {
        connectionStatus.className = 'connection-status online';
        connectionStatus.innerHTML = '🌐 Online';
    } else {
        connectionStatus.className = 'connection-status offline';
        connectionStatus.innerHTML = '📶 Offline';
    }
}

/* ========= AUDIO EVENT HANDLERS ========= */
audio.onended = function () {
    console.log("Song ended. Autoplay state:", autoplay);
    removePlayingGifFromCover();
    
    if (beatVisualizer) {
        beatVisualizer.stop();
    }
    
    if (!cachingEnabled && currentSongId !== null) {
        const currentSong = songs.find(s => s.id === currentSongId);
        if (currentSong && currentSong.cached) {
            setTimeout(() => {
                removeFromCache(currentSong);
            }, 1000);
        }
    }
    
    if (autoplay) {
        console.log("Autoplay enabled, playing next song...");
        setTimeout(() => {
            const success = next();
            if (!success) {
                const firstEnabledIndex = currentSongs.findIndex(s => !s.disabled);
                if (firstEnabledIndex !== -1) {
                    console.log("Looping back to first enabled song at index:", firstEnabledIndex);
                    play(firstEnabledIndex);
                } else {
                    console.log("No enabled songs available");
                }
            }
        }, 800);
    } else {
        console.log("Autoplay disabled, stopping playback");
    }
};

audio.ontimeupdate = function () {
    if (audio.duration) {
        const progressValue = (audio.currentTime / audio.duration) * 100 || 0;
        progress.value = progressValue;
        progress.style.setProperty('--progress', `${progressValue}%`);
        timeText.innerText = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    }
};

audio.onvolumechange = function() {
    const volumeValue = audio.volume * 100;
    volume.value = audio.volume;
    volume.style.setProperty('--volume', `${volumeValue}%`);
};

audio.onloadstart = function() {
    if (currentSongs[index]) {
        now.innerText = `Loading "${currentSongs[index].title}"...`;
    } else {
        now.innerText = "Loading...";
    }
};

audio.oncanplay = function() {
    if (currentSongs[index]) {
        now.innerText = `${currentSongs[index].title} • ${currentSongs[index].artist}`;
    }
};

audio.onerror = function() {
    console.error("Audio error occurred");
};

progress.oninput = function () {
    if (audio.duration) {
        const newTime = (progress.value / 100) * audio.duration;
        audio.currentTime = newTime;
        progress.style.setProperty('--progress', `${progress.value}%`);
    }
};

volume.oninput = function () {
    audio.volume = volume.value;
    volume.style.setProperty('--volume', `${volume.value * 100}%`);
};

sortSelect.onchange = function () {
    const v = sortSelect.value;
    const sorted = [...currentSongs];

    if (v === "artist") {
        sorted.sort((a, b) => a.artist.localeCompare(b.artist));
    } else if (v === "album") {
        sorted.sort((a, b) => (a.album || "").localeCompare(b.album || ""));
    }

    currentSongs = sorted;
    renderSongs(currentSongs, false);
    
    if (currentSongId !== null) {
        const newIndex = currentSongs.findIndex(song => song.id === currentSongId);
        if (newIndex !== -1) {
            index = newIndex;
        }
    }
};

/* ========= INITIALIZATION ========= */
window.onload = async function() {
    const savedAutoplay = localStorage.getItem("autoplay");
    if (savedAutoplay !== null) {
        autoplay = JSON.parse(savedAutoplay);
        document.querySelector(".icon.autoplay").classList.toggle("active", autoplay);
    }
    
    const savedShuffle = localStorage.getItem("shuffle");
    if (savedShuffle !== null) {
        shuffle = JSON.parse(savedShuffle);
        document.querySelector(".icon.shuffle").classList.toggle("active", shuffle);
    }
    
    const savedCaching = localStorage.getItem('cachingEnabled');
    if (savedCaching !== null) {
        cachingEnabled = JSON.parse(savedCaching);
        if (cachingToggle) {
            cachingToggle.checked = cachingEnabled;
        }
    }
    
    if (cachingToggle) {
        cachingToggle.addEventListener('change', toggleCaching);
    }
    
    audio.volume = 0.4;
    updateProgressBars();
    updateConnectionStatus();
    initBeatVisualizer();
    
    const scanBtn = document.createElement("button");
    scanBtn.className = "new-playlist";
    scanBtn.textContent = "🔍 Scan for songs";
    scanBtn.onclick = function() {
        rescanSongs();
    };
    scanBtn.style.marginTop = "10px";
    document.querySelector(".sidebar").appendChild(scanBtn);
    
    renderPlaylists();
    
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    viewTitle.innerText = "Loading...";
    list.innerHTML = '<div class="empty"><div class="spinner"></div><p>Connecting to GitHub API...</p></div>';
    
    scanWithGitHubAPI();
    
    window.onclick = function(event) {
        const modals = document.querySelectorAll(".modal");
        modals.forEach(function(modal) {
            if (event.target == modal) {
                if (modal.id === "playlistModal") {
                    closeModal();
                } else if (modal.id === "addToPlaylistModal") {
                    closeAddModal();
                } else if (modal.id === "deletePlaylistModal") {
                    closeDeleteModal();
                }
            }
        });
    };
};
