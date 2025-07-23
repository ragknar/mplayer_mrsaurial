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
    let imageFile = null;
    let currentTrackIndex = 0;
    let isPlaying = false;
    let updateInterval;

    // --- Variables de Web Audio API para el Ecualizador ---
    let bassFilter, midFilter, trebleFilter;

    /**
     * Configura la cadena de filtros del ecualizador.
     */
    function setupEqualizer() {
        const audioCtx = Howler.ctx;

        // Crear los 3 filtros
        bassFilter = audioCtx.createBiquadFilter();
        midFilter = audioCtx.createBiquadFilter();
        trebleFilter = audioCtx.createBiquadFilter();

        // Configurar tipo de filtro y frecuencias
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 250; // Frecuencias graves por debajo de 250 Hz

        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000; // Frecuencias medias alrededor de 1 kHz
        midFilter.Q.value = Math.SQRT1_2; // Calidad del filtro

        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 4000; // Frecuencias agudas por encima de 4 kHz

        // Conectar la cadena de audio:
        // La salida principal de Howler se conecta al primer filtro (graves)
        // Graves -> Medios -> Agudos -> Salida final (altavoces)
        Howler.masterGain.connect(bassFilter);
        bassFilter.connect(midFilter);
        midFilter.connect(trebleFilter);
        trebleFilter.connect(audioCtx.destination);

        // Asignar eventos a los sliders del ecualizador
        bassSlider.addEventListener('input', (e) => bassFilter.gain.value = parseInt(e.target.value));
        midSlider.addEventListener('input', (e) => midFilter.gain.value = parseInt(e.target.value));
        trebleSlider.addEventListener('input', (e) => trebleFilter.gain.value = parseInt(e.target.value));
    }

    // Inicializar el ecualizador tan pronto como el contexto de audio esté listo
    if (Howler.ctx) {
        setupEqualizer();
    } else {
        Howler.once('ready', setupEqualizer);
    }
    
    // El resto del código es muy similar, con modificaciones para manejar la imagen.
    // ... (función parseCueSheet sin cambios) ...
    function parseCueSheet(text) {
        const lines = text.split('\n');
        const data = { audioFile: null, tracks: [] };
        let currentTrack = null;

        const fileRegex = /FILE\s+"([^"]+)"/;
        const trackRegex = /TRACK\s+(\d+)\s+AUDIO/;
        const titleRegex = /TITLE\s+"([^"]+)"/;
        const indexRegex = /INDEX\s+01\s+(\d{2}):(\d{2}):(\d{2})/;

        lines.forEach(line => {
            let match;
            if ((match = line.match(fileRegex))) {
                data.audioFile = match[1];
            } else if ((match = line.match(trackRegex))) {
                if (currentTrack) data.tracks.push(currentTrack);
                currentTrack = { id: parseInt(match[1]), title: 'Sin Título', startTime: 0 };
            } else if (currentTrack && (match = line.match(titleRegex))) {
                currentTrack.title = match[1];
            } else if (currentTrack && (match = line.match(indexRegex))) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const frames = parseInt(match[3]);
                currentTrack.startTime = (minutes * 60) + seconds + (frames / 75.0);
            }
        });
        if (currentTrack) data.tracks.push(currentTrack);
        return data;
    }

    /**
     * Maneja el evento de cambio del input de archivos.
     */
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        resetPlayer();

        // Buscar una imagen entre los archivos seleccionados
        imageFile = files.find(f => f.type.startsWith('image/'));
        if (imageFile) {
            handleImageFile(imageFile);
        }

        const audioFiles = files.filter(f => !f.type.startsWith('image/'));
        const cueFile = audioFiles.find(f => f.name.toLowerCase().endsWith('.cue'));

        if (cueFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                cueData = parseCueSheet(e.target.result);
                audioFile = audioFiles.find(f => f.name === cueData.audioFile);

                if (audioFile) {
                    playlist = cueData.tracks;
                    renderPlaylist();
                    loadTrack(0);
                } else {
                    alert(`Error: No se encontró el archivo "${cueData.audioFile}".`);
                    // Fallback a carga normal
                    cueData = null;
                    playlist = audioFiles.filter(f => !f.name.toLowerCase().endsWith('.cue'));
                    renderPlaylist();
                    if(playlist.length > 0) loadTrack(0);
                }
            };
            reader.readAsText(cueFile);
        } else {
            cueData = null;
            audioFile = null;
            playlist = audioFiles;
            renderPlaylist();
            if (playlist.length > 0) {
                loadTrack(0);
            }
        }
    });
    
    /**
     * Muestra la imagen seleccionada y prepara el botón de descarga.
     * @param {File} file - El archivo de imagen.
     */
    function handleImageFile(file) {
        const imageURL = URL.createObjectURL(file);
        albumArt.src = imageURL;
        downloadArtBtn.href = imageURL;
        downloadArtBtn.download = file.name;
        downloadArtBtn.style.display = 'inline-block';
    }

    /**
     * Resetea el reproductor a su estado inicial.
     */
    function resetPlayer() {
        if (sound) {
            sound.stop();
            sound.unload();
            sound = null;
        }
        playlist = [];
        playlistElement.innerHTML = '';
        trackTitle.textContent = 'Selecciona una canción';
        progressBar.value = 0;
        cueData = null;
        audioFile = null;
        imageFile = null;
        albumArt.src = 'placeholder.png'; // Vuelve al placeholder
        downloadArtBtn.style.display = 'none';
    }

    // --- El resto de las funciones (renderPlaylist, loadTrack, controles)
    // permanecen muy similares, solo asegúrate de que onStop resetea todo bien.
    
    function renderPlaylist() {
        playlistElement.innerHTML = '';
        playlist.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = item.title || item.name;
            li.addEventListener('click', () => {
                loadTrack(index);
                playTrack();
            });
            playlistElement.appendChild(li);
        });
    }

    function loadTrack(index) {
        if (sound && (!cueData || sound.src !== URL.createObjectURL(audioFile))) {
             sound.unload();
             sound = null;
        }
        
        currentTrackIndex = index;
        const currentItem = playlist[currentTrackIndex];

        if (cueData && audioFile) {
            trackTitle.textContent = currentItem.title;
            if (!sound) {
                const fileURL = URL.createObjectURL(audioFile);
                sound = new Howl({ src: [fileURL], format: [audioFile.name.split('.').pop()], html5: true, onplay: onPlay, onpause: onPause, onstop: onStop, onend: playNext });
            }
        } else {
            trackTitle.textContent = currentItem.name;
            const fileURL = URL.createObjectURL(currentItem);
            sound = new Howl({ src: [fileURL], format: [currentItem.name.split('.').pop()], html5: true, onplay: onPlay, onpause: onPause, onstop: onStop, onend: playNext });
        }
    }
    
    function playTrack() {
        if (!sound) return;
        if (cueData) {
            const track = playlist[currentTrackIndex];
            sound.seek(track.startTime);
        }
        if (!sound.playing()) {
            sound.play();
        }
    }

    function pauseTrack() { if (sound && sound.playing()) sound.pause(); }
    function stopTrack() { if (sound) sound.stop(); }
    function playPauseToggle() { if (!sound) return; sound.playing() ? pauseTrack() : playTrack(); }
    function playNext() { const nextIndex = (currentTrackIndex + 1) % playlist.length; loadTrack(nextIndex); playTrack(); }
    function playPrev() { const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length; loadTrack(prevIndex); playTrack(); }

    function onPlay() { playPauseBtn.textContent = 'Pause'; isPlaying = true; updateInterval = setInterval(updateProgress, 100); }
    function onPause() { playPauseBtn.textContent = 'Play'; isPlaying = false; clearInterval(updateInterval); }
    function onStop() { playPauseBtn.textContent = 'Play'; isPlaying = false; clearInterval(updateInterval); progressBar.value = 0; }

    function updateProgress() {
        if (!sound || !sound.playing()) return;
        const duration = sound.duration();
        const seek = sound.seek() || 0;
        if (cueData) {
            const currentTrack = playlist[currentTrackIndex];
            const nextTrack = playlist[currentTrackIndex + 1];
            const trackStart = currentTrack.startTime;
            const trackEnd = nextTrack ? nextTrack.startTime : duration;
            if(seek >= trackEnd && currentTrackIndex < playlist.length - 1) { playNext(); return; }
            const trackDuration = trackEnd - trackStart;
            const displaySeek = seek - trackStart;
            progressBar.value = (displaySeek / trackDuration) * 100 || 0;
        } else {
            progressBar.value = (seek / duration) * 100 || 0;
        }
    }

    progressBar.addEventListener('input', function() {
        if (!sound) return;
        const duration = sound.duration();
        if (cueData) {
             const currentTrack = playlist[currentTrackIndex];
             const nextTrack = playlist[currentTrackIndex + 1];
             const trackStart = currentTrack.startTime;
             const trackEnd = nextTrack ? nextTrack.startTime : duration;
             const trackDuration = trackEnd - trackStart;
             const seekTo = trackStart + (trackDuration * (this.value / 100));
             sound.seek(seekTo);
        } else {
            sound.seek((this.value / 100) * duration);
        }
    });

    playPauseBtn.addEventListener('click', playPauseToggle);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);
    stopBtn.addEventListener('click', stopTrack);
});