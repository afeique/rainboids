// Normalize ID3 title tags to consistent Title Case across the music library.
// Reads each MP3 in /music, computes a Title-Cased version of its TIT2 tag,
// and rewrites only when the title actually changes.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeID3 from 'node-id3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const musicDir = path.join(__dirname, '..', '..', 'music');

// Words that stay lowercase when they appear mid-title (not first/last word).
// English function words + Romance-language articles/prepositions commonly
// preserved lowercase in song titles ("Alma de Electrica Gracia").
const LOWERCASE_WORDS = new Set([
    // English articles + conjunctions + short prepositions
    'a', 'an', 'the',
    'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
    'as', 'at', 'by', 'in', 'of', 'on', 'to', 'up', 'via',
    'with', 'from', 'into', 'onto', 'over', 'than',
    // Romance-language particles
    'de', 'del', 'la', 'el', 'los', 'las',
    'du', 'des', 'le', 'les',
    'di', 'il', 'do', 'da',
]);

function capitalizeWord(word) {
    if (!word) return word;
    // Preserve apostrophes / hyphens within: only force-cap the first letter,
    // lowercase the rest. "don't" → "Don't", "angel's" → "Angel's".
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function toTitleCase(raw) {
    if (!raw) return raw;
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    // Split on spaces but preserve punctuation attached to words.
    const tokens = trimmed.split(' ');
    return tokens.map((token, i) => {
        const isFirst = i === 0;
        const isLast = i === tokens.length - 1;
        // Strip leading/trailing punctuation to test against the lowercase set,
        // then restore. e.g. "(don't" → check "don't".
        const m = token.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}'’\-]+)([^\p{L}\p{N}]*)$/u);
        if (!m) return token;
        const [, lead, core, tail] = m;
        const lowered = core.toLowerCase();
        // Hyphenated compound: capitalize each segment by the same rule
        // ("rock-and-roll" → "Rock-and-Roll" since "and" is a small word
        // mid-compound, but the first segment is always cap'd).
        let normalized;
        if (core.includes('-')) {
            normalized = core.split('-').map((seg, idx) => {
                const segLower = seg.toLowerCase();
                if (idx > 0 && LOWERCASE_WORDS.has(segLower)) return segLower;
                return capitalizeWord(seg);
            }).join('-');
        } else if (!isFirst && !isLast && LOWERCASE_WORDS.has(lowered)) {
            normalized = lowered;
        } else {
            normalized = capitalizeWord(core);
        }
        return lead + normalized + tail;
    }).join(' ');
}

function main() {
    const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));
    let changed = 0;
    let skipped = 0;
    const changes = [];

    for (const file of files) {
        const fp = path.join(musicDir, file);
        const tags = NodeID3.read(fp);
        const oldTitle = tags.title || '';
        const newTitle = toTitleCase(oldTitle);

        if (newTitle === oldTitle) {
            skipped++;
            continue;
        }

        const ok = NodeID3.update({ title: newTitle }, fp);
        if (ok === true) {
            changed++;
            changes.push({ file, oldTitle, newTitle });
        } else {
            console.error(`FAILED to update ${file}:`, ok);
        }
    }

    console.log(`\nNormalized ${changed} titles (${skipped} already correct):\n`);
    for (const c of changes) {
        console.log(`  ${c.file}`);
        console.log(`    "${c.oldTitle}" → "${c.newTitle}"`);
    }
}

main();
