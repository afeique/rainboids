// Music Player System with playlist management and controls
import { PLAYLIST_DATA } from '../../playlist-data.js';

export class MusicPlayer {
    constructor() {
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.isShuffled = false;
        this.isRepeatOne = false;
        this.currentAudio = null;
        // Single forward preload. The previous-track preload was dropped:
        // hitting Previous is rare, and keeping a third Audio element
        // alive cost ~1/3 of speculative bandwidth for almost no benefit.
        this.nextAudio = null;
        this.nextAudioIndex = -1; // Which playlist index nextAudio points at, or -1 if none
        this.volume = 0.5;

        // UI update callbacks
        this.onTrackChange = null;
        this.onPlayStateChange = null;
        this.onProgressUpdate = null;
        this.onPlaylistChange = null; // Fires whenever playlist order mutates
        this.onBufferedUpdate = null; // Fires when more audio data is buffered (fraction 0..1)

        // Initialize playlist
        this.initializePlaylist();
    }

    async initializePlaylist() {
        // Use the pre-generated playlist data.
        // Desktop (Electron): rewrite paths from `music/<file>.mp3` to
        // `music://rainboids/<file>.mp3` so the main-process protocol
        // handler streams from the CDN with disk caching (Phase 2 of
        // the Desktop Port Plan, 2026-05-18). Web build keeps the
        // original relative paths.
        const isDesktop = typeof window !== 'undefined' && window.rainboids?.isDesktop === true;
        this.playlist = PLAYLIST_DATA.map(track => {
            const path = isDesktop
                ? 'music://rainboids/' + track.path.replace(/^music\//, '')
                : track.path;
            return { ...track, path, duration: 0 };
        });
        // Snapshot the canonical (un-shuffled) order so toggling shuffle
        // OFF can restore it later.
        this._originalPlaylist = this.playlist.slice();

        // Shuffle playlist on initialization
        this.shufflePlaylist();

        // Load first track
        this.loadTrack(0);
    }


    shufflePlaylist() {
        // Fisher-Yates shuffle. Reorders the playlist in place. Does NOT
        // touch isShuffled — that flag is purely about the user-facing
        // toggle state (kept around for back-compat; not used by the
        // current UI which treats shuffle as an action button).
        for (let i = this.playlist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
        }
    }

    // Action: re-shuffle the playlist and immediately play the new track 0.
    // After shuffle, indices change meaning, so any speculative preload
    // is now stale. Discard before loading the new current track.
    shuffleAndPlay() {
        this.shufflePlaylist();
        this.currentTrackIndex = 0;
        this._clearNextPreload();
        if (this.onPlaylistChange) this.onPlaylistChange();
        this.isPlaying = true; // Signal loadTrack to auto-play
        this.loadTrack(0);
    }

    // Action: jump to a uniformly random track in the (current) playlist
    // and play it. Avoids re-picking the current track when possible.
    // Skips the post-load preload — the user signaled "non-linear
    // browsing", so eagerly buffering currentTrackIndex+1 is likely waste.
    playRandomTrack() {
        if (this.playlist.length === 0) return;
        let idx = Math.floor(Math.random() * this.playlist.length);
        if (this.playlist.length > 1 && idx === this.currentTrackIndex) {
            idx = (idx + 1) % this.playlist.length;
        }
        this.isPlaying = true;
        this.loadTrack(idx, { skipPreload: true });
    }

    // ── Audio lifecycle helpers ────────────────────────────────────────

    // Actively cancel any in-flight load for an Audio element. Setting
    // src='' + load() is the canonical browser-supported way to free
    // the underlying network slot. We MUST detach our listeners first
    // — `src=''` fires an `error` event, which would otherwise trip
    // our auto-skip-on-error handler and fire next() in a runaway loop
    // every time we change tracks.
    _disposeAudio(audio) {
        if (!audio) return;
        audio._disposing = true; // Belt-and-suspenders guard inside the error handler
        try {
            audio.pause();
            if (audio._handlers) {
                audio.removeEventListener('timeupdate', audio._handlers.timeupdate);
                audio.removeEventListener('ended', audio._handlers.ended);
                audio.removeEventListener('loadedmetadata', audio._handlers.loadedmetadata);
                audio.removeEventListener('progress', audio._handlers.progress);
                audio.removeEventListener('error', audio._handlers.error);
                audio._handlers = null;
            }
            audio.src = '';
            audio.load();
        } catch (_) { /* Some browsers throw on load() after empty src — safe to ignore */ }
    }

    _attachAudioListeners(audio, track) {
        audio.volume = this.volume;
        // Bind handlers once and stash on the element so _disposeAudio
        // can remove them later. Without this, we leaked the original
        // `error` listener and the disposed Audio kept calling next()
        // a second after it was abandoned.
        const handlers = {
            timeupdate: this.handleTimeUpdate.bind(this),
            ended: this.handleTrackEnd.bind(this),
            loadedmetadata: () => {
                track.duration = audio.duration;
                this._consecutiveLoadFailures = 0; // a track loaded OK
            },
            // 'progress' fires repeatedly while the browser fetches more
            // audio data — perfect for updating the "buffered" fill.
            progress: () => this._emitBufferedUpdate(audio),
            error: (e) => {
                if (audio._disposing) return; // Ignore errors caused by our own teardown
                console.error('Failed to load track:', track.path, e);
                // Stop the auto-skip-on-error loop if EVERY track fails
                // (e.g. assets missing) — otherwise next()→error→next()
                // spins forever once per second with no user signal.
                this._consecutiveLoadFailures = (this._consecutiveLoadFailures || 0) + 1;
                const limit = (this.playlist && this.playlist.length) || 12;
                if (this._consecutiveLoadFailures >= limit) {
                    console.warn('[MusicPlayer] all tracks failed to load — stopping auto-skip.');
                    return;
                }
                setTimeout(() => this.next(), 1000);
            },
        };
        audio._handlers = handlers;
        audio.addEventListener('timeupdate', handlers.timeupdate);
        audio.addEventListener('ended', handlers.ended);
        audio.addEventListener('loadedmetadata', handlers.loadedmetadata);
        audio.addEventListener('progress', handlers.progress);
        audio.addEventListener('error', handlers.error);
    }

    _emitBufferedUpdate(audio) {
        if (!this.onBufferedUpdate) return;
        if (!audio || !audio.duration || isNaN(audio.duration)) return;
        const ranges = audio.buffered;
        if (!ranges || ranges.length === 0) {
            this.onBufferedUpdate(0);
            return;
        }
        // End of the last buffered range — represents how far ahead the
        // browser is comfortable playing without rebuffering. After a
        // seek there can be multiple disjoint ranges; using the last
        // one is a reasonable proxy for "play-ahead progress".
        const end = ranges.end(ranges.length - 1);
        this.onBufferedUpdate(Math.min(1, end / audio.duration));
    }

    // Speculative load of the next sequential track. Skipped on random/
    // shuffle paths via the skipPreload option to loadTrack().
    _preloadNext() {
        const nextIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        // Already preloaded the right one — no-op.
        if (this.nextAudio && this.nextAudioIndex === nextIndex) return;
        this._disposeAudio(this.nextAudio);
        this.nextAudio = new Audio(this.playlist[nextIndex].path);
        this.nextAudio.volume = this.volume;
        this.nextAudioIndex = nextIndex;
    }

    // Discard any speculative preload (used on random/shuffle jumps so
    // the browser doesn't keep buffering an index we've moved away from).
    _clearNextPreload() {
        this._disposeAudio(this.nextAudio);
        this.nextAudio = null;
        this.nextAudioIndex = -1;
    }

    // ── Track loading ──────────────────────────────────────────────────

    loadTrack(index, opts = {}) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentTrackIndex = index;
        const track = this.playlist[index];

        // Cancel the outgoing track's load — frees network/memory.
        this._disposeAudio(this.currentAudio);

        // Reuse a matching speculative preload if we have one. Saves a
        // redundant fetch when the user advances linearly (next or
        // auto-advance on track end).
        if (this.nextAudio && this.nextAudioIndex === index) {
            this.currentAudio = this.nextAudio;
            this.nextAudio = null;
            this.nextAudioIndex = -1;
        } else {
            // Otherwise, the speculative preload (if any) is stale —
            // dispose it and fetch fresh.
            this._disposeAudio(this.nextAudio);
            this.nextAudio = null;
            this.nextAudioIndex = -1;
            this.currentAudio = new Audio(track.path);
        }

        this._attachAudioListeners(this.currentAudio, track);

        // Speculatively warm up the next track unless the caller asked
        // us not to (random jumps).
        if (!opts.skipPreload) {
            this._preloadNext();
        }

        if (this.onTrackChange) {
            this.onTrackChange(track);
        }
        // Reset the buffered fill at track-change. If the new audio was
        // promoted from a preload it may already have data — emit a
        // fresh reading so the bar reflects reality.
        if (this.onBufferedUpdate) this.onBufferedUpdate(0);
        this._emitBufferedUpdate(this.currentAudio);

        // Start playing if we were playing before
        if (this.isPlaying) {
            // Delay play slightly to ensure audio element is ready
            setTimeout(() => this.play(), 100);
        }
    }

