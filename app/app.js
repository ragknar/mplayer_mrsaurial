// ... al principio de app.js
document.addEventListener('DOMContentLoaded', () => {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const stopBtn = document.getElementById('stop-btn'); // <-- AÑADIR ESTA LÍNEA
    const progressBar = document.getElementById('progress-bar');
    // ... resto de constantes
document.addEventListener('DOMContentLoaded', () => {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress-bar');
    const trackTitle = document.getElementById('track-title');
    const fileInput = document.getElementById('file-input');
    const playlistElement = document.getElementById('playlist');

    let sound;
    let playlist = []; // Puede ser una lista de archivos o una lista de pistas de CUE
    let cueData = null; // Almacenará los datos de la CUE sheet
    let audioFile = null; // El archivo de audio principal para la CUE sheet
    let currentTrackIndex = 0;
    let isPlaying = false;
    let updateInterval;

    // --- NUEVA FUNCIÓN: Analizador de CUE Sheet ---
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
            if (match = line.match(fileRegex)) {
                data.audioFile = match[1];
            } else if (match = line.match(trackRegex)) {
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

    // --- LÓGICA DE CARGA DE ARCHIVOS ACTUALIZADA ---
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        const cueFile = files.find(f => f.name.toLowerCase().endsWith('.cue'));

        if (cueFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                cueData = parseCueSheet(e.target.result);
                // Buscar el archivo de audio referenciado en la CUE sheet entre los seleccionados
                audioFile = files.find(f => f.name === cueData.audioFile);

                if (audioFile) {
                    playlist = cueData.tracks; // La playlist ahora son las pistas del CUE
                    renderPlaylist();
                    loadTrack(0); // Cargar la primera pista del CUE
                } else {
                    alert(`Error: No se encontró el archivo de audio "${cueData.audioFile}" referenciado en el .cue.`);
                    // Volver al modo normal si no se encuentra el audio
                    cueData = null;
                    playlist = files.filter(f => !f.name.toLowerCase().endsWith('.cue'));
                    renderPlaylist();
                    if(playlist.length > 0) loadTrack(0);
                }
            };
            reader.readAsText(cueFile);
        } else {
            // Comportamiento original si no hay archivo .cue
            cueData = null;
            audioFile = null;
            playlist = files;
            renderPlaylist();
            if (playlist.length > 0) {
                loadTrack(0);
            }
        }
    });

    function renderPlaylist() {
        playlistElement.innerHTML = '';
        playlist.forEach((item, index) => {
            const li = document.createElement('li');
            // Muestra el título de la pista si viene de un CUE, o el nombre de archivo si no
            li.textContent = item.title || item.name;
            li.addEventListener('click', () => {
                loadTrack(index);
                playTrack();
            });
            playlistElement.appendChild(li);
        });
    }

    // --- LÓGICA DE CARGA DE PISTA ACTUALIZADA ---
    function loadTrack(index) {
        if (sound && (!cueData || sound.src !== URL.createObjectURL(audioFile))) {
             sound.unload(); // Descarga solo si es un sonido anterior o diferente al CUE
        }
        
        currentTrackIndex = index;
        const currentItem = playlist[currentTrackIndex];

        if (cueData && audioFile) {
            // --- Modo CUE Sheet ---
            trackTitle.textContent = currentItem.title;
            if (!sound) { // Cargar el archivo de audio grande solo una vez
                const fileURL = URL.createObjectURL(audioFile);
                sound = new Howl({
                    src: [fileURL],
                    format: [audioFile.name.split('.').pop()],
                    html5: true,
                    onplay: onPlay,
                    onpause: onPause,
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
                onend: playNext
            });
        }
    }

    function playTrack() {
        if (!sound) return;

        if (cueData) {
            // Si estamos en modo CUE, salta al tiempo correcto antes de reproducir
            const track = playlist[currentTrackIndex];
            sound.seek(track.startTime);
        }
        
        if (!isPlaying) {
            sound.play();
        }
    }

    // Funciones de control separadas para mayor claridad
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
    
    function pauseTrack() {
        if (sound && isPlaying) sound.pause();
    }
    
    function playPauseToggle() {
        isPlaying ? pauseTrack() : playTrack();
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

    // --- ACTUALIZACIÓN DEL PROGRESO MEJORADA ---
    function updateProgress() {
        if (!sound || !sound.playing()) return;

        let duration = sound.duration();
        let seek = sound.seek() || 0;
        let displaySeek = seek;
        
        if (cueData) {
            // Ajustar la barra de progreso para que represente la pista actual, no el álbum completo
            const currentTrack = playlist[currentTrackIndex];
            const nextTrack = playlist[currentTrackIndex + 1];
            const trackStart = currentTrack.startTime;
            const trackEnd = nextTrack ? nextTrack.startTime : duration;

            const trackDuration = trackEnd - trackStart;
            displaySeek = seek - trackStart;
            
            progressBar.value = (displaySeek / trackDuration) * 100 || 0;

            // Avance automático a la siguiente pista del CUE
            if(seek >= trackEnd) {
                playNext();
            }
        } else {
            progressBar.value = (seek / duration) * 100 || 0;
        }
    }

    progressBar.addEventListener('input', function() {
        if (!sound) return;
        let duration = sound.duration();
        
        if (cueData) {
             const currentTrack = playlist[currentTrackIndex];
             const nextTrack = playlist[currentTrackIndex + 1];
             const trackStart = currentTrack.startTime;
             const trackEnd = nextTrack ? nextTrack.startTime : duration;
             const trackDuration = trackEnd - trackStart;
             
             // Convertir el valor de la barra (0-100) a un tiempo absoluto en el álbum
             const seekTo = trackStart + (trackDuration * (this.value / 100));
             sound.seek(seekTo);
        } else {
            sound.seek((this.value / 100) * duration);
        }
    });

    playPauseBtn.addEventListener('click', playPauseToggle);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);
});
