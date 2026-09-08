// core/systems_vs/vs_audio_system.js - VS Mode sound
import { System } from '../systems/system.js';
import { Audio } from '../components/audio_component.js';
import { getVolume, onVolumeChange, DEFAULT_VOLUME } from '../vs_prefs.js';

// Adventure runs from the site root, VS from /views/.
const BASE_PATH = (typeof window !== 'undefined' && window.location.pathname.includes('/views/'))
    ? '../'
    : './';


/*
 * How loud the arena is overall lives in core/vs_prefs.js, because the player
 * sets it from the pause menu and it has to outlast the match they set it in.
 *
 * It is applied on top of every individual sound's own level, so the balance
 * between them - a footstep against a sword against a death - is untouched and
 * only the whole thing moves.
 */

/**
 * Sound for the arena, using the same samples and the same state-driven
 * triggering as Adventure mode (core/systems/audio_system.js).
 *
 * The Adventure AudioSystem is tied to cutscenes, level music rotation and
 * enemy chatter, none of which exist here, so this is a trimmed version that
 * keeps the part that matters: footsteps, jumps and swings that sound exactly
 * like the solo game.
 *
 * Volume split by who is acting: your own character is heard fully, other
 * fighters - networked players and bots alike - only through one-shot
 * actions. Looping idle/run tracks for three other fighters would just be
 * noise.
 */
export class VSAudio extends System {
    constructor(game) {
        super(game);

        // Reads what VSRender just drew, so it follows the same cadence.
        this.fixedStep = false;
        this.game = game;
        this.audio = new Audio();
        this.remoteAudio = new Audio();
        this.lastStates = new Map(); // entity uuid -> last animation state

        this.registerSounds(this.audio);
        this.registerSounds(this.remoteAudio);

        // Other players are quieter than you are
        this.remoteAudio.setCategoryVolume('sfx', 0.45);

        this.clash = new MetallicClash();

        this.startMusic();

        // Followed live rather than read once: the slider in the pause menu is
        // something you listen to while you drag it, not something you set and
        // then go back into the match to test.
        this.applyVolume(getVolume());
        this.stopFollowingVolume = onVolumeChange(level => this.applyVolume(level));
    }

    applyVolume(level) {
        this.audio.setMasterVolume(level);
        this.remoteAudio.setMasterVolume(level);
        this.clash.volume = level;
        if (this.music) this.music.setMaster(level);
    }

    /**
     * The arena's own loop, under everything else.
     *
     * ambient_4 rather than either of its neighbours purely on weight: the two
     * .wav tracks are 12 and 14MB, which is a long silent wait on the first
     * load of a page served from a free tier, and this one says the same thing
     * in 1.4MB.
     *
     * Level from the same measurement as the samples above: the file runs at
     * -20.8 LUFS, which is 24dB hotter than the swords, so it comes down 23dB
     * to sit as a bed a few decibels under the action rather than on top of
     * it. That distance is what makes a soundtrack rather than a competitor.
     */
    startMusic() {
        this.music = new MusicLoop(`${BASE_PATH}assets/sounds/music/ambient_4.mp3`, 0.07);
        this.music.setMaster(getVolume());
        this.music.start();
    }

    /** Called when the arena is torn down, so a finished match stops listening. */
    dispose() {
        if (this.stopFollowingVolume) this.stopFollowingVolume();
        if (this.music) this.music.stop();
    }

