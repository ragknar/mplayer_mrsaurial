async function parseCueSheet(cueContent, audioFiles) {
    const lines = cueContent.split('\n');
    const tracks = [];
    let currentFile = null;
    let currentTrack = null;
    
    // Buscar el archivo referenciado en el CUE
    function findAudioFile(filename) {
        const cleanFilename = filename.replace(/^"|"$/g, '').trim();
        return audioFiles.find(file => 
            file.name === cleanFilename || 
            file.name.toLowerCase() === cleanFilename.toLowerCase()
        );
    }
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        const parts = trimmed.split(/\s+/);
        const command = parts[0].toUpperCase();
        
        switch (command) {
            case 'FILE':
                const filename = trimmed.slice(5).trim().replace(/^"|"$/g, '');
                currentFile = findAudioFile(filename);
                if (!currentFile) {
                    throw new Error(`Archivo de audio no encontrado: ${filename}`);
                }
                break;
                
            case 'TRACK':
                if (currentTrack) {
                    tracks.push(currentTrack);
                }
                currentTrack = {
                    file: currentFile,
                    number: parseInt(parts[1]),
                    startTime: 0,
                    endTime: null
                };
                break;
                
            case 'TITLE':
                if (currentTrack) {
                    currentTrack.title = trimmed.slice(6).replace(/^"|"$/g, '');
                }
                break;
                
            case 'INDEX':
                if (currentTrack && parts[1] === '01') {
                    const timeStr = parts[2];
                    const [min, sec, frames] = timeStr.split(':').map(Number);
                    currentTrack.startTime = min * 60 + sec + frames / 75;
                    
                    // Establecer el endTime del track anterior
                    if (tracks.length > 0) {
                        tracks[tracks.length - 1].endTime = currentTrack.startTime;
                    }
                }
                break;
        }
    }
    
    // Añadir el último track
    if (currentTrack) {
        tracks.push(currentTrack);
    }
    
    return tracks;
}
