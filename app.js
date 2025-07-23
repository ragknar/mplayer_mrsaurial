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
    let lowFilter, midFilter, highFilter, gainNode;
    let cueSheet = null;
    let playlist = [];
    let currentTrackIndex = 0;
    let currentAudioFile = null; // Para referencia al buscar carátula desde CUE

    // Función para inicializar el contexto de audio. Se llama después de un clic.
    function initAudioContext() {
        if (audioContext) return; // Ya está inicializado
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            setupAudioNodes();
            console.log("AudioContext inicializado correctamente.");
        } catch (e) {
            alert('La Web Audio API no es soportada en este navegador.');
            console.error(e);
        }
    }

    // Inicializar Nodos de Web Audio API (Ecualizador, Volumen)
    function setupAudioNodes() {
        if (!audioContext) return;
        
        // Conectaremos los nodos desde la salida maestra de Howler
        const source = Howler.masterGain;

        lowFilter = audioContext.createBiquadFilter();
        lowFilter.type = 'lowshelf';
        lowFilter.frequency.value = 320;

        midFilter = audioContext.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 0.8;

        highFilter = audioContext.createBiquadFilter();
        highFilter.type = 'highshelf';
        highFilter.frequency.value = 3200;

        gainNode = audioContext.createGain();

        // Cadena de conexión: Howler -> EQ -> Ganancia -> Altavoces
        source.connect(lowFilter);
        lowFilter.connect(midFilter);
        midFilter.connect(highFilter);
        highFilter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Aplicar valores iniciales de los sliders
        lowFilter.gain.value = lowBandSlider.value;
        midFilter.gain.value = midBandSlider.value;
        highFilter.gain.value = highBandSlider.value;
        gainNode.gain.value = volumeSlider.value;
    }

    // Cargar y reproducir un archivo
    function playFile(file) {
        if (sound) {
            sound.unload();
        }
        
        currentAudioFile = file;
        const fileURL = URL.createObjectURL(file);
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        sound = new Howl({
            src: [fileURL],
            format: [fileExtension],
            html5: true, // Crucial para enlazar con Web Audio API
            onplay: () => {
                playBtn.textContent = 'Pause';
                // Asegurarse de que el AudioContext esté activo
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }
            },
            onpause: () => playBtn.textContent = 'Play',
            onstop: () => playBtn.textContent = 'Play',
            onend: () => {
                playBtn.textContent = 'Play';
                nextTrack();
            },
            onloaderror: (id, err) => alert(`Error al cargar el archivo: ${err}`),
            onplayerror: (id, err) => alert(`Error al reproducir: ${err}. Intenta hacer clic en la página primero.`),
        });
        
        sound.play();
    }

    // --- MANEJADORES DE EVENTOS ---

    // Cargar archivo de audio individual
    audioFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        initAudioContext(); // Inicializar al cargar el archivo
        cueSheet = null;
        playlist = [{
            title: file.name,
            performer: 'Desconocido',
            file: file
        }];
        currentTrackIndex = 0;
        
        playFile(file);
        updateTrackInfo(playlist[currentTrackIndex]);
        loadAlbumArt(file);
    });

    // Cargar archivo CUE
    cueFileInput.addEventListener('change', (event) => {
        const cueFile = event.target.files[0];
        if (!cueFile) return;
        initAudioContext(); // Inicializar

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                cueSheet = CueParserPlus.parse(e.target.result);
                const audioFileName = cueSheet.files[0].name;
                playlist = cueSheet.files[0].tracks;
                currentTrackIndex = 0;
                
                alert(`CUE cargado. Ahora selecciona el archivo de audio: "${audioFileName}"`);
                
                // Configurar un listener temporal para el archivo de audio
                const tempAudioListener = (audioEvent) => {
                    const audioFile = audioEvent.target.files[0];
                    if (audioFile && audioFile.name === audioFileName) {
                        playFile(audioFile);
                        playTrackFromCue(0, false); // Actualiza la info sin buscar
                    } else {
                        alert(`Archivo incorrecto. Se esperaba: ${audioFileName}`);
                    }
                    audioFileInput.removeEventListener('change', tempAudioListener);
                };
                audioFileInput.addEventListener('change', tempAudioListener, { once: true });

            } catch(err) {
                alert("Error al procesar el archivo CUE.");
                console.error(err);
            }
        };
        reader.readAsText(cueFile);
    });

    // Controles de reproducción
    playBtn.addEventListener('click', () => {
        if (!sound) return;
        initAudioContext(); // Asegura que esté inicializado
        
        if (sound.playing()) {
            sound.pause();
        } else {
            sound.play();
        }
    });

    stopBtn.addEventListener('click', () => sound && sound.stop());
    nextBtn.addEventListener('click', () => nextTrack());
    prevBtn.addEventListener('click', () => prevTrack());

    function nextTrack() {
        if (currentTrackIndex < playlist.length - 1) {
            currentTrackIndex++;
            playTrackFromCue(currentTrackIndex, true);
        }
    }

    function prevTrack() {
        if (currentTrackIndex > 0) {
            currentTrackIndex--;
            playTrackFromCue(currentTrackIndex, true);
        }
    }
    
    function playTrackFromCue(trackIndex, doSeek) {
        if (!sound || !cueSheet) return;
        
        const track = playlist[trackIndex];
        updateTrackInfo(track);
        
        if (doSeek) {
            const index = track.indexes.find(i => i.number === 1) || track.indexes[0];
            const offset = index.time.min * 60 + index.time.sec + index.time.frame / 75.0;
            sound.seek(offset);
            if (!sound.playing()) sound.play();
        }
    }

    // Controles de EQ y Volumen
    const setupSlider = (slider, node, property, isGain) => {
        slider.addEventListener('input', (e) => {
            if (node) {
                const value = parseFloat(e.target.value);
                if (isGain) {
                    node[property].value = value;
                } else {
                    node[property] = value;
                }
            }
        });
    };
    setupSlider(volumeSlider, gainNode, 'gain', true);
    setupSlider(lowBandSlider, lowFilter, 'gain', true);
    setupSlider(midBandSlider, midFilter, 'gain', true);
    setupSlider(highBandSlider, highFilter, 'gain', true);

    // --- FUNCIONES AUXILIARES ---

    function updateTrackInfo(track) {
        trackTitle.textContent = track.title || 'Título Desconocido';
        trackArtist.textContent = track.performer || 'Artista Desconocido';
    }

    function loadAlbumArt(file) {
        albumArtImg.src = 'placeholder.png'; 
        jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { data, format } = tag.tags.picture || {};
                if (data) {
                    let base64String = data.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
                    albumArtImg.src = `data:${format};base64,${window.btoa(base64String)}`;
                } else {
                    fetchAlbumArtFromAPI(tag.tags.artist, tag.tags.album);
                }
            },
            onError: (error) => console.log('Error leyendo tags:', error.type),
        });
    }

    async function fetchAlbumArtFromAPI(artist, album) {
        if (!artist || !album) return;
        try {
            const searchUrl = `https://musicbrainz.org/ws/2/release/?query=artist:"${encodeURIComponent(artist)}" AND release:"${encodeURIComponent(album)}"&fmt=json`;
            const searchResponse = await fetch(searchUrl, { headers: { 'User-Agent': 'HiFiPlayer/1.0 (test@example.com)' } });
            if (!searchResponse.ok) throw new Error('Error en MusicBrainz');
            
            const searchData = await searchResponse.json();
            if (searchData.releases && searchData.releases.length > 0) {
                const releaseId = searchData.releases[0].id;
                albumArtImg.src = `https://coverartarchive.org/release/${releaseId}/front`;
                albumArtImg.onerror = () => { albumArtImg.src = 'placeholder.png'; };
            }
        } catch (error) {
            console.error("Error al buscar carátula:", error);
        }
    }
});