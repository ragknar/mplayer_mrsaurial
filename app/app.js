document.addEventListener('DOMContentLoaded', () => {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress-bar');
    const trackTitle = document.getElementById('track-title');
    const fileInput = document.getElementById('file-input');
    const playlistElement = document.getElementById('playlist');

    let sound;
    let playlist = [];
    let currentTrackIndex = 0;
    let isPlaying = false;
    let updateInterval;

    fileInput.addEventListener('change', (event) => {
        playlist = Array.from(event.target.files);
        renderPlaylist();
        if (playlist.length > 0) {
            loadTrack(0);
        }
    });

    function renderPlaylist() {
        playlistElement.innerHTML = '';
        playlist.forEach((file, index) => {
            const li = document.createElement('li');
            li.textContent = file.name;
            li.addEventListener('click', () => {
                loadTrack(index);
                playTrack();
            });
            playlistElement.appendChild(li);
        });
    }

    function loadTrack(index) {
        if (sound) {
            sound.unload();
        }

        currentTrackIndex = index;
        const file = playlist[currentTrackIndex];
        trackTitle.textContent = file.name;

        const fileURL = URL.createObjectURL(file);

        sound = new Howl({
            src: [fileURL],
            format: [file.name.split('.').pop()],
            html5: true, // Importante para archivos grandes y hi-res
            onplay: () => {
                playPauseBtn.textContent = 'Pause';
                isPlaying = true;
                updateInterval = setInterval(updateProgress, 100);
            },
            onpause: () => {
                playPauseBtn.textContent = 'Play';
                isPlaying = false;
                clearInterval(updateInterval);
            },
            onend: () => {
                playNext();
            }
        });
    }

    function playTrack() {
        if (sound && !isPlaying) {
            sound.play();
        }
    }

    function pauseTrack() {
        if (sound && isPlaying) {
            sound.pause();
        }
    }

    function playPauseToggle() {
        if (isPlaying) {
            pauseTrack();
        } else {
            playTrack();
        }
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
    
    function updateProgress() {
        if (sound) {
            const seek = sound.seek() || 0;
            progressBar.value = (seek / sound.duration()) * 100 || 0;
        }
    }

    progressBar.addEventListener('input', function() {
        if (sound) {
            sound.seek((this.value / 100) * sound.duration());
        }
    });

    playPauseBtn.addEventListener('click', playPauseToggle);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);
});
