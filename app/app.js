document.addEventListener('DOMContentLoaded', () => {
    // --- Selección de Elementos del DOM ---
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const stopBtn = document.getElementById('stop-btn'); // Botón Stop
    const progressBar = document.getElementById('progress-bar');
    const trackTitle = document.getElementById('track-title');
    const fileInput = document.getElementById('file-input');
    const playlistElement = document.getElementById('playlist');

    // --- Variables de Estado del Reproductor ---
    let sound;
    let playlist = [];
    let cueData = null;
    let audioFile = null;
    let currentTrackIndex = 0;
    let isPlaying = false;
    let updateInterval;

    /**
     * Analiza el contenido de un archivo .cue y lo convierte en un objeto estructurado.
     * @param {string} text - El contenido de texto del archivo .cue.
     * @returns {{audioFile: string, tracks: Array}} Objeto con el nombre del archivo de audio y un array de pistas.
     */
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
     * Maneja el evento de cambio del input de archivos, detectando si se ha cargado un .cue.
     */
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        const cueFile = files.find(f => f.name.toLowerCase().endsWith('.cue'));

        resetPlayer(); // Resetea el reproductor antes de cargar nuevos archivos

        if (cueFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                cueData = parseCueSheet(e.target.result);
                audioFile = files.find(f => f.name === cueData.audioFile);

                if (audioFile) {
                    playlist = cueData.tracks;
                    renderPlaylist();
                    loadTrack(0);
                } else {
                    alert(`Error: No se encontró el archivo de audio "${cueData.audioFile}" referenciado en el .cue. Cargando archivos individualmente.`);
                    cueData = null;
                    playlist = files.filter(f => !f.name.toLowerCase().endsWith('.cue'));
                    renderPlaylist();
                    if(playlist.length > 0) loadTrack(0);
                }
            };
            reader.readAsText(cueFile);
        } else {
            cueData = null;
            audioFile = null;
            playlist = files;
            renderPlaylist();
            if (playlist.length > 0) {
                loadTrack(0);
            }
        }
    });

    /**
     * Muestra las pistas en la lista de reproducción de la interfaz.
     */
    function renderPlaylist() {
        playlistElement.innerHTML = '';
        playlist.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = item.title || item.name; // Usa título de CUE o nombre de archivo
            li.addEventListener('click', () => {
                loadTrack(index);
                playTrack();
            });
            playlistElement.appendChild(li);
        });
    }

    /**
     * Carga una pista específica (ya sea un archivo individual o una pista de un CUE).
     * @param {number} index - El índice de la pista en la playlist.
     */
    function loadTrack(index) {
        // Descarga el sonido anterior solo si es necesario para liberar memoria.
        if (sound && (!cueData || sound.src !== URL.createObjectURL(audioFile))) {
             sound.unload();
             sound = null;
        }
        
        currentTrackIndex = index;
        const currentItem = playlist[currentTrackIndex];

        if (cueData && audioFile) {
            // --- Modo CUE Sheet ---
            trackTitle.textContent = currentItem.title;
            // Carga el archivo de audio grande solo una vez
            if (!sound) {
                const fileURL = URL.createObjectURL(audioFile);
                sound = new Howl({
                    src: [fileURL],
                    format: [audioFile.name.split('.').pop()],
                    html5: true,
                    onplay: onPlay,
                    onpause: onPause,
                    onstop: onStop, // Evento para el botón Stop
                    onend: playNext
                });
            }
        } else {
            // --- Modo Archivo Individual ---
            trackTitle.textContent = currentItem.name;
            const fileURL = URL.createObjectURL(currentItem);
            sound = new Howl({
                src: [fileURL],
                format: [currentItem.name.split('.').pop()],
                html5: true,
                onplay: onPlay,
                onpause: onPause,
                onstop: onStop, // Evento para el botón Stop
                onend: playNext
            });
        }
    }
    
    // --- FUNCIONES DE CONTROL DE REPRODUCCIÓN ---
    
    function playTrack() {
        if (!sound) return;

        // Si es un CUE, busca el tiempo de inicio antes de reproducir
        if (cueData) {
            const track = playlist[currentTrackIndex];
            sound.seek(track.startTime);
        }
        
        if (!sound.playing()) {
            sound.play();
        }
    }

    function pauseTrack() {
        if (sound && sound.playing()) {
            sound.pause();
        }
    }
    
    function stopTrack() {
        if (sound) {
            sound.stop();
        }
    }
    
    function playPauseToggle() {
        if (!sound) return;
        sound.playing() ? pauseTrack() : playTrack();
    }

    function playNext() {
        const nextIndex = (currentTrackIndex + 1) % playlist.length;
        loadTrack(nextIndex);
        playTrack();
    }

    function playPrev() {
        const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        loadTrack(prevIndex);
        playTrack();
    }

    // --- MANEJADORES DE EVENTOS DE HOWLER.JS ---

    function onPlay() {
        playPauseBtn.textContent = 'Pause';
        isPlaying = true;
        updateInterval = setInterval(updateProgress, 100);
    }

    function onPause() {
        playPauseBtn.textContent = 'Play';
        isPlaying = false;
        clearInterval(updateInterval);
    }
    
    function onStop() {
        playPauseBtn.textContent = 'Play';
        isPlaying = false;
        clearInterval(updateInterval);
        progressBar.value = 0;
    }

    // --- LÓGICA DE LA BARRA DE PROGRESO ---

    function updateProgress() {
        if (!sound || !sound.playing()) return;

        const duration = sound.duration();
        const seek = sound.seek() || 0;
        
        if (cueData) {
            const currentTrack = playlist[currentTrackIndex];
            const nextTrack = playlist[currentTrackIndex + 1];
            const trackStart = currentTrack.startTime;
            const trackEnd = nextTrack ? nextTrack.startTime : duration;

            // Avanza a la siguiente pista si se ha alcanzado el final de la actual
            if(seek >= trackEnd && currentTrackIndex < playlist.length - 1) {
                playNext();
                return;
            }

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

    /**
     * Resetea el estado del reproductor a su estado inicial.
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
    }

    // --- ASIGNACIÓN DE EVENTOS A LOS BOTONES ---
    playPauseBtn.addEventListener('click', playPauseToggle);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);
    stopBtn.addEventListener('click', stopTrack); // Evento para el botón Stop
});