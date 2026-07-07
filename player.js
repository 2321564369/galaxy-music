/* ========= CONFIGURATION ========= */
const music_FOLDER = "https://2321564369.github.io/galaxy-music/music/";
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
var autoplay = false;
var currentSongId = null;
var liked = JSON.parse(localStorage.getItem("likedSongs")) || [];
var playlists = JSON.parse(localStorage.getItem("playlists")) || {};
var disabledSongs = JSON.parse(localStorage.getItem("disabledSongs")) || [];
var currentPlaylist = null;
var playlistToDelete = null;

/* ========= ELEMENTS ========= */
var audio = document.getElementById("audio");
var list = document.getElementById("songList");
var cover = document.getElementById("cover");
var now = document.getElementById("nowPlaying");
var progress = document.getElementById("progress");
var volume = document.getElementById("volume");
var timeText = document.getElementById("timeText");
var playlistOptions = document.getElementById("playlistOptions");
var playerHeartBtn = document.getElementById("playerHeartBtn");
var viewTitle = document.getElementById("viewTitle");
var deletePlaylistMessage = document.getElementById("deletePlaylistMessage");
var connectionStatus = document.getElementById("connectionStatus");
var searchInput = document.getElementById("searchInput");
var clearSearchBtn = document.getElementById("clearSearchBtn");

/* ========= BEAT VISUALIZER CONFIG ========= */
var beatVisualizer = null;
var VISUALIZER_CONFIG = {
  numBars: 30,
  sensitivity: 5,
  smoothing: 0,
  maxHeight: 150,
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
      
      this.analyser.fftSize = 256;
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
        
        const bar = this.bars[i];
        bar.style.height = `${height}px`;
        
        if (normalized > 0.7) {
          bar.classList.add('active');
          setTimeout(() => bar.classList.remove('active'), 150);
        }
        
        const glowIntensity = Math.min(normalized * 30, 30);
        if (i < Math.floor(barCount / 3)) {
          bar.style.boxShadow = `0 0 ${glowIntensity}px rgba(124, 58, 237, ${normalized * 0.4})`;
        } else if (i < Math.floor(barCount * 2 / 3)) {
          bar.style.boxShadow = `0 0 ${glowIntensity}px rgba(14, 165, 233, ${normalized * 0.4})`;
        } else {
          bar.style.boxShadow = `0 0 ${glowIntensity}px rgba(16, 185, 129, ${normalized * 0.4})`;
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
}

/* ========= FILENAME PARSING ========= */
function parseFilename(filename) {
  const name = filename.replace(/\.mp3$/i, '');
  
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
  if (!coverFilesCache || coverFilesCache.length === 0) {
    return null;
  }
  
  const baseName = mp3Filename.replace(/\.mp3$/i, '').toLowerCase();
  
  const exactMatch = coverFilesCache.find(cover => {
    const coverBase = cover.replace(/\.[^.]+$/, '').toLowerCase();
    return coverBase === baseName;
  });
  
  if (exactMatch) return exactMatch;
  
  const partialMatch = coverFilesCache.find(cover => {
    const coverBase = cover.replace(/\.[^.]+$/, '').toLowerCase();
    const normalizedBase = baseName.replace(/[^a-z0-9]/g, '');
    const normalizedCover = coverBase.replace(/[^a-z0-9]/g, '');
    return normalizedCover.includes(normalizedBase) || 
           normalizedBase.includes(normalizedCover);
  });
  
  if (partialMatch) return partialMatch;
  
  const genericCovers = ['cover.png', 'cover.jpg', 'album.png', 'album.jpg', 'folder.png', 'folder.jpg', 'cover.webp'];
  for (const generic of genericCovers) {
    if (coverFilesCache.includes(generic)) {
      return generic;
    }
  }
  
  return null;
}

async function getCoverArt(artist, title, filename) {
  const coverMismatches = {
    'the_mountain-epic-508009.mp3': 'the_montain-epic-508009.png'
  };
  
  if (coverMismatches[filename]) {
    const mappedCover = coverMismatches[filename];
    return `https://raw.githubusercontent.com/2321564369/galaxy-music/main/music/${encodeURIComponent(mappedCover)}`;
  }
  
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
    ['#ec4899', '#db2777'],
    ['#8b5cf6', '#7c3aed'],
    ['#14b8a6', '#0d9488'],
    ['#f97316', '#ea580c'],
    ['#6366f1', '#4f46e5']
  ];
  
  const colorSet = colors[artist.length % colors.length];
  const initials = artist
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 3);
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
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
  
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
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
    const fileUrl = `https://2321564369.github.io/galaxy-music/music/${encodeURIComponent(filename)}`;
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
    "Drowning Pool - Bodies (Official HD music Video).mp3",
    "Enter Sandman (Remastered).mp3",
    "Limp Bizkit - Break Stuff (Official music Video).mp3",
    "Master of Puppets (Remastered).mp3",
    "Papa Roach - Last Resort (Squeaky Clean Version) (Official music Video).mp3",
    "Rick Astley - Never Gonna Give You Up (Official music Video) [ ezmp3.cc ].mp3",
    "Spiderbait - Black Betty (Audio).mp3",
    "System Of A Down - Toxicity (Official HD Video).mp3",
    "_NSYNC - Bye Bye Bye (Lyrics) (Deadpool 3 Soundtrack) [ ezmp3.cc ].mp3"
  ];
  
  const foundFiles = [];
  
  for (const filename of commonFiles) {
    try {
      const url = `https://2321564369.github.io/galaxy-music/music/${encodeURIComponent(filename)}`;
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
    
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
    };
    
    audio.onerror = () => {
      resolve(180);
    };
    
    setTimeout(() => {
      resolve(180);
    }, 3000);
    
    audio.src = song.file;
  });
}

