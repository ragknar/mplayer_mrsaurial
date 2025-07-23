document.addEventListener('DOMContentLoaded', () => {
    // --- Selección de Elementos del DOM ---
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const stopBtn = document.getElementById('stop-btn');
    const progressBar = document.getElementById('progress-bar');
    const trackTitle = document.getElementById('track-title');
    const fileInput = document.getElementById('file-input');
    const playlistElement = document.getElementById('playlist');
    const albumArt = document.getElementById('album-art');
    const downloadArtBtn = document.getElementById('download-art-btn');
    const bassSlider = document.getElementById('bass-eq');
    const midSlider = document.getElementById('mid-eq');
    const trebleSlider = document.getElementById('treble-eq');

    // --- Variables de Estado ---
    let sound;
    let playlist = [];
    let cueData = null;
    let audioFile = null;
    let imageFile = null; // Archivo de imagen seleccionado por el usuario
    let currentTrackIndex = 0;
    let isPlaying = false;
    let updateInterval;

    // --- Web Audio API para el Ecualizador ---
    let bassFilter, midFilter, trebleFilter;

    function setupEqualizer() {
        if (!Howler.ctx) return;
        const audioCtx = Howler.ctx;
        bassFilter = audioCtx.createBiquadFilter();
        midFilter = audioCtx.createBiquadFilter();
        trebleFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf'; bassFilter.frequency.value = 250;
        midFilter.type = 'peaking'; midFilter.frequency.value = 1000; midFilter.Q.value = Math.SQRT1_2;
        trebleFilter.type = 'highshelf'; trebleFilter.frequency.value = 4000;
        Howler.masterGain.connect(bassFilter);
        bassFilter.connect(midFilter);
        midFilter.connect(trebleFilter);
        trebleFilter.connect(audioCtx.destination);
        bassSlider.addEventListener('input', (e) => bassFilter.gain.value = parseInt(e.target.value));
        midSlider.addEventListener('input', (e) => midFilter.gain.value = parseInt(e.target.value));
        trebleSlider.addEventListener('input', (e) => trebleFilter.gain.value = parseInt(e.target.value));
    }

    if (Howler.ctx) { setupEqualizer(); } else { Howler.once('ready', setupEqualizer); }

    function parseCueSheet(text) {
        const lines = text.split('\n'); const data = { audioFile: null, tracks: [] }; let currentTrack = null;
        const fileRegex = /FILE\s+"([^"]+)"/; const trackRegex = /TRACK\s+(\d+)\s+AUDIO/; const titleRegex = /TITLE\s+"([^"]+)"/; const indexRegex = /INDEX\s+01\s+(\d{2}):(\d{2}):(\d{2})/;
        lines.forEach(line => {
            let match; if ((match = line.match(fileRegex))) { data.audioFile = match[1]; } else if ((match = line.match(trackRegex))) { if (currentTrack) data.tracks.push(currentTrack); currentTrack = { id: parseInt(match[1]), title: 'Sin Título', startTime: 0 }; } else if (currentTrack && (match = line.match(titleRegex))) { currentTrack.title = match[1]; } else if (currentTrack && (match = line.match(indexRegex))) { currentTrack.startTime = (parseInt(match[1]) * 60) + parseInt(match[2]) + (parseInt(match[3]) / 75.0); }
        });
        if (currentTrack) data.tracks.push(currentTrack); return data;
    }

    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        resetPlayer();

        imageFile = files.find(f => f.type.startsWith('image/')) || null;
        const audioFilesAndCues = files.filter(f => !f.type.startsWith('image/'));
        const cueFile = audioFilesAndCues.find(f => f.name.toLowerCase().endsWith('.cue'));

        if (cueFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                cueData = parseCueSheet(e.target.result);
                audioFile = audioFilesAndCues.find(f => f.name === cueData.audioFile);
                if (audioFile) { playlist = cueData.tracks; renderPlaylist(); loadTrack(0); } else { alert(`Error: Archivo de audio "${cueData.audioFile}" no encontrado.`); resetPlayer(); }
            };
            reader.readAsText(cueFile);
        } else {
            playlist = audioFilesAndCues; renderPlaylist(); if (playlist.length > 0) { loadTrack(0); }
        }
    });
    
    /**
     * NUEVO: Actualiza la carátula, priorizando imagen manual sobre la incrustada.
     * @param {File} audioTrackFile - El archivo de audio del que se extraerán los metadatos.
     */
    function updateAlbumArt(audioTrackFile) {
        // Prioridad 1: Imagen seleccionada manualmente
        if (imageFile) {
            const imageURL = URL.createObjectURL(imageFile);
            albumArt.src = imageURL;
            downloadArtBtn.href = imageURL;
            downloadArtBtn.download = imageFile.name;
            downloadArtBtn.style.display = 'block';
            return;
        }

        // Prioridad 2: Leer metadatos del archivo de audio
        jsmediatags.read(audioTrackFile, {
            onSuccess: (tag) => {
                const picture = tag.tags.picture;
                if (picture) {
                    let base64String = "";
                    for (let i = 0; i < picture.data.length; i++) {
                        base64String += String.fromCharCode(picture.data[i]);
                    }
                    const dataUrl = `data:${picture.format};base64,${window.btoa(base64String)}`;
                    albumArt.src = dataUrl;
                    downloadArtBtn.href = dataUrl;
                    downloadArtBtn.download = 'cover.jpg';
                    downloadArtBtn.style.display = 'block';
                } else {
                    resetArtToPlaceholder();
                }
            },
            onError: (error) => {
                console.log('No se pudieron leer los metadatos:', error.type, error.info);
                resetArtToPlaceholder();
            }
        });
    }
    
    function resetArtToPlaceholder() {
        albumArt.src = 'placeholder.png';
        downloadArtBtn.style.display = 'none';
        downloadArtBtn.href = '#';
    }
    
    function resetPlayer() {
        if (sound) { sound.stop(); sound.unload(); sound = null; }
        playlist = []; cueData = null; audioFile = null; imageFile = null;
        playlistElement.innerHTML = '';
        trackTitle.textContent = 'Selecciona una canción';
        progressBar.value = 0;
        resetArtToPlaceholder();
    }
    
    function renderPlaylist() {
        playlistElement.innerHTML = '';
        playlist.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = item.title || item.name;
            li.addEventListener('click', () => { loadTrack(index); playTrack(); });
            playlistElement.appendChild(li);
        });
    }

    function loadTrack(index) {
        if (sound && (!cueData || sound.src !== URL.createObjectURL(audioFile))) {
             sound.unload(); sound = null;
        }
        currentTrackIndex = index;
        const currentItem = playlist[currentTrackIndex];

        if (cueData && audioFile) {
            trackTitle.textContent = currentItem.title;
            updateAlbumArt(audioFile); // Actualizar carátula para el álbum CUE
            if (!sound) {
                const fileURL = URL.createObjectURL(audioFile);
                sound = new Howl({ src: [fileURL], format: [audioFile.name.split('.').pop()], html5: true, onplay: onPlay, onpause: onPause, onstop: onStop, onend: playNext });
            }
        } else {
            trackTitle.textContent = currentItem.name;
            updateAlbumArt(currentItem); // Actualizar carátula para la pista individual
            const fileURL = URL.createObjectURL(currentItem);
            sound = new Howl({ src: [fileURL], format: [currentItem.name.split('.').pop()], html5: true, onplay: onPlay, onpause: onPause, onstop: onStop, onend: playNext });
        }
    }
    
    function playTrack() {
        if (!sound) return;
        if (cueData) { sound.seek(playlist[currentTrackIndex].startTime); }
        if (!sound.playing()) { sound.play(); }
    }

    function pauseTrack() { if (sound && sound.playing()) sound.pause(); }
    function stopTrack() { if (sound) sound.stop(); }
    function playPauseToggle() { if (!sound) return; sound.playing() ? pauseTrack() : playTrack(); }
    function playNext() { const nextIndex = (currentTrackIndex + 1) % playlist.length; if(playlist.length > 0) { loadTrack(nextIndex); playTrack(); } }
    function playPrev() { const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length; if(playlist.length > 0) { loadTrack(prevIndex); playTrack(); } }

    function onPlay() { playPauseBtn.textContent = 'Pause'; isPlaying = true; updateInterval = setInterval(updateProgress, 100); }
    function onPause() { playPauseBtn.textContent = 'Play'; isPlaying = false; clearInterval(updateInterval); }
    function onStop() { playPauseBtn.textContent = 'Play'; isPlaying = false; clearInterval(updateInterval); progressBar.value = 0; }

    function updateProgress() {
        if (!sound || !sound.playing()) return;
        const duration = sound.duration(); const seek = sound.seek() || 0;
        if (cueData) {
            const currentTrack = playlist[currentTrackIndex];
            const nextTrack = playlist[currentTrackIndex + 1];
            const trackStart = currentTrack.startTime;
            const trackEnd = nextTrack ? nextTrack.startTime : duration;
            if(seek >= trackEnd && currentTrackIndex < playlist.length - 1) { playNext(); return; }
            const trackDuration = trackEnd - trackStart; const displaySeek = seek - trackStart;
            progressBar.value = (displaySeek / trackDuration) * 100 || 0;
        } else {
            progressBar.value = (seek / duration) * 100 || 0;
        }
    }

    progressBar.addEventListener('input', function() {
        if (!sound) return; const duration = sound.duration();
        if (cueData) {
             const currentTrack = playlist[currentTrackIndex]; const nextTrack = playlist[currentTrackIndex + 1]; const trackStart = currentTrack.startTime; const trackEnd = nextTrack ? nextTrack.startTime : duration; const trackDuration = trackEnd - trackStart;
             sound.seek(trackStart + (trackDuration * (this.value / 100)));
        } else {
            sound.seek((this.value / 100) * duration);
        }
    });

    playPauseBtn.addEventListener('click', playPauseToggle);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);
    stopBtn.addEventListener('click', stopTrack);
});