    /*
     * The mix, measured rather than guessed.
     *
     * The samples were gathered from wildly different sources and are nowhere
     * near each other in level - ffmpeg puts them 24dB apart - so a flat 0.8
     * on all of them was not a balance, it was whatever the files happened to
     * be. The three sword blows landed 17dB apart from one another, and the
     * spirit was 24dB above them: loud enough to bury the fight it belongs to.
     *
     * Each figure below is that file's own measurement corrected to a shared
     * target, sustained sounds judged on integrated loudness and short blows
     * on peak, which is what the ear uses for each:
     *
     *   file          measured               correction   result
     *   attack1.wav   -6.2dB peak            -7.8dB       0.42
     *   attack2.wav   -11.8dB peak           -2.2dB       0.78
     *   attack3.wav   -23.4dB peak           +9.4dB       1.00 (capped)
     *   hurt.wav      -32.5dB peak           +18.5dB      1.00 (capped)
     *   death.wav     -21.7dB peak           +7.7dB       1.00 (capped)
     *   roll.wav      -40.4 LUFS             +2.4dB       0.90
     *   jump.wav      -36.9 LUFS             -1.1dB       0.85
     *   run.wav       -39.1 LUFS             -2.9dB       0.70
     *   magic.wav     -12.4 LUFS             -21dB        0.09
     *
     * Three of them are already quieter than the target and cannot be raised
     * - an element's volume only attenuates - so they sit at 1.0 and are as
     * loud as they will ever be. Nothing here changes the overall level of
     * the arena, only the distances between its parts.
     */
    registerSounds(audio) {
        // Movement. Both loops sit under the one-shots on purpose: they play
        // continuously, and continuous beats transient for attention.
        audio.addSound('player_idle', `${BASE_PATH}assets/sounds/player/idle.wav`,
            { volume: 0.2, loop: true, category: 'sfx' });
        audio.addSound('player_run', `${BASE_PATH}assets/sounds/player/run.wav`,
            { volume: 0.7, loop: true, category: 'sfx' });
        audio.addSound('player_jump', `${BASE_PATH}assets/sounds/player/jump.wav`,
            { volume: 0.85, category: 'sfx', cooldown: 0.3 });

        // Actions
        audio.addSound('player_roulade', `${BASE_PATH}assets/sounds/player/roll.wav`,
            { volume: 0.9, category: 'sfx' });
        audio.addSound('player_attack1', `${BASE_PATH}assets/sounds/player/attack1.wav`,
            { volume: 0.42, category: 'sfx' });
        audio.addSound('player_attack2', `${BASE_PATH}assets/sounds/player/attack2.wav`,
            { volume: 0.78, category: 'sfx' });
        audio.addSound('player_attack3', `${BASE_PATH}assets/sounds/player/attack3.wav`,
            { volume: 1.0, category: 'sfx' });

        // The spirit gauge, spent. The project has no player-side magic
        // sample but the enemy one is exactly the right timbre for a wraith -
        // it is also five sustained seconds peaking a decibel below clipping,
        // hence by far the largest correction in the table.
        audio.addSound('spectre_cast', `${BASE_PATH}assets/sounds/enemy/magic.wav`,
            { volume: 0.09, category: 'sfx', cooldown: 0.2 });

        // Damage
        audio.addSound('player_hurt', `${BASE_PATH}assets/sounds/player/hurt.wav`,
            { volume: 1.0, category: 'sfx' });
        audio.addSound('player_death', `${BASE_PATH}assets/sounds/player/death.wav`,
            { volume: 1.0, category: 'sfx' });
    }

    update(deltaTime) {
        this.audio.update(deltaTime);
        this.remoteAudio.update(deltaTime);

        const local = this.game.localPlayer;
        if (local) this.followAnimation(local, this.audio, true);

        // Networked opponents and bots alike: anyone who is not you is heard
        // through the quieter one-shot channel.
        this.game.fighterEntities().forEach(entity => {
            if (entity === local) return;
            this.followAnimation(entity, this.remoteAudio, false);
        });
    }

    /**
     * Plays a sound whenever the character's animation state changes, exactly
     * as Adventure's updatePlayerSounds does.
     */
    followAnimation(entity, audio, isLocal) {
        const animation = entity.getComponent('animation');
        if (!animation) return;

        const state = animation.currentState;
        const previous = this.lastStates.get(entity.uuid);
        if (state === previous) return;
        this.lastStates.set(entity.uuid, state);

        const MOVEMENT = ['idle', 'run', 'jump'];
        const ACTIONS = ['attack1', 'attack2', 'attack3', 'roulade'];

        if (MOVEMENT.includes(state)) {
            if (!isLocal) return; // Remote footsteps would pile up

            if (previous && MOVEMENT.includes(previous)) {
                audio.stopSound(`player_${previous}`);
            }
            audio.playSound(`player_${state}`);
            return;
        }

        // Leaving a looping movement state for an action: stop the loop first
        if (isLocal && previous && MOVEMENT.includes(previous)) {
            audio.stopSound(`player_${previous}`);
        }

        if (ACTIONS.includes(state)) {
            audio.playSound(`player_${state}`);
        } else if (state === 'hurt' || state === 'death') {
            audio.playSound(`player_${state}`);
        }
    }

    /** One-shot, used by the parry handler. */
    playHurt() {
        this.audio.playSound('player_hurt');
    }

    playClash() {
        this.clash.play();
    }

    /** A spirit being loosed. */
    playCast() {
        this.audio.playSound('spectre_cast');
    }

    /** Frees the looping tracks when a player leaves. */
    forgetEntity(entity) {
        this.lastStates.delete(entity.uuid);
    }
}

/**
 * A background track that actually loops.
 *
 * `<audio loop>` on an MP3 does not: the format carries encoder padding at
 * both ends that the decoder cannot see, so every lap through a 61-second
 * track lands a short silence in the middle of the arena, once a minute,
 * forever. Anything short enough to notice is exactly long enough to be
 * heard as a fault.
 *
 * Two elements playing the same file solve both that and the seam itself:
 * the second is started a few seconds before the first runs out and the pair
 * are crossfaded, so the loop point is a swell rather than a join. It also
 * keeps working whatever the file format, which a re-encode would not.
 */
class MusicLoop {
    constructor(src, volume = 1, crossfadeMs = 2600) {
        this.src = src;
        this.baseVolume = volume;
        this.crossfadeMs = crossfadeMs;
        this.master = 1;
        this.stopped = false;
        this.current = 0;
        this.waitingForGesture = false;

        this.elements = [this.build(), this.build()];
    }

