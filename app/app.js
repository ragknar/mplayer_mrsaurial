document.addEventListener('DOMContentLoaded', () => {
    // Referencias a elementos del DOM
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const lowBandSlider = document.getElementById('low-band');
    const midBandSlider = document.getElementById('mid-band');
    const highBandSlider = document.getElementById('high-band');
    const audioFileInput = document.getElementById('audio-file-input');
    const cueFileInput = document.getElementById('cue-file-input');
    const albumArtImg = document.getElementById('album-art');
    const trackTitle = document.getElementById('track-title');
    const trackArtist = document.getElementById('track-artist');

    let sound;
    let audioContext;
    try {
        // Inicializar el AudioContext después de una interacción del usuario es más seguro
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        alert('La Web Audio API no es soportada en este navegador.');
        console.error(e);
    }
    
    let lowFilter, midFilter, highFilter, gainNode;
    let cueSheet = null;
    let currentTrackIndex = 0;
    let playlist = []; // Para manejar múltiples archivos o pistas de CUE

    // Inicializar Nodos de Web Audio API
    function setupAudioNodes() {
        if (!audioContext) return;
        
        // El "Source" será el stream de Howler
        const source = Howler.masterGain;

        lowFilter = audioContext.createBiquadFilter();
        lowFilter.type = 'lowshelf';
        lowFilter.frequency.value = 320; // Frecuencia para los bajos

        midFilter = audioContext.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000; // Frecuencia para los medios
        midFilter.Q.value = 0.8;

        highFilter = audioContext.createBiquadFilter();
        highFilter.type = 'highshelf';
        highFilter.frequency.value = 3200; // Frecuencia para los agudos

        gainNode = audioContext.createGain();

        // Conectar los nodos en cadena: Source -> EQ -> Volumen -> Salida
        source.connect(lowFilter);
        lowFilter.connect(midFilter);
        midFilter.connect(highFilter);
        highFilter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Inicializar los valores de los sliders
        lowFilter.gain.value = lowBandSlider.value;
        midFilter.gain.value = midBandSlider.value;
        highFilter.gain.value = highBandSlider.value;
        gainNode.gain.value = volumeSlider.value;
    }
    
    // Es buena práctica inicializar el AudioContext tras un gesto del usuario
    document.body.addEventListener('click', () => {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }, { once: true });

    setupAudioNodes();

    // Cargar y reproducir una URL de archivo
    function playFile(fileURL, fileExtension, trackInfo) {
        if (sound) {
            sound.unload();
        }

        sound = new Howl({
            src: [fileURL],
            format: [fileExtension],
            html5: true, // Crucial para usar Web Audio API con archivos locales
            onplay: () => playBtn.textContent = 'Pause',
            onpause: () => playBtn.textContent = 'Play',
            onstop: () => playBtn.textContent = 'Play',
            onend: () => {
                playBtn.textContent = 'Play';
                nextTrack(); // Intenta reproducir la siguiente al terminar
            },
            onloaderror: (id, err) => {
                console.error("Error de carga de Howl:", err);
                alert("No se pudo cargar el archivo de audio.");
            },
            onplayerror: (id, err) => {
                console.error("Error de reproducción de Howl:", err);
                alert("No se pudo reproducir el archivo. Asegúrate de haber hecho clic en la página primero.");
                // Intentar resumir el AudioContext puede ayudar
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
            }
        });
        
        sound.play();
        updateTrackInfo(trackInfo);
    }
    
    // Cargar archivo de audio individual
    audioFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        cueSheet = null; // Resetea el CUE si se carga un archivo individual
        playlist = [{
            file: file,
            title: file.name,
            performer: 'Desconocido'
        }];
        currentTrackIndex = 0;
        
        const fileURL = URL.createObjectURL(file);
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        playFile(fileURL, fileExtension, playlist[currentTrackIndex]);
        loadAlbumArt(file);
    });

    // Cargar CUE sheet
    cueFileInput.addEventListener('change', (event) => {
        const cueFile = event.target.files[0];
        if (!cueFile) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                cueSheet = CueParserPlus.parse(e.target.result);
                const audioFileName = cueSheet.files[0].name;
                alert(`Archivo CUE cargado para "${cueSheet.title}".\nAhora, por favor, carga el archivo de audio correspondiente: "${audioFileName}"`);
                
                // Pedir al usuario que cargue el archivo de audio asociado
                audioFileInput.onchange = (audioEvent) => {
                    const audioFile = audioEvent.target.files[0];
                    if (audioFile && audioFile.name === audioFileName) {
                        const fileURL = URL.createObjectURL(audioFile);
                        const fileExtension = audioFile.name.split('.').pop().toLowerCase();
                        
                        playlist = cueSheet.files[0].tracks;
                        currentTrackIndex = 0;
                        
                        playFile(fileURL, fileExtension, playlist[currentTrackIndex]);
                        playTrackFromCue(currentTrackIndex, false); // No buscar, solo actualizar info
                        loadAlbumArt(audioFile);
                    } else {
                        alert(`El archivo de audio no coincide. Se esperaba "${audioFileName}".`);
                    }
                    // Restaurar el comportamiento original del input de audio
                    audioFileInput.onchange = audioFileInputChangeHandler;
                };

            } catch(err) {
                alert("Error al procesar el archivo CUE.");
                console.error(err);
            }
        };
        reader.readAsText(cueFile);
    });
    // Guardar el manejador original para poder restaurarlo
    const audioFileInputChangeHandler = audioFileInput.onchange;

    // Controles de reproducción
    playBtn.addEventListener('click', () => {
        if (!sound) return;
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        if (sound.playing()) {
            sound.pause();
        } else {
            sound.play();
        }
    });

    stopBtn.addEventListener('click', () => {
        if (sound) sound.stop();
    });
    
    function nextTrack() {
        if (playlist.length <= 1) return;
        if (currentTrackIndex < playlist.length - 1) {
            currentTrackIndex++;
            if (cueSheet) {
                playTrackFromCue(currentTrackIndex, true);
            } else {
                // Lógica para listas de reproducción de archivos individuales (no implementado en UI)
            }
        }
    }

    function prevTrack() {
        if (playlist.length <= 1) return;
        if (currentTrackIndex > 0) {
            currentTrackIndex--;
            if (cueSheet) {
                playTrackFromCue(currentTrackIndex, true);
            } else {
                // Lógica para listas de reproducción de archivos individuales
            }
        }
    }

    nextBtn.addEventListener('click', nextTrack);
    prevBtn.addEventListener('click', prevTrack);
    
    function playTrackFromCue(trackIndex, doSeek) {
        if (!sound || !cueSheet) return;
        const track = playlist[trackIndex];
        updateTrackInfo(track);
        
        if (doSeek) {
            // El índice 0 del CUE suele ser la pre-pausa, el 1 es el inicio real
            const index = track.indexes.find(i => i.number === 1) || track.indexes[0];
            const offset = index.time.min * 60 + index.time.sec + index.time.frame / 75.0;
            
            sound.seek(offset);
            if (!sound.playing()) sound.play();
        }
    }

    // Controles de EQ y Volumen
    volumeSlider.addEventListener('input', (e) => {
        if (gainNode) gainNode.gain.value = e.target.value;
    });
    lowBandSlider.addEventListener('input', (e) => {
        if (lowFilter) lowFilter.gain.value = e.target.value;
    });
    midBandSlider.addEventListener('input', (e) => {
        if (midFilter) midFilter.gain.value = e.target.value;
    });
    highBandSlider.addEventListener('input', (e) => {
        if (highFilter) highFilter.gain.value = e.target.value;
    });

    // Lógica para carátula y metadatos
    function updateTrackInfo(track) {
        trackTitle.textContent = track.title || 'Título Desconocido';
        trackArtist.textContent = track.performer || 'Artista Desconocido';
    }

    function loadAlbumArt(file) {
        albumArtImg.src = 'placeholder.png'; // Resetear a placeholder
        // 1. Intentar leer desde metadatos del archivo
        jsmediatags.read(file, {
            onSuccess: function(tag) {
                const { data, format } = tag.tags.picture || {};
                if (data) {
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) {
                        base64String += String.fromCharCode(data[i]);
                    }
                    albumArtImg.src = `data:${format};base64,${window.btoa(base64String)}`;
                } else {
                    // 2. Si no hay, buscar en MusicBrainz
                    fetchAlbumArtFromAPI(tag.tags.artist, tag.tags.album);
                }
            },
            onError: function(error) {
                console.log('Error leyendo tags:', error.type);
                // No se pudo leer el tag, no hacer nada y dejar el placeholder.
            }
        });
    }

    async function fetchAlbumArtFromAPI(artist, album) {
        if (!artist || !album) {
            return;
        }
        try {
            // Usar un proxy CORS si es necesario, o configurar el servidor para ello.
            // Para simplicidad, aquí se hace la llamada directa.
            const searchUrl = `https://musicbrainz.org/ws/2/release/?query=artist:"${encodeURIComponent(artist)}" AND release:"${encodeURIComponent(album)}"&fmt=json`;
            const searchResponse = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'MiReproductorWeb/1.0 ( miemail@ejemplo.com )' // Política de MusicBrainz
                }
            });

            if (!searchResponse.ok) throw new Error(`Error en MusicBrainz: ${searchResponse.statusText}`);
            
            const searchData = await searchResponse.json();
            
            if (searchData.releases && searchData.releases.length > 0) {
                const releaseId = searchData.releases[0].id;
                const artUrl = `https://coverartarchive.org/release/${releaseId}/front`;
                
                // La API de Cover Art Archive a menudo redirige. La etiqueta <img> maneja esto.
                albumArtImg.src = artUrl;
                // Manejar el caso en que la imagen no cargue
                albumArtImg.onerror = () => { albumArtImg.src = 'placeholder.png'; };
            }
        } catch (error) {
            console.error("Error al buscar carátula:", error);
        }
    }
});
