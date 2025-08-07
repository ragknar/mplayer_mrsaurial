document.addEventListener('DOMContentLoaded', () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let currentAudio = null;
    let audioSource = null;
    let gainNode = null;
    let tracks = [];
    let currentTrackIndex = 0;
    let cueTracks = [];
    
    // Elementos del DOM
    const audioFileInput = document.getElementById('audio-file');
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress');
    const volumeControl = document.getElementById('volume');
    const currentTrackDisplay = document.getElementById('current-track');
    const trackTimeDisplay = document.getElementById('track-time');
    const trackList = document.getElementById('track-list');
    // Reemplaza el event listener del input file por este código:
let isProcessing = false;

audioFileInput.addEventListener('change', async () => {
    if (isProcessing) {
        alert('Por favor espera, se está procesando un archivo');
        return;
    }
    
    const files = audioFileInput.files;
    if (files.length === 0) return;
    
    isProcessing = true;
    document.body.style.cursor = 'wait';
    playBtn.disabled = true;
    
    try {
        tracks = [];
        cueTracks = [];
        trackList.innerHTML = '';
        currentTrackDisplay.textContent = 'Procesando archivos...';
        
        // Procesar archivos en secuencia para evitar bloqueos
        for (const file of Array.from(files)) {
            if (file.name.endsWith('.cue')) {
                await parseCueFile(file);
            } else {
                addAudioTrack(file);
            }
        }
        
        if (tracks.length > 0) {
            currentTrackIndex = 0;
            await loadTrack(currentTrackIndex);
        }
    } catch (error) {
        console.error('Error al procesar archivos:', error);
        currentTrackDisplay.textContent = 'Error al cargar archivos';
        alert(`Error al procesar archivos: ${error.message}`);
    } finally {
        isProcessing = false;
        document.body.style.cursor = '';
        playBtn.disabled = false;
        
        if (tracks.length === 0) {
            currentTrackDisplay.textContent = 'No se cargaron pistas válidas';
        }
    }
});

// Modifica la función parseCueFile para que sea async
async function parseCueFile(cueFile) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const cueContent = e.target.result;
                const audioFiles = Array.from(audioFileInput.files).filter(f => !f.name.endsWith('.cue'));
                
                const parsedTracks = await parseCueSheet(cueContent, audioFiles);
                cueTracks = parsedTracks;
                
                parsedTracks.forEach((track, index) => {
                    tracks.push({
                        name: track.title || `Pista ${index + 1}`,
                        file: track.file,
                        isCue: true,
                        start: track.startTime,
                        end: track.endTime
                    });
                    
                    const li = document.createElement('li');
                    li.textContent = track.title || `Pista ${index + 1} (${track.file.name})`;
                    li.addEventListener('click', () => {
                        currentTrackIndex = tracks.findIndex(t => t === tracks[tracks.length - parsedTracks.length + index]);
                        loadTrack(currentTrackIndex);
                    });
                    trackList.appendChild(li);
                });
                
                resolve();
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Error al leer el archivo CUE'));
        };
        
        reader.readAsText(cueFile);
    });
}
    
    // Controles del reproductor
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', playPrevious);
    nextBtn.addEventListener('click', playNext);
    progressBar.addEventListener('input', seekAudio);
    volumeControl.addEventListener('input', changeVolume);
    
    // Funciones
    function addAudioTrack(file) {
        tracks.push({
            name: file.name,
            file: file,
            isCue: false
        });
        
        const li = document.createElement('li');
        li.textContent = file.name;
        li.addEventListener('click', () => {
            currentTrackIndex = tracks.findIndex(t => t.file === file);
            loadTrack(currentTrackIndex);
        });
        trackList.appendChild(li);
    }
    
    async function parseCueFile(cueFile) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const cueContent = e.target.result;
            const audioFiles = Array.from(audioFileInput.files).filter(f => !f.name.endsWith('.cue'));
            
            try {
                const parsedTracks = await parseCueSheet(cueContent, audioFiles);
                cueTracks = parsedTracks;
                
                parsedTracks.forEach((track, index) => {
                    tracks.push({
                        name: track.title || `Pista ${index + 1}`,
                        file: track.file,
                        isCue: true,
                        start: track.startTime,
                        end: track.endTime
                    });
                    
                    const li = document.createElement('li');
                    li.textContent = track.title || `Pista ${index + 1} (${track.file.name})`;
                    li.addEventListener('click', () => {
                        currentTrackIndex = tracks.findIndex(t => t === tracks[tracks.length - parsedTracks.length + index]);
                        loadTrack(currentTrackIndex);
                    });
                    trackList.appendChild(li);
                });
                
                if (tracks.length > 0 && currentTrackIndex === -1) {
                    currentTrackIndex = 0;
                    loadTrack(currentTrackIndex);
                }
            } catch (error) {
                console.error('Error parsing CUE file:', error);
                alert('Error al procesar el archivo CUE: ' + error.message);
            }
        };
        reader.readAsText(cueFile);
    }
    
    function loadTrack(index) {
        if (index < 0 || index >= tracks.length) return;
        
        stopAudio();
        
        const track = tracks[index];
        currentTrackDisplay.textContent = track.name;
        currentTrackIndex = index;
        
        const file = track.file;
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const audioData = e.target.result;
            
            audioContext.decodeAudioData(audioData)
                .then(buffer => {
                    currentAudio = buffer;
                    
                    // Resaltar la pista actual en la lista
                    Array.from(trackList.children).forEach((li, i) => {
                        li.style.backgroundColor = i === index ? '#4CAF50' : 'transparent';
                        li.style.color = i === index ? 'white' : 'inherit';
                    });
                    
                    playAudio(buffer, track);
                })
                .catch(error => {
                    console.error('Error decoding audio data:', error);
                    alert('Formato de audio no soportado o archivo corrupto');
                });
        };
        
        reader.readAsArrayBuffer(file);
    }
    
    function playAudio(buffer, track) {
        stopAudio();
        
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = buffer;
        
        // Configurar el nodo de ganancia para el volumen
        gainNode = audioContext.createGain();
        
        // Conectar los nodos
        audioSource.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Configurar el volumen
        gainNode.gain.value = volumeControl.value;
        
        // Manejar el final de la pista
        audioSource.onended = () => {
            playNext();
        };
        
        // Iniciar la reproducción
        if (track.isCue && track.start) {
            audioSource.start(0, track.start, track.end ? track.end - track.start : undefined);
        } else {
            audioSource.start(0);
        }
        
        playBtn.textContent = '⏸';
        
        // Actualizar la barra de progreso
        requestAnimationFrame(updateProgress);
    }
    
    function stopAudio() {
        if (audioSource) {
            audioSource.stop();
            audioSource = null;
        }
    }
    
    function togglePlay() {
        if (!audioSource && currentAudio) {
            playAudio(currentAudio, tracks[currentTrackIndex]);
        } else if (audioSource) {
            stopAudio();
            playBtn.textContent = '⏵';
        }
    }
    
    function playPrevious() {
        if (currentTrackIndex > 0) {
            loadTrack(currentTrackIndex - 1);
        }
    }
    
    function playNext() {
        if (currentTrackIndex < tracks.length - 1) {
            loadTrack(currentTrackIndex + 1);
        } else {
            stopAudio();
            playBtn.textContent = '⏵';
        }
    }
    
    function seekAudio() {
        if (audioSource && currentAudio) {
            const duration = currentAudio.duration;
            const seekTime = (progressBar.value / 100) * duration;
            
            stopAudio();
            
            const track = tracks[currentTrackIndex];
            if (track.isCue && track.start) {
                const cueDuration = track.end ? track.end - track.start : duration - track.start;
                const cueSeekTime = track.start + ((progressBar.value / 100) * cueDuration);
                
                audioSource = audioContext.createBufferSource();
                audioSource.buffer = currentAudio;
                audioSource.connect(gainNode);
                audioSource.start(0, cueSeekTime, cueDuration - (cueSeekTime - track.start));
            } else {
                audioSource = audioContext.createBufferSource();
                audioSource.buffer = currentAudio;
                audioSource.connect(gainNode);
                audioSource.start(0, seekTime);
            }
            
            audioSource.onended = () => {
                playNext();
            };
            
            playBtn.textContent = '⏸';
        }
    }
    
    function changeVolume() {
        if (gainNode) {
            gainNode.gain.value = volumeControl.value;
        }
    }
    
    function updateProgress() {
        if (audioSource && currentAudio) {
            const track = tracks[currentTrackIndex];
            let currentTime, duration;
            
            if (track.isCue && track.start) {
                duration = track.end ? track.end - track.start : currentAudio.duration - track.start;
                currentTime = audioContext.currentTime - audioSource.startTime + track.start;
                if (currentTime > track.end) currentTime = track.end;
            } else {
                duration = currentAudio.duration;
                currentTime = audioContext.currentTime - audioSource.startTime;
                if (currentTime > duration) currentTime = duration;
            }
            
            if (currentTime >= 0) {
                const progressPercent = (currentTime / duration) * 100;
                progressBar.value = progressPercent;
                
                // Actualizar el display de tiempo
                trackTimeDisplay.textContent = 
                    `${formatTime(currentTime)} / ${formatTime(duration)}`;
            }
            
            requestAnimationFrame(updateProgress);
        }
    }
    
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
});