    build() {
        const element = new window.Audio(this.src);
        element.preload = 'auto';
        element.volume = 0;
        // Never the element's own loop: the whole point is to take the lap
        // over ourselves before it can be reached.
        element.loop = false;
        return element;
    }

    /** Where a fully faded-in track should sit right now. */
    level() {
        return Math.max(0, Math.min(1, this.baseVolume * this.master));
    }

    setMaster(master) {
        this.master = master;
        // Fades interpolate a factor rather than an absolute level, so a
        // slider dragged mid-crossfade is followed instead of overridden.
        this.elements.forEach(element => {
            if (element._factor === undefined) return;
            element.volume = element._factor * this.level();
        });
    }

    start() {
        if (this.stopped) return;
        const element = this.elements[this.current];
        element.currentTime = 0;
        this.fade(element, 0, 1, 1400);
        this.play(element);
        this.armHandover(element);
    }

    stop() {
        this.stopped = true;
        this.elements.forEach(element => {
            clearInterval(element._fadeTimer);
            if (element._onTime) element.removeEventListener('timeupdate', element._onTime);
            element.pause();
        });
    }

    /**
     * Watches for the end of the track through timeupdate rather than a
     * timer: duration is not known until the metadata has loaded, and a
     * stalled download would leave a timer firing against a track that is
     * nowhere near finished.
     */
    armHandover(element) {
        const onTime = () => {
            if (this.stopped || !(element.duration > 0)) return;
            if (element.duration - element.currentTime > this.crossfadeMs / 1000) return;
            element.removeEventListener('timeupdate', onTime);
            element._onTime = null;
            this.handover();
        };
        element._onTime = onTime;
        element.addEventListener('timeupdate', onTime);
    }

    handover() {
        if (this.stopped) return;

        const outgoing = this.elements[this.current];
        this.current = 1 - this.current;
        const incoming = this.elements[this.current];

        incoming.currentTime = 0;
        this.fade(incoming, 0, 1, this.crossfadeMs);
        this.play(incoming);
        this.armHandover(incoming);

        this.fade(outgoing, 1, 0, this.crossfadeMs, () => outgoing.pause());
    }

    fade(element, from, to, ms, done) {
        clearInterval(element._fadeTimer);

        const steps = Math.max(1, Math.round(ms / 50));
        let step = 0;

        element._factor = from;
        element.volume = from * this.level();

        element._fadeTimer = setInterval(() => {
            step++;
            const factor = from + (to - from) * (step / steps);
            element._factor = factor;
            element.volume = Math.max(0, Math.min(1, factor * this.level()));

            if (step >= steps) {
                clearInterval(element._fadeTimer);
                element._fadeTimer = null;
                if (done) done();
            }
        }, 50);
    }

    /**
     * A page reached by a link has had no gesture on it yet, and the browser
     * will refuse to play. Rather than give up, wait for the first key or
     * click - which in an arena is the player starting to fight anyway.
     */
    play(element) {
        const promise = element.play();
        if (!promise || !promise.catch) return;
        promise.catch(() => this.waitForGesture());
    }

    waitForGesture() {
        if (this.waitingForGesture || this.stopped) return;
        this.waitingForGesture = true;

        const go = () => {
            window.removeEventListener('pointerdown', go);
            window.removeEventListener('keydown', go);
            this.waitingForGesture = false;
            if (!this.stopped) this.play(this.elements[this.current]);
        };

        window.addEventListener('pointerdown', go);
        window.addEventListener('keydown', go);
    }
}

/**
 * A metallic "ting" for blade-on-blade contact.
 *
 * Synthesised rather than sampled: the project ships no metal impact sound,
 * and a struck-metal timbre is easy to build from a few inharmonic partials
 * over a fast decay - a sampled hit would have meant adding a binary asset.
 */
class MetallicClash {
    constructor() {
        this.ctx = null;

        // Synthesised rather than played through the Audio component, so it
        // never passes the master volume and has to carry it itself. Kept in
        // step by VSAudio.applyVolume.
        this.volume = DEFAULT_VOLUME;
    }

    ensureContext() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            this.ctx = new Ctx();
        }
        // Browsers start the context suspended until a user gesture
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    play() {
        const ctx = this.ensureContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const out = ctx.createGain();
        out.gain.value = 0.35 * this.volume;
        out.connect(ctx.destination);

        // Inharmonic partials are what make metal sound like metal rather
        // than a musical note.
        const partials = [2100, 3170, 4480, 5920];
        partials.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(freq * (0.98 + Math.random() * 0.04), now);

            const peak = 0.5 / (i + 1);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(peak, now + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 - i * 0.07);

            osc.connect(gain);
            gain.connect(out);
            osc.start(now);
            osc.stop(now + 0.5);
        });

        // Short bright transient: the initial "clink" of the impact
        const noise = ctx.createBufferSource();
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        noise.buffer = buffer;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 3800;
        bandpass.Q.value = 0.8;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

        noise.connect(bandpass);
        bandpass.connect(noiseGain);
        noiseGain.connect(out);
        noise.start(now);
    }
}
