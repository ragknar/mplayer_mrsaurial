document.addEventListener('DOMContentLoaded', () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let currentAudio = null;
    let audioSource = null;
    let analyser = null;
    let gainNode = null;
    let tracks = [];
    let currentTrackIndex = 0;
    let cueTracks = [];
    
    // Elementos del DOM
    const audioFileInput = document.getElementById('audio-file');
    const loadBtn = document.getElementById('load-btn');
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress');
    const volumeControl = document.getElementById('volume');
    const currentTrackDisplay = document.getElementById('current-track');
    const trackTimeDisplay = document.getElementById('track-time');
    const trackList = document.getElementById('track-list');
    
    // Ecualizador
    const lowEq = document.getElementById('low');
    const midEq = document.getElementById('mid');
    const highEq = document.getElementById('high');
    
    // Cargar archivos de audio
    loadBtn.addEventListener('click', () => {
        const files = audioFileInput.files;
        if (files.length > 0) {
            tracks = [];
            cueTracks = [];
            trackList.innerHTML = '';
            
            Array.from(files).forEach(file => {
                if (file.name.endsWith('.cue')) {
                    parseCueFile(file);
                } else {
                    addAudioTrack(file);
                }
            });
            
            if (tracks.length > 0) {
                currentTrackIndex = 0;
                loadTrack(currentTrackIndex);
            }
        }
    });
    
    // Controles del reproductor
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', playPrevious);
    nextBtn.addEventListener('click', playNext);
    progressBar.addEventListener('input', seekAudio);
    volumeControl.addEventListener('input', changeVolume);
    
    // Ecualizador
    lowEq.addEventListener('input', updateEqualizer);
    midEq.addEventListener('input', updateEqualizer);
    highEq.addEventListener('input', updateEqualizer);
    
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
        
        // Configurar el analizador y el ecualizador
        analyser = audioContext.createAnalyser();
        gainNode = audioContext.createGain();
        
        // Configurar la cadena de procesamiento de audio
        audioSource.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Configurar el ecualizador
        updateEqualizer();
        
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
                audioSource.connect(analyser);
                audioSource.start(0, cueSeekTime, cueDuration - (cueSeekTime - track.start));
            } else {
                audioSource = audioContext.createBufferSource();
                audioSource.buffer = currentAudio;
                audioSource.connect(analyser);
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
    
    function updateEqualizer() {
        // Implementación básica del ecualizador
        // En una implementación real, usaríamos BiquadFilterNode
        // Esta es una simplificación para el ejemplo
        if (analyser && gainNode) {
            // Aquí iría la lógica real del ecualizador
            // Por ahora solo ajustamos el volumen general basado en los controles
            const balance = (parseInt(lowEq.value) + parseInt(midEq.value) + parseInt(highEq.value)) / 60 + 1;
            gainNode.gain.value = volumeControl.value * balance;
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