async function finishLoading(loadedSongs) {
  songs = loadedSongs;
  console.log(`Loaded ${songs.length} songs`);
  saveSongsToCache();
  loadAll();
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
    disabled: s.disabled || false
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
    filteredSongs = [];
    searchQuery = "";
    
    viewTitle.innerText = "Scanning...";
    list.innerHTML = '<div class="empty"><div class="spinner"></div><p>Scanning with GitHub API...</p></div>';
    
    scanWithGitHubAPI();
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
    
    // Search through current songs
    filteredSongs = currentSongs.filter(song => {
        return song.title.toLowerCase().includes(searchQuery) ||
               song.artist.toLowerCase().includes(searchQuery) ||
               song.album.toLowerCase().includes(searchQuery);
    });
    
    // Update the view title with search results
    if (filteredSongs.length > 0) {
        viewTitle.innerText = `Search Results (${filteredSongs.length})`;
    } else {
        viewTitle.innerText = `No results for "${searchQuery}"`;
    }
    
    // Render the filtered songs
    renderSongs(filteredSongs, false);
    
    // Remove playing state from search results
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
    } else {
        loadPlaylist(currentPlaylist);
    }
}

function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
}

/* ========= RENDER SONGS ========= */
function renderSongs(arr, shouldScroll = false) {
    if (!arr || arr.length === 0) {
        list.innerHTML = `
            <div class="empty">
                <p>No songs found</p>
                ${searchQuery ? `<p>Try a different search term</p>` : ''}
                <button onclick="rescanSongs()" class="scan-btn">Try Scanning Again</button>
            </div>`;
        return;
    }
    
    list.innerHTML = "";

    arr.forEach(function (s) {
        const row = document.createElement("div");
        row.className = "song" + (s.disabled ? " disabled" : "");
        row.dataset.id = s.id;

        const thumb = document.createElement("div");
        thumb.className = "thumb";
        thumb.style.backgroundImage = `url("${s.cover}")`;

        const info = document.createElement("div");
        info.className = "songInfo";
        
        const titleDiv = document.createElement("div");
        titleDiv.className = "songTitle";
        if (searchQuery && s.title.toLowerCase().includes(searchQuery)) {
            titleDiv.innerHTML = highlightText(s.title, searchQuery);
        } else {
            titleDiv.textContent = s.title;
        }
        
        const metaDiv = document.createElement("div");
        metaDiv.className = "songMeta";
        let metaText = `${s.artist} • ${s.album} • ${formatTime(s.duration)}`;
        if (searchQuery) {
            metaText = highlightText(metaText, searchQuery);
        }
        metaDiv.innerHTML = metaText;
        
        info.appendChild(titleDiv);
        info.appendChild(metaDiv);

        const toggle = document.createElement("label");
        toggle.className = "toggle-switch";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !s.disabled;
        checkbox.onchange = function (e) {
            const newDisabledState = !e.target.checked;
            s.disabled = newDisabledState;
            saveToggleState(s.id, newDisabledState);
            
            if (newDisabledState) {
                row.classList.add('disabled');
            } else {
                row.classList.remove('disabled');
            }
        };

        const slider = document.createElement("span");
        slider.className = "toggle-slider";

        toggle.appendChild(checkbox);
        toggle.appendChild(slider);

        const addBtn = document.createElement("button");
        addBtn.className = "addBtn";
        addBtn.innerHTML = "+";
        addBtn.title = "Add to playlist";
        addBtn.onclick = function(e) {
            e.stopPropagation();
            showAddToPlaylistModal(s.id);
        };

        const likeBtn = document.createElement("button");
        likeBtn.className = "likeBtn";
        likeBtn.title = "Like song";
        likeBtn.onclick = function(e) {
            e.stopPropagation();
            toggleSongLike(s.id);
        };
        
        const originalSong = songs.find(original => original.id === s.id);
        likeBtn.classList.toggle('liked', originalSong ? originalSong.liked : s.liked);

        const controlsDiv = document.createElement("div");
        controlsDiv.className = "songControls";
        controlsDiv.appendChild(likeBtn);
        controlsDiv.appendChild(addBtn);
        controlsDiv.appendChild(toggle);

        row.appendChild(thumb);
        row.appendChild(info);
        row.appendChild(controlsDiv);

        row.onclick = function () {
            if (!s.disabled) {
                const playIndex = currentSongs.findIndex(song => song.id === s.id);
                if (playIndex !== -1) play(playIndex);
            }
        };

        list.appendChild(row);
    });
    
    updatePlayingStateInList(shouldScroll);
}