    // ── Playback controls ──────────────────────────────────────────────

    play() {
        if (this.currentAudio) {
            this.currentAudio.play().then(() => {
                this.isPlaying = true;
                if (this.onPlayStateChange) {
                    this.onPlayStateChange(true);
                }
            }).catch(error => {
                // Set playing to false if blocked
                this.isPlaying = false;
                if (this.onPlayStateChange) {
                    this.onPlayStateChange(false);
                }
            });
        }
    }

    pause() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.isPlaying = false;
            if (this.onPlayStateChange) {
                this.onPlayStateChange(false);
            }
        }
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
        return this.isPlaying;
    }

    next() {
        const nextIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        // loadTrack auto-promotes a matching preload — no special path here.
        this.loadTrack(nextIndex);
    }

    previous() {
        // If more than 3 seconds into the track, restart it
        if (this.currentAudio && this.currentAudio.currentTime > 3) {
            this.currentAudio.currentTime = 0;
        } else {
            // Otherwise go to previous track. No preload exists for the
            // backward direction (intentionally — see constructor) so
            // this triggers a fresh fetch. Acceptable: backward play is rare.
            const prevIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
            this.loadTrack(prevIndex);
        }
    }

    seek(percentage) {
        if (this.currentAudio && this.currentAudio.duration) {
            this.currentAudio.currentTime = this.currentAudio.duration * percentage;
        }
    }

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        const currentTrack = this.playlist[this.currentTrackIndex];
        if (this.isShuffled) {
            // Re-shuffle, keeping current track at the beginning
            this.playlist.splice(this.currentTrackIndex, 1);
            this.shufflePlaylist();
            this.playlist.unshift(currentTrack);
            this.currentTrackIndex = 0;
        } else if (this._originalPlaylist) {
            // Restore the canonical order; keep the current track selected.
            this.playlist = this._originalPlaylist.slice();
            const idx = this.playlist.indexOf(currentTrack);
            this.currentTrackIndex = idx >= 0 ? idx : 0;
        }
        return this.isShuffled;
    }

    toggleRepeat() {
        this.isRepeatOne = !this.isRepeatOne;
        return this.isRepeatOne;
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.currentAudio) {
            this.currentAudio.volume = this.volume;
        }
        if (this.nextAudio) {
            this.nextAudio.volume = this.volume;
        }
    }

    handleTimeUpdate() {
        if (this.currentAudio && this.onProgressUpdate) {
            // duration is NaN/0 before metadata loads — guard so progress
            // is a finite 0..1 (NaN/Infinity would corrupt the progress UI).
            const dur = this.currentAudio.duration;
            const progress = (dur > 0) ? (this.currentAudio.currentTime / dur) : 0;
            this.onProgressUpdate(progress, this.currentAudio.currentTime, dur || 0);
        }
    }

    handleTrackEnd() {
        if (this.isRepeatOne) {
            // Replay current track
            this.currentAudio.currentTime = 0;
            this.play();
        } else {
            // Move to next track
            this.next();
        }
    }

    getCurrentTrack() {
        return this.playlist[this.currentTrackIndex];
    }

    getCurrentTime() {
        return this.currentAudio ? this.currentAudio.currentTime : 0;
    }

    getDuration() {
        return this.currentAudio ? this.currentAudio.duration : 0;
    }

    getVolume() {
        return this.volume;
    }

    setRepeatOne(enabled) {
        this.isRepeatOne = !!enabled;
    }
}
