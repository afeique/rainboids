const fs = require('fs');
const path = require('path');
const jsmediatags = require('jsmediatags');

const musicDir = path.join(__dirname, '..', 'music');
const outputFile = path.join(__dirname, '..', 'js', 'playlist-data.js');

async function readMusicMetadata(filePath) {
    return new Promise((resolve, reject) => {
        jsmediatags.read(filePath, {
            onSuccess: (tag) => {
                const tags = tag.tags || {};
                resolve({
                    title: tags.title || path.basename(filePath, '.mp3'),
                    artist: tags.artist || 'Unknown Artist'
                });
            },
            onError: (error) => {
                console.warn(`Failed to read tags for ${filePath}:`, error);
                resolve({
                    title: path.basename(filePath, '.mp3'),
                    artist: 'Unknown Artist'
                });
            }
        });
    });
}

async function generatePlaylist() {
    try {
        // Read all files in the music directory
        const files = fs.readdirSync(musicDir);
        const mp3Files = files.filter(file => file.endsWith('.mp3'));
        
        console.log(`Found ${mp3Files.length} MP3 files in music directory`);
        
        // Read metadata for each file
        const playlist = [];
        for (const file of mp3Files) {
            const filePath = path.join(musicDir, file);
            const metadata = await readMusicMetadata(filePath);
            playlist.push({
                path: `music/${file}`,
                name: metadata.title,
                artist: metadata.artist
            });
            console.log(`Processed: ${metadata.title} by ${metadata.artist}`);
        }
        
        // Sort playlist alphabetically by title
        playlist.sort((a, b) => a.name.localeCompare(b.name));
        
        // Generate the JavaScript file
        const jsContent = `// Auto-generated playlist data
// Generated on ${new Date().toISOString()}

export const PLAYLIST_DATA = ${JSON.stringify(playlist, null, 2)};
`;
        
        fs.writeFileSync(outputFile, jsContent);
        console.log(`\nPlaylist generated successfully with ${playlist.length} tracks`);
        console.log(`Output: ${outputFile}`);
        
    } catch (error) {
        console.error('Error generating playlist:', error);
        process.exit(1);
    }
}

generatePlaylist();