/* ========= PLAYBACK FUNCTIONS ========= */
async function play(i) {
  if (!currentSongs || i < 0 || i >= currentSongs.length) return;
  
  index = i;
  const song = currentSongs[i];
  
  console.log("Playing song:", song.title);
  
  updateNowPlayingUI(song);
  
  if (beatVisualizer && !beatVisualizer.isInitialized) {
    await beatVisualizer.init();
  }
  
  if (beatVisualizer && beatVisualizer.isInitialized) {
    beatVisualizer.start();
  }
  
  audio.src = song.file;
  audio.crossOrigin = "anonymous";
  
  audio.play().then(() => {
    document.querySelector(".icon.play").classList.add("playing");
  }).catch(e => {
    console.error("Play error:", e);
    if (song.file.includes('2321564369.github.io')) {
      const fallbackUrl = song.file.replace('2321564369.github.io/galaxy-music/music/', 'raw.githubusercontent.com/2321564369/galaxy-music/main/music/');
      audio.src = fallbackUrl;
      audio.crossOrigin = "anonymous";
      audio.play().catch(err => {
        console.error("Fallback URL play error:", err);
        alert("Could not play this song. Please check your internet connection.");
      });
    } else {
      alert("Could not play this song. Please check your internet connection.");
    }
  });
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

/* ========= AUDIO EVENT HANDLERS ========= */
audio.onended = function () {
  removePlayingGifFromCover();
  
  if (beatVisualizer) {
    beatVisualizer.stop();
  }
  
  if (autoplay) {
    setTimeout(() => {
      const success = next();
      if (!success) {
        const firstEnabledIndex = currentSongs.findIndex(s => !s.disabled);
        if (firstEnabledIndex !== -1) {
          play(firstEnabledIndex);
        }
      }
    }, 800);
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

/* ========= UI FUNCTIONS ========= */
function loadAll() {
  currentSongs = songs;
  currentPlaylist = null;
  if (searchQuery) {
    clearSearch();
  }
  renderSongs(currentSongs, false);
  document.querySelectorAll("#playlists li").forEach(li => li.classList.remove("active"));
  document.querySelectorAll("#playlists li")[0].classList.add("active");
  viewTitle.innerText = `All Songs (${songs.length})`;
}

function loadLiked() {
  currentSongs = songs.filter(s => s.liked);
  currentPlaylist = "liked";
  if (searchQuery) {
    clearSearch();
  }
  viewTitle.innerText = `Liked Songs (${currentSongs.length})`;
  renderSongs(currentSongs, false);
  document.querySelectorAll("#playlists li").forEach(li => li.classList.remove("active"));
  document.querySelectorAll("#playlists li")[1].classList.add("active");
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

function renderPlaylists() {
  const playlistsList = document.getElementById("playlists");
  while (playlistsList.children.length > 2) {
    playlistsList.removeChild(playlistsList.lastChild);
  }
  
  for (const name in playlists) {
    const li = document.createElement("li");
    li.className = "playlist-item";
    li.onclick = function() { loadPlaylist(name); };
    
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

function loadPlaylist(name) {
  if (playlists[name]) {
    currentSongs = songs.filter(s => playlists[name].includes(s.id));
    currentPlaylist = name;
    if (searchQuery) {
      clearSearch();
    }
    viewTitle.innerText = `${name} (${currentSongs.length})`;
    renderSongs(currentSongs, false);
    
    document.querySelectorAll("#playlists li").forEach(li => li.classList.remove("active"));
    document.querySelectorAll("#playlists li").forEach(li => {
      if (li.querySelector('.playlist-name') && li.querySelector('.playlist-name').textContent === name) {
        li.classList.add("active");
      }
    });
  }
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

/* ========= BEAT VISUALIZER HELPER FUNCTIONS ========= */
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
  
  audio.volume = 0.4;
  audio.crossOrigin = "anonymous";
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
